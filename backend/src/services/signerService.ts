import { Pool } from 'pg';
import { Signer, CreateSignerData, UpdateSignerData, SignerData } from '@/models/Signer';

/**
 * SEC-H3 (pulled forward as an Item 4 dependency): thrown by the
 * document-scoped signer lookups/mutations below when the signer doesn't
 * exist or belongs to a different document. Callers respond 404 - kept
 * distinct from the generic validation `Error`s this service otherwise
 * throws (which callers map to 400), mirroring `SigningContextError` in
 * `signingContextService.ts`.
 */
export class SignerNotFoundError extends Error {
  constructor(message = 'Signer not found') {
    super(message);
    this.name = 'SignerNotFoundError';
  }
}

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
      [data.document_id]
    );

    if (documentResult.rows.length === 0) {
      throw new Error('Document not found');
    }

    const document = documentResult.rows[0];

    // Validate signing order based on workflow type
    if (document.workflow_type === 'sequential' && data.signing_order === null) {
      throw new Error('Sequential workflow requires signing order');
    }

    if (document.workflow_type === 'parallel' && data.signing_order !== null && data.signing_order !== undefined) {
      throw new Error('Parallel workflow should not have signing order');
    }

    // Check for duplicate email in the same document
    const duplicateCheck = await this.pool.query(
      'SELECT id FROM signers WHERE document_id = $1 AND email = $2',
      [data.document_id, data.email]
    );

    if (duplicateCheck.rows.length > 0) {
      throw new Error('Signer with this email already exists for this document');
    }

    // If sequential, check for duplicate signing order
    if (data.signing_order !== null && data.signing_order !== undefined) {
      const orderCheck = await this.pool.query(
        'SELECT id FROM signers WHERE document_id = $1 AND signing_order = $2',
        [data.document_id, data.signing_order]
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
      ]
    );

    return new Signer(this.mapRowToSignerData(result.rows[0]));
  }

  /**
   * Get all signers for a document
   */
  async getSignersByDocumentId(documentId: string): Promise<Signer[]> {
    const result = await this.pool.query(
      'SELECT * FROM signers WHERE document_id = $1 ORDER BY signing_order NULLS LAST, created_at',
      [documentId]
    );

    return result.rows.map((row) => new Signer(this.mapRowToSignerData(row)));
  }

  /**
   * Get a single signer by ID, scoped to the document it must belong to
   * (SEC-H3). Returns `null` - rather than a different tenant's/document's
   * signer - both when the id doesn't exist at all and when it exists but
   * belongs to another document, so the two cases are indistinguishable to
   * a caller probing IDs.
   */
  async getSignerById(signerId: string, documentId: string): Promise<Signer | null> {
    const result = await this.pool.query(
      'SELECT * FROM signers WHERE id = $1 AND document_id = $2',
      [signerId, documentId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return new Signer(this.mapRowToSignerData(result.rows[0]));
  }

  /**
   * Get a signer by access token
   */
  async getSignerByAccessToken(accessToken: string): Promise<Signer | null> {
    const result = await this.pool.query(
      'SELECT * FROM signers WHERE access_token = $1',
      [accessToken]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return new Signer(this.mapRowToSignerData(result.rows[0]));
  }

  /**
   * Update a signer, scoped to the document it must belong to (SEC-H3).
   */
  async updateSigner(signerId: string, documentId: string, data: UpdateSignerData): Promise<Signer> {
    // Get existing signer, scoped to this document
    const existingSigner = await this.getSignerById(signerId, documentId);
    if (!existingSigner) {
      throw new SignerNotFoundError();
    }

    // SEC-H3: signing_order/status can rewrite the sequential signing order
    // or force a signature state - restrict both to documents still in
    // draft, mirroring `Document.canEdit()`. Otherwise a signer with access
    // to their own (unrelated) draft document could target another
    // document's pending signer, e.g. `{"signing_order": 0}` to jump the
    // sequential queue or `{"status": "signed"}` to force completion.
    if (data.signing_order !== undefined || data.status !== undefined) {
      const documentResult = await this.pool.query(
        'SELECT status FROM documents WHERE id = $1',
        [documentId]
      );
      if (documentResult.rows[0]?.status !== 'draft') {
        throw new Error('Signing order and status can only be changed while the document is still in draft');
      }
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
        [existingSigner.document_id, data.email, signerId]
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
        [existingSigner.document_id, data.signing_order, signerId]
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

    values.push(signerId, documentId);

    const result = await this.pool.query(
      `UPDATE signers SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} AND document_id = $${paramIndex + 1} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new SignerNotFoundError();
    }

    return new Signer(this.mapRowToSignerData(result.rows[0]));
  }

  /**
   * Delete a signer, scoped to the document it must belong to (SEC-H3).
   * Returns `false` (not found) for a signer that exists but belongs to a
   * different document - the caller already treats a `false` return as 404.
   */
  async deleteSigner(signerId: string, documentId: string): Promise<boolean> {
    // Also update fields assigned to this signer
    const signer = await this.getSignerById(signerId, documentId);
    if (!signer) {
      return false;
    }

    await this.pool.query(
      'UPDATE fields SET signer_email = NULL WHERE document_id = $1 AND signer_email = $2',
      [signer.document_id, signer.email]
    );

    const result = await this.pool.query(
      'DELETE FROM signers WHERE id = $1 AND document_id = $2',
      [signerId, documentId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Mark signer as signed
   *
   * Note: unused in the app today (the actual signing write path is
   * `signingController.submitSignature`, which updates `signers` directly) -
   * kept as a document-unscoped raw lookup rather than widened to take
   * `documentId` for SEC-H3, since that scoping is for the routes in
   * `signerController`/`documentRoutes.ts`, not this dead call path.
   */
  async markAsSigned(
    signerId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<Signer> {
    const signerResult = await this.pool.query('SELECT * FROM signers WHERE id = $1', [signerId]);
    if (signerResult.rows.length === 0) {
      throw new Error('Signer not found');
    }
    const signer = new Signer(this.mapRowToSignerData(signerResult.rows[0]));

    if (!signer.canSign()) {
      throw new Error('Signer cannot sign in current state');
    }

    const result = await this.pool.query(
      `UPDATE signers
       SET status = 'signed', signed_at = CURRENT_TIMESTAMP, ip_address = $1, user_agent = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [ipAddress ?? null, userAgent ?? null, signerId]
    );

    return new Signer(this.mapRowToSignerData(result.rows[0]));
  }

  /**
   * Validate signing order for sequential workflow, scoped to the document
   * the signer must belong to (SEC-H3).
   * Returns true if this signer can sign now
   */
  async canSignInSequentialWorkflow(signerId: string, documentId: string): Promise<{
    canSign: boolean;
    reason?: string;
  }> {
    const signer = await this.getSignerById(signerId, documentId);
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
        (s) => s.signing_order !== null && s.signing_order < signer.signing_order!
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
      [documentId]
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
          `Sequential workflow requires all signers to have signing order (${signersWithoutOrder.length} missing)`
        );
      }

      // Check that signing orders are consecutive starting from 0
      const orders = signers
        .map((s) => s.signing_order)
        .filter((o) => o !== null)
        .sort((a, b) => a! - b!);

      for (let i = 0; i < orders.length; i++) {
        if (orders[i] !== i) {
          errors.push(
            `Sequential workflow requires consecutive signing orders starting from 0 (found gap at ${i})`
          );
          break;
        }
      }
    } else if (workflowType === 'parallel') {
      // Check that no signers have signing orders
      const signersWithOrder = signers.filter((s) => s.signing_order !== null);
      if (signersWithOrder.length > 0) {
        errors.push(
          `Parallel workflow should not have signing orders (${signersWithOrder.length} have orders)`
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
        [documentId, signer.email]
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
   * Assign fields to a signer by updating signer_email, scoped to the
   * document the signer must belong to (SEC-H3) - this is the write path
   * onto `fields.signer_email`, the column Item 4 made security-critical.
   */
  async assignFieldsToSigner(
    signerId: string,
    documentId: string,
    fieldIds: string[]
  ): Promise<void> {
    const signer = await this.getSignerById(signerId, documentId);
    if (!signer) {
      throw new SignerNotFoundError();
    }

    // Validate that all fields belong to the same document
    for (const fieldId of fieldIds) {
      const fieldResult = await this.pool.query(
        'SELECT document_id FROM fields WHERE id = $1',
        [fieldId]
      );

      if (fieldResult.rows.length === 0) {
        throw new Error(`Field ${fieldId} not found`);
      }

      if (fieldResult.rows[0].document_id !== signer.document_id) {
        throw new Error(`Field ${fieldId} does not belong to the same document`);
      }
    }

    // Update fields with signer email, scoped to the document as
    // defence-in-depth alongside the per-field check above.
    await this.pool.query(
      'UPDATE fields SET signer_email = $1 WHERE id = ANY($2::uuid[]) AND document_id = $3',
      [signer.email, fieldIds, signer.document_id]
    );
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
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_reminder_sent_at: row.last_reminder_sent_at,
      reminder_count: row.reminder_count,
    };
  }
}
