import { Pool } from 'pg';
import { Field, CreateFieldData, UpdateFieldData, FieldData } from '@/models/Field';
import { PdfService } from '@/services/pdfService';

export class FieldService {
  private pdfService: PdfService;
  private pool: Pool;

  constructor(pdfService: PdfService, pool: Pool) {
    this.pdfService = pdfService;
    this.pool = pool;
  }

  /**
   * Create a new field for a document
   */
  async createField(data: CreateFieldData): Promise<Field> {
    // Validate field type
    if (!Field.isValidFieldType(data.type)) {
      throw new Error(`Invalid field type: ${data.type}`);
    }

    // Get document to validate page bounds
    const documentResult = await this.pool.query(
      'SELECT file_path, page_count FROM documents WHERE id = $1',
      [data.document_id]
    );

    if (documentResult.rows.length === 0) {
      throw new Error('Document not found');
    }

    const document = documentResult.rows[0];

    // Validate page number
    if (data.page < 0 || data.page >= document.page_count) {
      throw new Error(
        `Invalid page number: ${data.page}. Document has ${document.page_count} pages (0-indexed)`
      );
    }

    // Get page dimensions from PDF
    const pageDimensions = await this.pdfService.getPageDimensions(
      document.file_path,
      data.page
    );

    // Create temporary field for validation
    const tempField = new Field({
      id: '',
      document_id: data.document_id,
      type: data.type,
      page: data.page,
      x: data.x,
      y: data.y,
      width: data.width,
      height: data.height,
      required: data.required ?? true,
      signer_email: data.signer_email ?? null,
      properties: data.properties ?? Field.getDefaultProperties(data.type),
      visibility_rules: data.visibility_rules ?? null,
      created_at: new Date(),
    });

    // Validate field bounds
    const boundsValidation = tempField.validateBounds(
      pageDimensions.width,
      pageDimensions.height
    );
    if (!boundsValidation.valid) {
      throw new Error(`Field validation failed: ${boundsValidation.errors.join(', ')}`);
    }

    // Validate field properties
    const propsValidation = tempField.validateProperties();
    if (!propsValidation.valid) {
      throw new Error(`Field properties validation failed: ${propsValidation.errors.join(', ')}`);
    }

    // Check minimum size
    if (!tempField.meetsMinimumSize()) {
      const minDims = Field.getMinimumDimensions(data.type);
      throw new Error(
        `Field does not meet minimum size requirements for ${data.type}: ${minDims.width}x${minDims.height} points`
      );
    }

    // Validate signer email if provided
    if (data.signer_email && !Field.isValidFieldType(data.type)) {
      throw new Error('Invalid signer email format');
    }

    // Insert field into database
    const result = await this.pool.query(
      `INSERT INTO fields (document_id, type, page, x, y, width, height, required, signer_email, properties, visibility_rules)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        data.document_id,
        data.type,
        data.page,
        data.x,
        data.y,
        data.width,
        data.height,
        data.required ?? true,
        data.signer_email ?? null,
        data.properties ? JSON.stringify(data.properties) : JSON.stringify(Field.getDefaultProperties(data.type)),
        data.visibility_rules ? JSON.stringify(data.visibility_rules) : null,
      ]
    );

    return new Field(this.mapRowToFieldData(result.rows[0]));
  }

  /**
   * Get all fields for a document
   */
  async getFieldsByDocumentId(documentId: string): Promise<Field[]> {
    const result = await this.pool.query(
      'SELECT * FROM fields WHERE document_id = $1 ORDER BY page, y, x',
      [documentId]
    );

    return result.rows.map((row) => new Field(this.mapRowToFieldData(row)));
  }

  /**
   * Get a single field by ID
   */
  async getFieldById(fieldId: string): Promise<Field | null> {
    const result = await this.pool.query('SELECT * FROM fields WHERE id = $1', [fieldId]);

    if (result.rows.length === 0) {
      return null;
    }

    return new Field(this.mapRowToFieldData(result.rows[0]));
  }

  /**
   * Update a field
   */
  async updateField(fieldId: string, data: UpdateFieldData): Promise<Field> {
    // Get existing field
    const existingField = await this.getFieldById(fieldId);
    if (!existingField) {
      throw new Error('Field not found');
    }

    // If position or dimensions are being updated, validate bounds
    if (
      data.page !== undefined ||
      data.x !== undefined ||
      data.y !== undefined ||
      data.width !== undefined ||
      data.height !== undefined
    ) {
      const documentResult = await this.pool.query(
        'SELECT file_path, page_count FROM documents WHERE id = $1',
        [existingField.document_id]
      );

      if (documentResult.rows.length === 0) {
        throw new Error('Document not found');
      }

      const document = documentResult.rows[0];
      const page = data.page ?? existingField.page;

      // Validate page number
      if (page < 0 || page >= document.page_count) {
        throw new Error(
          `Invalid page number: ${page}. Document has ${document.page_count} pages (0-indexed)`
        );
      }

      // Get page dimensions
      const pageDimensions = await this.pdfService.getPageDimensions(
        document.file_path,
        page
      );

      // Create field with updated values for validation
      const tempField = new Field({
        ...existingField.toJSON(),
        type: data.type ?? existingField.type,
        page,
        x: data.x ?? existingField.x,
        y: data.y ?? existingField.y,
        width: data.width ?? existingField.width,
        height: data.height ?? existingField.height,
      });

      // Validate bounds
      const boundsValidation = tempField.validateBounds(
        pageDimensions.width,
        pageDimensions.height
      );
      if (!boundsValidation.valid) {
        throw new Error(`Field validation failed: ${boundsValidation.errors.join(', ')}`);
      }

      // Check minimum size
      if (!tempField.meetsMinimumSize()) {
        const minDims = Field.getMinimumDimensions(tempField.type);
        throw new Error(
          `Field does not meet minimum size requirements for ${tempField.type}: ${minDims.width}x${minDims.height} points`
        );
      }
    }

    // If properties are being updated, validate them
    if (data.properties !== undefined) {
      const tempField = new Field({
        ...existingField.toJSON(),
        properties: data.properties,
      });

      const propsValidation = tempField.validateProperties();
      if (!propsValidation.valid) {
        throw new Error(`Field properties validation failed: ${propsValidation.errors.join(', ')}`);
      }
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.type !== undefined) {
      if (!Field.isValidFieldType(data.type)) {
        throw new Error(`Invalid field type: ${data.type}`);
      }
      updates.push(`type = $${paramIndex++}`);
      values.push(data.type);
    }
    if (data.page !== undefined) {
      updates.push(`page = $${paramIndex++}`);
      values.push(data.page);
    }
    if (data.x !== undefined) {
      updates.push(`x = $${paramIndex++}`);
      values.push(data.x);
    }
    if (data.y !== undefined) {
      updates.push(`y = $${paramIndex++}`);
      values.push(data.y);
    }
    if (data.width !== undefined) {
      updates.push(`width = $${paramIndex++}`);
      values.push(data.width);
    }
    if (data.height !== undefined) {
      updates.push(`height = $${paramIndex++}`);
      values.push(data.height);
    }
    if (data.required !== undefined) {
      updates.push(`required = $${paramIndex++}`);
      values.push(data.required);
    }
    if (data.signer_email !== undefined) {
      updates.push(`signer_email = $${paramIndex++}`);
      values.push(data.signer_email);
    }
    if (data.properties !== undefined) {
      updates.push(`properties = $${paramIndex++}`);
      values.push(JSON.stringify(data.properties));
    }
    if (data.visibility_rules !== undefined) {
      updates.push(`visibility_rules = $${paramIndex++}`);
      values.push(data.visibility_rules ? JSON.stringify(data.visibility_rules) : null);
    }

    if (updates.length === 0) {
      return existingField;
    }

    values.push(fieldId);

    const result = await this.pool.query(
      `UPDATE fields SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return new Field(this.mapRowToFieldData(result.rows[0]));
  }

  /**
   * Delete a field
   */
  async deleteField(fieldId: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM fields WHERE id = $1', [fieldId]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Bulk create or update fields for a document
   */
  async bulkUpsertFields(
    _documentId: string,
    fields: (CreateFieldData & { id?: string })[]
  ): Promise<Field[]> {
    const results: Field[] = [];

    // Use a transaction for atomic operations
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const fieldData of fields) {
        if (fieldData.id) {
          // Update existing field
          const updated = await this.updateField(fieldData.id, fieldData);
          results.push(updated);
        } else {
          // Create new field
          const created = await this.createField(fieldData);
          results.push(created);
        }
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Validate all fields for a document before sending
   */
  async validateAllFieldsForDocument(documentId: string): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    const fields = await this.getFieldsByDocumentId(documentId);

    if (fields.length === 0) {
      errors.push('Document must have at least one field');
      return { valid: false, errors };
    }

    // Check that all fields have assigned signers
    const fieldsWithoutSigners = fields.filter((f) => !f.hasAssignedSigner());
    if (fieldsWithoutSigners.length > 0) {
      errors.push(
        `${fieldsWithoutSigners.length} field(s) do not have assigned signers`
      );
    }

    // Get document details
    const documentResult = await this.pool.query(
      'SELECT file_path, page_count FROM documents WHERE id = $1',
      [documentId]
    );

    if (documentResult.rows.length === 0) {
      errors.push('Document not found');
      return { valid: false, errors };
    }

    const document = documentResult.rows[0];

    // Validate each field's bounds and properties
    for (const field of fields) {
      // Validate page bounds
      const pageDimensions = await this.pdfService.getPageDimensions(
        document.file_path,
        field.page
      );

      const boundsValidation = field.validateBounds(
        pageDimensions.width,
        pageDimensions.height
      );
      if (!boundsValidation.valid) {
        errors.push(
          `Field ${field.id} on page ${field.page}: ${boundsValidation.errors.join(', ')}`
        );
      }

      // Validate properties
      const propsValidation = field.validateProperties();
      if (!propsValidation.valid) {
        errors.push(
          `Field ${field.id} properties: ${propsValidation.errors.join(', ')}`
        );
      }

      // Check minimum size
      if (!field.meetsMinimumSize()) {
        const minDims = Field.getMinimumDimensions(field.type);
        errors.push(
          `Field ${field.id} does not meet minimum size for ${field.type}: ${minDims.width}x${minDims.height} points`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get fields assigned to a specific signer
   */
  async getFieldsBySignerEmail(
    documentId: string,
    signerEmail: string
  ): Promise<Field[]> {
    const result = await this.pool.query(
      'SELECT * FROM fields WHERE document_id = $1 AND signer_email = $2 ORDER BY page, y, x',
      [documentId, signerEmail]
    );

    return result.rows.map((row) => new Field(this.mapRowToFieldData(row)));
  }

  /**
   * Map database row to FieldData
   */
  private mapRowToFieldData(row: Record<string, any>): FieldData {
    return {
      id: row.id,
      document_id: row.document_id,
      type: row.type,
      page: row.page,
      x: parseFloat(row.x),
      y: parseFloat(row.y),
      width: parseFloat(row.width),
      height: parseFloat(row.height),
      required: row.required,
      signer_email: row.signer_email,
      properties: row.properties,
      visibility_rules: row.visibility_rules,
      created_at: row.created_at,
    };
  }
}
