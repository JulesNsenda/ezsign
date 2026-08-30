import { Pool } from 'pg';
import { SignerController } from '@/controllers/signerController';
import { SignerService } from '@/services/signerService';
import { EmailService } from '@/services/emailService';

/**
 * Integration test for BUG-1 (see docs/plans/2026-08-23-envelope-activity-log-and-email-templates.md):
 * `resendSigningEmail` wrote `event_type = 'signer_reminder_sent'`, a value
 * the `audit_events_event_type_check` constraint rejected outright - the
 * insert threw, the outer catch turned that into a 500, and the caller saw
 * a failure even though the reminder email had already been sent and the
 * reminder counter already incremented.
 *
 * `signerController.test.ts` mocks the pool with a bare `jest.fn()`, so it
 * cannot see a real CHECK constraint reject anything - it is structurally
 * blind to this class of bug (and was, in fact, green while BUG-1 shipped).
 * This test runs the real INSERT against a real database so a regression of
 * either the migration or the try/catch added around it actually fails.
 */
describe('Signer resend - audit event persistence (real DB)', () => {
  let pool: Pool;
  let controller: SignerController;
  let testUserId: string;
  let testDocumentId: string;
  let testSignerId: string;

  const mockEmailService = {
    sendSigningRequest: jest.fn().mockResolvedValue(undefined),
  } as unknown as EmailService;

  const testEmail = 'test-resend-audit@example.com';

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
    });

    const signerService = new SignerService(pool);
    controller = new SignerController(signerService, pool, undefined, mockEmailService);

    // A prior run that threw between this insert and afterAll's cleanup
    // would otherwise leave this row behind and brick every subsequent run
    // on the users unique constraint - delete any leftover before inserting.
    await pool.query('DELETE FROM users WHERE email = $1', [testEmail]);

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, role, email_verified)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [testEmail, 'hashed_password', 'creator', true]
    );
    testUserId = userResult.rows[0].id;

    const documentResult = await pool.query(
      `INSERT INTO documents (user_id, title, original_filename, file_path, file_size, mime_type, status, workflow_type)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'parallel')
       RETURNING id`,
      [testUserId, 'Resend Audit Test Document', 'test.pdf', 'documents/test.pdf', 1024, 'application/pdf']
    );
    testDocumentId = documentResult.rows[0].id;

    const signerResult = await pool.query(
      `INSERT INTO signers (document_id, email, name, status, access_token)
       VALUES ($1, $2, $3, 'pending', $4)
       RETURNING id`,
      [testDocumentId, 'signer@example.com', 'Test Signer', 'resend-audit-test-token']
    );
    testSignerId = signerResult.rows[0].id;
  });

  afterAll(async () => {
    if (!pool) return;
    try {
      // Look the user up by email rather than trusting the testUserId
      // captured during beforeAll: if beforeAll threw partway through (e.g.
      // the document or signer insert failed), testDocumentId/testUserId
      // may be unset even though the user row exists, and cleanup must
      // still find and remove it so the next run isn't bricked on the
      // users unique constraint.
      const userLookup = await pool.query('SELECT id FROM users WHERE email = $1', [testEmail]);
      const userId = testUserId || userLookup.rows[0]?.id;
      if (userId) {
        await pool.query('DELETE FROM audit_events WHERE user_id = $1', [userId]);
        await pool.query(
          'DELETE FROM signers WHERE document_id IN (SELECT id FROM documents WHERE user_id = $1)',
          [userId]
        );
        await pool.query('DELETE FROM documents WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      }
    } finally {
      await pool.end();
    }
  });

  it('persists a signer_reminder_sent audit row and returns 200', async () => {
    const mockRequest: any = {
      user: { userId: testUserId, email: testEmail },
      params: { id: testDocumentId, signerId: testSignerId },
      body: {},
      correlationId: 'test-correlation-id',
    };

    const mockResponse: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await controller.resendSigningEmail(mockRequest, mockResponse);

    // Proves 1.3: the outer try/catch around the audit INSERT means a
    // failed (or, pre-migration, constraint-rejected) audit write can never
    // turn a successful resend into a 500 for the caller - this assertion
    // alone would still pass even with the migration reverted, because the
    // guard swallows the violation either way.
    expect(mockResponse.status).toHaveBeenCalledWith(200);

    const auditRows = await pool.query(
      `SELECT event_type, document_id, user_id, metadata
       FROM audit_events
       WHERE document_id = $1 AND event_type = 'signer_reminder_sent'`,
      [testDocumentId]
    );

    // Proves 1.1: the row actually persisted, i.e. the CHECK constraint
    // accepts 'signer_reminder_sent'. Revert the migration and this
    // assertion is the one that fails.
    expect(auditRows.rows).toHaveLength(1);
    expect(auditRows.rows[0].user_id).toBe(testUserId);
    expect(auditRows.rows[0].metadata.signer_id).toBe(testSignerId);
  });
});
