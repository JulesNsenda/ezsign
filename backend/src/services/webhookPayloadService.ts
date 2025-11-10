/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';
import { Document } from '@/models/Document';

/**
 * WebhookPayloadService
 * Formats webhook payloads according to PRD specification
 */
export class WebhookPayloadService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Build document webhook payload
   */
  async buildDocumentPayload(document: Document): Promise<Record<string, any>> {
    // Get signers for the document
    const signersResult = await this.pool.query(
      `SELECT id, document_id, name, email, status, signing_order, signed_at
       FROM signers
       WHERE document_id = $1
       ORDER BY signing_order ASC NULLS LAST`,
      [document.id],
    );

    const signers = signersResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      status: row.status,
      order: row.signing_order,
      signed_at: row.signed_at,
    }));

    return {
      document: {
        id: document.id,
        title: document.title,
        status: document.status,
        workflow_type: document.workflow_type,
        page_count: document.page_count,
        created_at: document.created_at,
        updated_at: document.updated_at,
      },
      signers,
    };
  }

  /**
   * Build signer-specific webhook payload
   */
  async buildSignerPayload(documentId: string, signerId: string): Promise<Record<string, any>> {
    // Get document
    const docResult = await this.pool.query(
      `SELECT id, user_id, title, status, workflow_type, page_count, created_at, updated_at
       FROM documents
       WHERE id = $1`,
      [documentId],
    );

    if (docResult.rows.length === 0) {
      throw new Error('Document not found');
    }

    const document = docResult.rows[0];

    // Get all signers
    const signersResult = await this.pool.query(
      `SELECT id, document_id, name, email, status, signing_order, signed_at
       FROM signers
       WHERE document_id = $1
       ORDER BY signing_order ASC NULLS LAST`,
      [documentId],
    );

    const signers = signersResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      status: row.status,
      order: row.signing_order,
      signed_at: row.signed_at,
    }));

    // Find the specific signer
    const signer = signersResult.rows.find((s) => s.id === signerId);

    return {
      document: {
        id: document.id,
        title: document.title,
        status: document.status,
        workflow_type: document.workflow_type,
        page_count: document.page_count,
        created_at: document.created_at,
        updated_at: document.updated_at,
      },
      signers,
      signer: signer
        ? {
            id: signer.id,
            name: signer.name,
            email: signer.email,
            status: signer.status,
            order: signer.signing_order,
            signed_at: signer.signed_at,
          }
        : null,
    };
  }
}
