/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions */
import { Pool } from 'pg';
import {
  Template,
  UpdateTemplateData,
  TemplateData,
  TemplateField,
  TemplateFieldData,
} from '@/models/Template';
import { StorageService } from '@/services/storageService';
import { PdfService } from '@/services/pdfService';

export class TemplateService {
  private pool: Pool;
  private storageService: StorageService;

  constructor(pool: Pool, storageService: StorageService, _pdfService: PdfService) {
    this.pool = pool;
    this.storageService = storageService;
  }

  /**
   * Create a template from an existing document
   */
  async createTemplateFromDocument(
    documentId: string,
    userId: string,
    templateData: { name: string; description?: string; team_id?: string | null },
  ): Promise<{ template: Template; fields: TemplateField[] }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get the document
      const docResult = await client.query(
        'SELECT * FROM documents WHERE id = $1 AND user_id = $2',
        [documentId, userId],
      );

      if (docResult.rows.length === 0) {
        throw new Error('Document not found or access denied');
      }

      const document = docResult.rows[0];

      // Copy the document file to templates directory
      const originalBuffer = await this.storageService.downloadFile(document.file_path);
      const templateFileName = `template_${Date.now()}_${document.original_filename}`;
      const templateFilePath = await this.storageService.uploadFile(
        originalBuffer,
        templateFileName,
        { directory: 'templates' },
      );

      // Create template
      const templateResult = await client.query(
        `INSERT INTO templates (user_id, team_id, name, description, original_document_id, file_path, file_size, mime_type, page_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          userId,
          templateData.team_id || null,
          templateData.name,
          templateData.description || null,
          documentId,
          templateFilePath,
          document.file_size,
          document.mime_type,
          document.page_count,
        ],
      );

      const template = new Template(this.mapRowToTemplateData(templateResult.rows[0]));

      // Copy fields from document to template
      const fieldsResult = await client.query('SELECT * FROM fields WHERE document_id = $1', [
        documentId,
      ]);

      const templateFields: TemplateField[] = [];
      for (const fieldRow of fieldsResult.rows) {
        const templateFieldResult = await client.query(
          `INSERT INTO template_fields (template_id, type, page, x, y, width, height, required, signer_role, properties)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            template.id,
            fieldRow.type,
            fieldRow.page,
            fieldRow.x,
            fieldRow.y,
            fieldRow.width,
            fieldRow.height,
            fieldRow.required,
            fieldRow.signer_email, // Map signer_email to signer_role
            fieldRow.properties,
          ],
        );
        templateFields.push(
          new TemplateField(this.mapRowToTemplateFieldData(templateFieldResult.rows[0])),
        );
      }

      await client.query('COMMIT');
      return { template, fields: templateFields };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create a document from a template
   */
  async createDocumentFromTemplate(
    templateId: string,
    userId: string,
    documentData: { title: string; team_id?: string | null; workflow_type?: string },
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get the template
      const template = await this.getTemplateById(templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      // Check access
      const userTeams = await this.getUserTeamIds(userId);
      if (!template.canUserAccess(userId, userTeams)) {
        throw new Error('Access denied to this template');
      }

      // Copy the template file to documents directory
      const templateBuffer = await this.storageService.downloadFile(template.file_path);
      const documentFileName = `doc_${Date.now()}_from_template_${template.name}.pdf`;
      const uploadedFile = await this.storageService.uploadFile(templateBuffer, documentFileName, {
        directory: 'documents',
      });

      // Create document
      const documentResult = await client.query(
        `INSERT INTO documents (user_id, team_id, title, original_filename, file_path, file_size, mime_type, page_count, status, workflow_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9)
         RETURNING *`,
        [
          userId,
          documentData.team_id || null,
          documentData.title,
          `${template.name}.pdf`,
          uploadedFile.storedPath,
          uploadedFile.size,
          uploadedFile.mimeType,
          template.page_count,
          documentData.workflow_type || 'single',
        ],
      );

      const documentId = documentResult.rows[0].id;

      // Copy template fields to document fields
      const templateFields = await this.getTemplateFields(templateId);
      for (const templateField of templateFields) {
        await client.query(
          `INSERT INTO fields (document_id, type, page, x, y, width, height, required, signer_email, properties)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            documentId,
            templateField.type,
            templateField.page,
            templateField.x,
            templateField.y,
            templateField.width,
            templateField.height,
            templateField.required,
            null, // signer_email will be assigned later
            templateField.properties,
          ],
        );
      }

      await client.query('COMMIT');
      return documentId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all templates for a user
   */
  async getTemplates(
    userId: string,
    options?: {
      teamId?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ templates: Template[]; total: number }> {
    const userTeams = await this.getUserTeamIds(userId);

    let query = `
      SELECT * FROM templates
      WHERE user_id = $1 OR team_id = ANY($2::uuid[])
    `;
    const params: any[] = [userId, userTeams];
    let paramIndex = 3;

    if (options?.teamId) {
      query += ` AND team_id = $${paramIndex}`;
      params.push(options.teamId);
      paramIndex++;
    }

    // Get total count
    const countResult = await this.pool.query(query.replace('SELECT *', 'SELECT COUNT(*)'), params);
    const total = parseInt(countResult.rows[0].count);

    // Get templates with pagination
    query += ` ORDER BY created_at DESC`;
    if (options?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
      paramIndex++;
    }
    if (options?.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(options.offset);
    }

    const result = await this.pool.query(query, params);
    const templates = result.rows.map((row) => new Template(this.mapRowToTemplateData(row)));

    return { templates, total };
  }

  /**
   * Get a single template by ID
   */
  async getTemplateById(templateId: string): Promise<Template | null> {
    const result = await this.pool.query('SELECT * FROM templates WHERE id = $1', [templateId]);

    if (result.rows.length === 0) {
      return null;
    }

    return new Template(this.mapRowToTemplateData(result.rows[0]));
  }

  /**
   * Get template fields
   */
  async getTemplateFields(templateId: string): Promise<TemplateField[]> {
    const result = await this.pool.query(
      'SELECT * FROM template_fields WHERE template_id = $1 ORDER BY page, y, x',
      [templateId],
    );

    return result.rows.map((row) => new TemplateField(this.mapRowToTemplateFieldData(row)));
  }

  /**
   * Update a template
   */
  async updateTemplate(
    templateId: string,
    userId: string,
    data: UpdateTemplateData,
  ): Promise<Template> {
    const template = await this.getTemplateById(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    if (!template.canUserEdit(userId)) {
      throw new Error('Access denied');
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.team_id !== undefined) {
      updates.push(`team_id = $${paramIndex++}`);
      values.push(data.team_id);
    }

    if (updates.length === 0) {
      return template;
    }

    values.push(templateId);

    const result = await this.pool.query(
      `UPDATE templates SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    return new Template(this.mapRowToTemplateData(result.rows[0]));
  }

  /**
   * Delete a template
   */
  async deleteTemplate(templateId: string, userId: string): Promise<boolean> {
    const template = await this.getTemplateById(templateId);
    if (!template) {
      return false;
    }

    if (!template.canUserDelete(userId)) {
      throw new Error('Access denied');
    }

    // Delete the file
    try {
      await this.storageService.deleteFile(template.file_path);
    } catch (error) {
      // Log error but don't fail the delete operation
      console.error('Failed to delete template file:', error);
    }

    // Delete from database (cascade will delete template_fields)
    const result = await this.pool.query('DELETE FROM templates WHERE id = $1', [templateId]);

    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Get user's team IDs
   */
  private async getUserTeamIds(userId: string): Promise<string[]> {
    const result = await this.pool.query('SELECT team_id FROM team_members WHERE user_id = $1', [
      userId,
    ]);
    return result.rows.map((row) => row.team_id);
  }

  /**
   * Map database row to TemplateData
   */
  private mapRowToTemplateData(row: Record<string, any>): TemplateData {
    // Parse file_path if it's a JSON object
    let filePath = row.file_path;
    if (typeof filePath === 'object' && filePath !== null) {
      // If it's already an object (PostgreSQL JSONB), extract storedPath
      filePath = filePath.storedPath || filePath.file_path || filePath;
    } else if (typeof filePath === 'string') {
      try {
        // Try to parse as JSON string
        const parsed = JSON.parse(filePath);
        filePath = parsed.storedPath || parsed.file_path || filePath;
      } catch {
        // If parsing fails, it's already a plain string path
      }
    }

    return {
      id: row.id,
      user_id: row.user_id,
      team_id: row.team_id,
      name: row.name,
      description: row.description,
      original_document_id: row.original_document_id,
      file_path: filePath,
      file_size: parseInt(row.file_size),
      mime_type: row.mime_type,
      page_count: row.page_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Map database row to TemplateFieldData
   */
  private mapRowToTemplateFieldData(row: Record<string, any>): TemplateFieldData {
    return {
      id: row.id,
      template_id: row.template_id,
      type: row.type,
      page: row.page,
      x: parseFloat(row.x),
      y: parseFloat(row.y),
      width: parseFloat(row.width),
      height: parseFloat(row.height),
      required: row.required,
      signer_role: row.signer_role,
      properties: row.properties,
      created_at: row.created_at,
    };
  }
}
