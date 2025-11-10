/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { Pool } from 'pg';
import { Document, DocumentData, DocumentStatus } from '@/models/Document';
import { StorageService } from '@/services/storageService';
import { pdfService } from '@/services/pdfService';
import { WebhookService } from '@/services/webhookService';
import { WebhookPayloadService } from '@/services/webhookPayloadService';

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
  private webhookService: WebhookService;
  private webhookPayloadService: WebhookPayloadService;

  constructor(pool: Pool, storageService: StorageService) {
    this.pool = pool;
    this.storageService = storageService;
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
      },
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
      console.error('Failed to trigger document.created webhook:', error);
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
  async findDocuments(options: DocumentListOptions): Promise<PaginatedDocuments> {
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
    data: UpdateDocumentData,
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

    if (fields.length === 0) {
      return this.findById(id, userId);
    }

    values.push(id, userId);

    const query = `
      UPDATE documents
      SET ${fields.join(', ')}
      WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
      RETURNING id, user_id, team_id, title, original_filename,
                file_path, file_size, mime_type, page_count, status,
                workflow_type, created_at, updated_at
    `;

    const result = await this.pool.query<DocumentData>(query, values);

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return new Document(result.rows[0]);
  }

  /**
   * Delete a document
   */
  async deleteDocument(id: string, userId: string): Promise<boolean> {
    // First, get the document to retrieve the file path
    const document = await this.findById(id, userId);

    if (!document) {
      return false;
    }

    // Delete the file from storage
    try {
      await this.storageService.deleteFile(document.file_path);
    } catch (error) {
      console.error('Failed to delete file from storage:', error);
      // Continue with database deletion even if file deletion fails
    }

    // Delete from database
    const query = `
      DELETE FROM documents
      WHERE id = $1 AND user_id = $2
    `;

    const result = await this.pool.query(query, [id, userId]);

    return result.rowCount !== null && result.rowCount > 0;
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
      console.error('Failed to download document file:', error);
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
    options?: { maxWidth?: number; maxHeight?: number },
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
      console.error('Thumbnail generation error:', error);
      return null;
    }
  }
}
