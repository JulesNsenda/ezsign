import { Pool, PoolClient } from 'pg';
import { Document, DocumentData, DocumentStatus, ReminderSettings } from '@/models/Document';
import { StorageService } from '@/services/storageService';
import { CleanupService } from '@/services/cleanupService';
import { pdfService } from '@/services/pdfService';
import { WebhookService } from '@/services/webhookService';
import { WebhookPayloadService } from '@/services/webhookPayloadService';
import logger from '@/services/loggerService';

export interface CreateDocumentData {
  userId: string;
  teamId?: string;
  title: string;
  fileBuffer: Buffer;
  originalFilename: string;
}

export interface UpdateDocumentData {
  title?: string;
  status?: DocumentStatus;
  expires_at?: Date | null;
  reminder_settings?: ReminderSettings;
}

export interface DocumentListOptions {
  userId: string;
  teamId?: string;
  status?: DocumentStatus;
  page?: number;
  limit?: number;
  sortBy?: 'created_at' | 'updated_at' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedDocuments {
  documents: Document[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class DocumentService {
  private pool: Pool;
  private storageService: StorageService;
  private cleanupService: CleanupService;
  private webhookService: WebhookService;
  private webhookPayloadService: WebhookPayloadService;

  constructor(pool: Pool, storageService: StorageService) {
    this.pool = pool;
    this.storageService = storageService;
    this.cleanupService = new CleanupService(pool);
    this.webhookService = new WebhookService(pool);
    this.webhookPayloadService = new WebhookPayloadService(pool);
  }

  /**
   * Create a new document
   */
  async createDocument(data: CreateDocumentData): Promise<Document> {
    // Get PDF info
    const pdfInfo = await pdfService.getPdfInfo(data.fileBuffer);

    // Upload file to storage
    const uploadedFile = await this.storageService.uploadFile(
      data.fileBuffer,
      data.originalFilename,
      {
        directory: `documents/${data.userId}`,
        generateUniqueName: true,
      }
    );

    // Insert into database
    const query = `
      INSERT INTO documents (
        user_id, team_id, title, original_filename,
        file_path, file_size, mime_type, page_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, user_id, team_id, title, original_filename,
                file_path, file_size, mime_type, page_count, status,
                workflow_type, created_at, updated_at
    `;

    const values = [
      data.userId,
      data.teamId || null,
      data.title,
      uploadedFile.originalName,
      uploadedFile.storedPath,
      uploadedFile.size,
      uploadedFile.mimeType,
      pdfInfo.pageCount,
    ];

    const result = await this.pool.query<DocumentData>(query, values);

    if (!result.rows[0]) {
      throw new Error('Failed to create document');
    }

    const document = new Document(result.rows[0]);

    // Trigger document.created webhook
    try {
      const payload = await this.webhookPayloadService.buildDocumentPayload(document);
      await this.webhookService.trigger(data.userId, 'document.created', payload);
    } catch (error) {
      logger.warn('Failed to trigger document.created webhook', { error: (error as Error).message, documentId: document.id });
      // Don't fail document creation if webhook fails
    }

    return document;
  }

  /**
   * Find a document by ID
   */
  async findById(id: string, userId: string): Promise<Document | null> {
    const query = `
      SELECT id, user_id, team_id, title, original_filename,
             file_path, file_size, mime_type, page_count, status,
             workflow_type, created_at, updated_at
      FROM documents
      WHERE id = $1 AND user_id = $2
    `;

    const result = await this.pool.query<DocumentData>(query, [id, userId]);

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return new Document(result.rows[0]);
  }

  /**
   * Find documents with pagination and filtering
   */
  async findDocuments(
    options: DocumentListOptions
  ): Promise<PaginatedDocuments> {
    const page = options.page || 1;
    const limit = options.limit || 10;
    const offset = (page - 1) * limit;
    const sortBy = options.sortBy || 'created_at';
    const sortOrder = options.sortOrder || 'desc';

    // Build WHERE clause
    const conditions: string[] = ['user_id = $1'];
    const values: any[] = [options.userId];
    let paramCount = 2;

    if (options.teamId) {
      conditions.push(`team_id = $${paramCount++}`);
      values.push(options.teamId);
    }

    if (options.status) {
      conditions.push(`status = $${paramCount++}`);
      values.push(options.status);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM documents
      WHERE ${whereClause}
    `;

    const countResult = await this.pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0]?.total || '0', 10);

    // Get documents
    const query = `
      SELECT id, user_id, team_id, title, original_filename,
             file_path, file_size, mime_type, page_count, status,
             workflow_type, created_at, updated_at
      FROM documents
      WHERE ${whereClause}
      ORDER BY ${sortBy} ${sortOrder.toUpperCase()}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    values.push(limit, offset);

    const result = await this.pool.query<DocumentData>(query, values);

    const documents = result.rows.map((row) => new Document(row));

    return {
      documents,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update a document
   */
  async updateDocument(
    id: string,
    userId: string,
    data: UpdateDocumentData
  ): Promise<Document | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.title !== undefined) {
      fields.push(`title = $${paramCount++}`);
      values.push(data.title);
    }

    if (data.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(data.status);
    }

    if (data.expires_at !== undefined) {
      fields.push(`expires_at = $${paramCount++}`);
      values.push(data.expires_at);
    }

    if (data.reminder_settings !== undefined) {
      fields.push(`reminder_settings = $${paramCount++}`);
      values.push(JSON.stringify(data.reminder_settings));
    }

    if (fields.length === 0) {
      return this.findById(id, userId);
    }

    values.push(id, userId);

    const query = `
      UPDATE documents
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
      RETURNING id, user_id, team_id, title, original_filename,
                file_path, file_size, mime_type, page_count, status,
                workflow_type, completed_at, created_at, updated_at,
                thumbnail_path, thumbnail_generated_at, is_optimized,
                original_file_size, optimized_at, expires_at, reminder_settings
    `;

    const result = await this.pool.query<DocumentData>(query, values);

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return new Document(result.rows[0]);
  }

  /**
   * Delete a document and all associated files
   */
  async deleteDocument(id: string, userId: string): Promise<boolean> {
    // First, verify the document exists and user has access
    const query = `
      SELECT id, file_path, user_id
      FROM documents
      WHERE id = $1 AND user_id = $2
    `;

    const docResult = await this.pool.query(query, [id, userId]);

    if (docResult.rows.length === 0) {
      return false;
    }

    const doc = docResult.rows[0];
    const client: PoolClient = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Delete from database (cascades to fields, signers, signatures via FK constraints)
      const deleteQuery = `
        DELETE FROM documents
        WHERE id = $1 AND user_id = $2
      `;

      const result = await client.query(deleteQuery, [id, userId]);

      if (result.rowCount === null || result.rowCount === 0) {
        await client.query('ROLLBACK');
        return false;
      }

      await client.query('COMMIT');

      // Delete files after successful DB deletion
      // This is done outside the transaction since file operations can't be rolled back
      try {
        await this.cleanupService.deleteDocumentFiles(id, doc.file_path);
      } catch (error) {
        // Log but don't fail - the DB record is already deleted
        // Orphaned files will be cleaned up by the cleanup worker
        logger.warn('Failed to delete document files', {
          documentId: id,
          filePath: doc.file_path,
          error: (error as Error).message,
        });
      }

      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to delete document', {
        documentId: id,
        error: (error as Error).message,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get document file buffer
   */
  async getDocumentFile(id: string, userId: string): Promise<Buffer | null> {
    const document = await this.findById(id, userId);

    if (!document) {
      return null;
    }

    try {
      return await this.storageService.downloadFile(document.file_path);
    } catch (error) {
      logger.error('Failed to download document file', { error: (error as Error).message, documentId: id });
      return null;
    }
  }

  /**
   * Check if user can access document (owner or team member)
   */
  async canAccessDocument(documentId: string, userId: string): Promise<boolean> {
    const query = `
      SELECT 1
      FROM documents d
      LEFT JOIN team_members tm ON d.team_id = tm.team_id
      WHERE d.id = $1
        AND (d.user_id = $2 OR tm.user_id = $2)
      LIMIT 1
    `;

    const result = await this.pool.query(query, [documentId, userId]);
    return result.rows.length > 0;
  }

  /**
   * Generate thumbnail for document
   */
  async generateThumbnail(
    id: string,
    userId: string,
    options?: { maxWidth?: number; maxHeight?: number }
  ): Promise<Buffer | null> {
    // Verify access
    const canAccess = await this.canAccessDocument(id, userId);
    if (!canAccess) {
      return null;
    }

    // Get document file
    const fileBuffer = await this.getDocumentFile(id, userId);
    if (!fileBuffer) {
      return null;
    }

    // Generate thumbnail
    try {
      return await pdfService.generateThumbnail(fileBuffer, options);
    } catch (error) {
      logger.error('Thumbnail generation error', { error: (error as Error).message, documentId: id });
      return null;
    }
  }
}
