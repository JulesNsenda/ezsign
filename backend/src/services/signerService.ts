/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/restrict-template-expressions */
import { Pool } from 'pg';
import { Signer, CreateSignerData, UpdateSignerData, SignerData } from '@/models/Signer';

export class SignerService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }
  /**
   * Create a new signer for a document
   */
  async createSigner(data: CreateSignerData): Promise<Signer> {
    // Validate email
    if (!Signer.isValidEmail(data.email)) {
      throw new Error('Invalid email format');
    }

    // Validate signing order
    if (!Signer.isValidSigningOrder(data.signing_order ?? null)) {
      throw new Error('Invalid signing order');
    }

    // Check if document exists
    const documentResult = await this.pool.query(
      'SELECT id, workflow_type FROM documents WHERE id = $1',
      [data.document_id],
    );

    if (documentResult.rows.length === 0) {
      throw new Error('Document not found');
    }

    const document = documentResult.rows[0];

    // Validate signing order based on workflow type
    if (document.workflow_type === 'sequential' && data.signing_order === null) {
      throw new Error('Sequential workflow requires signing order');
    }

    if (
      document.workflow_type === 'parallel' &&
      data.signing_order !== null &&
      data.signing_order !== undefined
    ) {
      throw new Error('Parallel workflow should not have signing order');
    }

    // Check for duplicate email in the same document
    const duplicateCheck = await this.pool.query(
      'SELECT id FROM signers WHERE document_id = $1 AND email = $2',
      [data.document_id, data.email],
    );

    if (duplicateCheck.rows.length > 0) {
      throw new Error('Signer with this email already exists for this document');
    }

    // If sequential, check for duplicate signing order
    if (data.signing_order !== null && data.signing_order !== undefined) {
      const orderCheck = await this.pool.query(
        'SELECT id FROM signers WHERE document_id = $1 AND signing_order = $2',
        [data.document_id, data.signing_order],
      );

      if (orderCheck.rows.length > 0) {
        throw new Error('Signing order already assigned to another signer');
      }
    }

    // Generate access token
    const accessToken = Signer.generateAccessToken();

    // Insert signer
    const result = await this.pool.query(
      `INSERT INTO signers (document_id, email, name, signing_order, status, access_token)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.document_id,
        data.email,
        data.name,
        data.signing_order ?? null,
        data.status ?? 'pending',
        accessToken,
      ],
    );

    return new Signer(this.mapRowToSignerData(result.rows[0]));
  }

  /**
   * Get all signers for a document
   */
  async getSignersByDocumentId(documentId: string): Promise<Signer[]> {
    const result = await this.pool.query(
      'SELECT * FROM signers WHERE document_id = $1 ORDER BY signing_order NULLS LAST, created_at',
      [documentId],
    );

    return result.rows.map((row) => new Signer(this.mapRowToSignerData(row)));
  }

  /**
   * Get a single signer by ID
   */
  async getSignerById(signerId: string): Promise<Signer | null> {
    const result = await this.pool.query('SELECT * FROM signers WHERE id = $1', [signerId]);

    if (result.rows.length === 0) {
      return null;
    }

    return new Signer(this.mapRowToSignerData(result.rows[0]));
  }

  /**
   * Get a signer by access token
   */
  async getSignerByAccessToken(accessToken: string): Promise<Signer | null> {
    const result = await this.pool.query('SELECT * FROM signers WHERE access_token = $1', [
      accessToken,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    return new Signer(this.mapRowToSignerData(result.rows[0]));
  }

  /**
   * Update a signer
   */
  async updateSigner(signerId: string, data: UpdateSignerData): Promise<Signer> {
    // Get existing signer
    const existingSigner = await this.getSignerById(signerId);
    if (!existingSigner) {
      throw new Error('Signer not found');
    }

    // Validate email if being updated
    if (data.email !== undefined && !Signer.isValidEmail(data.email)) {
      throw new Error('Invalid email format');
    }

    // Validate signing order if being updated
    if (data.signing_order !== undefined && !Signer.isValidSigningOrder(data.signing_order)) {
      throw new Error('Invalid signing order');
    }

    // Check for duplicate email if email is being changed
    if (data.email !== undefined && data.email !== existingSigner.email) {
      const duplicateCheck = await this.pool.query(
        'SELECT id FROM signers WHERE document_id = $1 AND email = $2 AND id != $3',
        [existingSigner.document_id, data.email, signerId],
      );

      if (duplicateCheck.rows.length > 0) {
        throw new Error('Signer with this email already exists for this document');
      }
    }

    // Check for duplicate signing order if order is being changed
    if (
      data.signing_order !== undefined &&
      data.signing_order !== null &&
      data.signing_order !== existingSigner.signing_order
    ) {
      const orderCheck = await this.pool.query(
        'SELECT id FROM signers WHERE document_id = $1 AND signing_order = $2 AND id != $3',
        [existingSigner.document_id, data.signing_order, signerId],
      );

      if (orderCheck.rows.length > 0) {
        throw new Error('Signing order already assigned to another signer');
      }
    }

    // Validate status if being updated
    if (data.status !== undefined && !Signer.isValidStatus(data.status)) {
      throw new Error(`Invalid signer status: ${data.status}`);
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(data.email);
    }
    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.signing_order !== undefined) {
      updates.push(`signing_order = $${paramIndex++}`);
      values.push(data.signing_order);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }

    if (updates.length === 0) {
      return existingSigner;
    }

    values.push(signerId);

    const result = await this.pool.query(
      `UPDATE signers SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    return new Signer(this.mapRowToSignerData(result.rows[0]));
  }

  /**
   * Delete a signer
   */
  async deleteSigner(signerId: string): Promise<boolean> {
    // Also update fields assigned to this signer
    const signer = await this.getSignerById(signerId);
    if (signer) {
      await this.pool.query(
        'UPDATE fields SET signer_email = NULL WHERE document_id = $1 AND signer_email = $2',
        [signer.document_id, signer.email],
      );
    }

    const result = await this.pool.query('DELETE FROM signers WHERE id = $1', [signerId]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Mark signer as signed
   */
  async markAsSigned(signerId: string, ipAddress?: string, userAgent?: string): Promise<Signer> {
    const signer = await this.getSignerById(signerId);
    if (!signer) {
      throw new Error('Signer not found');
    }

    if (!signer.canSign()) {
      throw new Error('Signer cannot sign in current state');
    }

    const result = await this.pool.query(
      `UPDATE signers
       SET status = 'signed', signed_at = CURRENT_TIMESTAMP, ip_address = $1, user_agent = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [ipAddress ?? null, userAgent ?? null, signerId],
    );

    return new Signer(this.mapRowToSignerData(result.rows[0]));
  }

  /**
   * Validate signing order for sequential workflow
   * Returns true if this signer can sign now
   */
  async canSignInSequentialWorkflow(signerId: string): Promise<{
    canSign: boolean;
    reason?: string;
  }> {
    const signer = await this.getSignerById(signerId);
    if (!signer) {
      return { canSign: false, reason: 'Signer not found' };
    }

    // If no signing order, it's not a sequential workflow
    if (signer.signing_order === null) {
      return { canSign: true };
    }

    // Check if signer can already sign (status is pending)
    if (!signer.canSign()) {
      return { canSign: false, reason: `Signer status is ${signer.status}` };
    }

    // Get all signers for the document
    const allSigners = await this.getSignersByDocumentId(signer.document_id);

    // Check if all previous signers have signed
    const canSign = Signer.canSignInSequence(signer, allSigners);

    if (!canSign) {
      const previousSigners = allSigners.filter(
        (s) => s.signing_order !== null && s.signing_order < signer.signing_order!,
      );
      const pendingPrevious = previousSigners.filter((s) => !s.hasSigned());

      return {
        canSign: false,
        reason: `Waiting for ${pendingPrevious.length} previous signer(s) to sign`,
      };
    }

    return { canSign: true };
  }

  /**
   * Validate all signers for a document before sending
   */
  async validateAllSignersForDocument(documentId: string): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    const signers = await this.getSignersByDocumentId(documentId);

    if (signers.length === 0) {
      errors.push('Document must have at least one signer');
      return { valid: false, errors };
    }

    // Get document workflow type
    const documentResult = await this.pool.query(
      'SELECT workflow_type FROM documents WHERE id = $1',
      [documentId],
    );

    if (documentResult.rows.length === 0) {
      errors.push('Document not found');
      return { valid: false, errors };
    }

    const workflowType = documentResult.rows[0].workflow_type;

    // Validate based on workflow type
    if (workflowType === 'sequential') {
      // Check that all signers have signing orders
      const signersWithoutOrder = signers.filter((s) => s.signing_order === null);
      if (signersWithoutOrder.length > 0) {
        errors.push(
          `Sequential workflow requires all signers to have signing order (${signersWithoutOrder.length} missing)`,
        );
      }

      // Check that signing orders are consecutive starting from 0
      const orders = signers
        .map((s) => s.signing_order)
        .filter((o) => o !== null)
        .sort((a, b) => a - b);

      for (let i = 0; i < orders.length; i++) {
        if (orders[i] !== i) {
          errors.push(
            `Sequential workflow requires consecutive signing orders starting from 0 (found gap at ${i})`,
          );
          break;
        }
      }
    } else if (workflowType === 'parallel') {
      // Check that no signers have signing orders
      const signersWithOrder = signers.filter((s) => s.signing_order !== null);
      if (signersWithOrder.length > 0) {
        errors.push(
          `Parallel workflow should not have signing orders (${signersWithOrder.length} have orders)`,
        );
      }
    }

    // Validate email formats
    for (const signer of signers) {
      if (!signer.validateEmail()) {
        errors.push(`Invalid email format for signer: ${signer.email}`);
      }
    }

    // Check that all signers have assigned fields
    for (const signer of signers) {
      const fieldCount = await this.pool.query(
        'SELECT COUNT(*) FROM fields WHERE document_id = $1 AND signer_email = $2',
        [documentId, signer.email],
      );

      if (parseInt(fieldCount.rows[0].count) === 0) {
        errors.push(`Signer ${signer.email} has no assigned fields`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Assign fields to a signer by updating signer_email
   */
  async assignFieldsToSigner(signerId: string, fieldIds: string[]): Promise<void> {
    const signer = await this.getSignerById(signerId);
    if (!signer) {
      throw new Error('Signer not found');
    }

    // Validate that all fields belong to the same document
    for (const fieldId of fieldIds) {
      const fieldResult = await this.pool.query('SELECT document_id FROM fields WHERE id = $1', [
        fieldId,
      ]);

      if (fieldResult.rows.length === 0) {
        throw new Error(`Field ${fieldId} not found`);
      }

      if (fieldResult.rows[0].document_id !== signer.document_id) {
        throw new Error(`Field ${fieldId} does not belong to the same document`);
      }
    }

    // Update fields with signer email
    await this.pool.query('UPDATE fields SET signer_email = $1 WHERE id = ANY($2::uuid[])', [
      signer.email,
      fieldIds,
    ]);
  }

  /**
   * Map database row to SignerData
   */
  private mapRowToSignerData(row: Record<string, any>): SignerData {
    return {
      id: row.id,
      document_id: row.document_id,
      email: row.email,
      name: row.name,
      signing_order: row.signing_order,
      status: row.status,
      access_token: row.access_token,
      signed_at: row.signed_at,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      last_reminder_sent_at: row.last_reminder_sent_at,
      reminder_count: row.reminder_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
