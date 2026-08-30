import { Pool } from 'pg';
import { Request, Response } from 'express';
import { SigningController } from '@/controllers/signingController';
import { AuditService } from '@/services/auditService';
import { EmailService } from '@/services/emailService';
import { PdfService } from '@/services/pdfService';
import { StorageService } from '@/services/storageService';

/**
 * Integration coverage for Item 3 (see
 * docs/plans/2026-08-23-envelope-activity-log-and-email-templates.md).
 *
 * Two things here cannot be proven against a mocked pool, which is why this
 * suite exists rather than more cases in `signingController.test.ts`:
 *
 * 1. **The `viewed` dedup is a database race, not a code branch.** The emit
 *    is gated on `UPDATE signers SET viewed_at = CURRENT_TIMESTAMP WHERE id
 *    = $1 AND viewed_at IS NULL RETURNING id` returning a row. A mock
 *    returns whatever it was told to regardless of the predicate, so a unit
 *    test asserting "the UPDATE was called" would pass just as happily
 *    against an implementation with no dedup at all.
 * 2. **Every event type has to survive `audit_events_event_type_check`.**
 *    `recordEvent` swallows its own failures by design, so a value the CHECK
 *    rejects produces no error and no row - BUG-1 with the 500 removed. The
 *    only way to catch that is to insert against the real constraint.
 */
describe('Document lifecycle audit events (real DB)', () => {
  let pool: Pool;
  let auditService: AuditService;
  let testUserId: string;
  let testDocumentId: string;
  let testSignerId: string;

  const testEmail = 'test-lifecycle-audit@example.com';
  const signingToken = 'lifecycle-audit-test-token';

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
    });
    auditService = new AuditService(pool);

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
      [testUserId, 'Lifecycle Audit Test Document', 'test.pdf', 'documents/test.pdf', 1024, 'application/pdf']
    );
    testDocumentId = documentResult.rows[0].id;

    const signerResult = await pool.query(
      `INSERT INTO signers (document_id, email, name, status, access_token)
       VALUES ($1, $2, $3, 'pending', $4)
       RETURNING id`,
      [testDocumentId, 'lifecycle-signer@example.com', 'Lifecycle Signer', signingToken]
    );
    testSignerId = signerResult.rows[0].id;
  });

  afterAll(async () => {
    if (!pool) return;
    try {
      const userLookup = await pool.query('SELECT id FROM users WHERE email = $1', [testEmail]);
      const userId = testUserId || userLookup.rows[0]?.id;
      if (userId) {
        await pool.query(
          'DELETE FROM audit_events WHERE user_id = $1 OR document_id IN (SELECT id FROM documents WHERE user_id = $1)',
          [userId]
        );
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

  beforeEach(async () => {
    await pool.query('DELETE FROM audit_events WHERE document_id = $1', [testDocumentId]);
    await pool.query('UPDATE signers SET viewed_at = NULL WHERE id = $1', [testSignerId]);
  });

  describe('recordEvent against the real CHECK constraint', () => {
    // The seven the plan names, minus `downloaded` (deferred - both download
    // routes double as the PDF *viewer* source, so emitting there would log
    // a download on every page render). Asserting each one persists is what
    // makes `recordEvent`'s swallow-and-warn safe: a type the constraint
    // rejects would otherwise vanish without a trace.
    const lifecycleEvents = ['created', 'sent', 'viewed', 'signed', 'completed', 'cancelled'] as const;

    it('permits the admin.activity_viewed system event', async () => {
      // Added by Item 4 so a privileged cross-tenant read of the trail shows
      // up in the trail. `recordEvent` swallows a CHECK rejection, so without
      // this the event would vanish silently.
      const recorded = await auditService.recordEvent({
        document_id: testDocumentId,
        user_id: testUserId,
        event_type: 'admin.activity_viewed',
      });

      expect(recorded).toBe(true);
    });

    it.each(lifecycleEvents)('persists a %s event rather than silently swallowing it', async (eventType) => {
      const recorded = await auditService.recordEvent({
        document_id: testDocumentId,
        user_id: testUserId,
        event_type: eventType,
        ip_address: '127.0.0.1',
        user_agent: 'integration-test',
      });

      expect(recorded).toBe(true);
      const rows = await pool.query(
        'SELECT event_type FROM audit_events WHERE document_id = $1 AND event_type = $2',
        [testDocumentId, eventType]
      );
      expect(rows.rows).toHaveLength(1);
    });

    it('reports failure without throwing when the event type is rejected', async () => {
      await expect(
        auditService.recordEvent({
          document_id: testDocumentId,
          user_id: testUserId,
          // Not in the CHECK list. The whole point of `recordEvent` is that
          // the operation being audited has already succeeded, so this must
          // not propagate - BUG-1 was exactly this insert throwing a 500
          // after the email had already gone out. It must still report the
          // loss, so a caller that burned a one-shot gate can release it.
          event_type: 'not_a_real_event_type' as never,
        })
      ).resolves.toBe(false);

      const rows = await pool.query('SELECT id FROM audit_events WHERE document_id = $1', [testDocumentId]);
      expect(rows.rows).toHaveLength(0);
    });

    it('stores a zone-suffixed IPv6 address, capped to the column width', async () => {
      // `audit_events.ip_address` is varchar(45). A zone suffix is a
      // legitimate thing for `req.ip` to carry and can overrun it, and
      // because recordEvent swallows failures the row would just never
      // appear rather than erroring.
      const zonedIpv6 = '2001:0db8:0000:0000:0000:ff00:0042:8329%enp0s31f6longzone';
      await auditService.recordEvent({
        document_id: testDocumentId,
        user_id: testUserId,
        event_type: 'viewed',
        ip_address: zonedIpv6,
      });

      const rows = await pool.query(
        'SELECT ip_address FROM audit_events WHERE document_id = $1',
        [testDocumentId]
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].ip_address).toBe(zonedIpv6.slice(0, 45));
    });

    it('records NULL rather than a fabricated ip_address', async () => {
      // `proxy-addr` does not validate X-Forwarded-For entries, so whenever
      // the trusted hop count exceeds the real one `req.ip` is arbitrary
      // client-supplied text. Storing 45 characters of it verbatim would put
      // an attacker-chosen "IP" into a signing product's audit trail; NULL
      // reads as "not recorded", which is the honest answer.
      await auditService.recordEvent({
        document_id: testDocumentId,
        user_id: testUserId,
        event_type: 'viewed',
        ip_address: 'not-an-ip-<script>alert(1)</script>',
      });

      const rows = await pool.query(
        'SELECT ip_address FROM audit_events WHERE document_id = $1',
        [testDocumentId]
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].ip_address).toBeNull();
    });

    it('caps an oversized user_agent instead of storing it whole', async () => {
      // The column is unbounded `text` and a token holder controls the
      // header, so without a cap each public-route row can carry ~16KB.
      await auditService.recordEvent({
        document_id: testDocumentId,
        user_id: testUserId,
        event_type: 'viewed',
        user_agent: 'U'.repeat(20_000),
      });

      const rows = await pool.query(
        'SELECT user_agent FROM audit_events WHERE document_id = $1',
        [testDocumentId]
      );
      expect(rows.rows[0].user_agent).toHaveLength(512);
    });
  });

  describe('viewed is recorded once per signer, not once per request', () => {
    function makeSigningRequest(): Request {
      return {
        params: { token: signingToken },
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('integration-test-agent'),
      } as unknown as Request;
    }

    function makeResponse(): Response {
      const json = jest.fn();
      return { status: jest.fn().mockReturnValue({ json }), json } as unknown as Response;
    }

    function makeController(): SigningController {
      return new SigningController(
        pool,
        { sendSigningRequest: jest.fn(), sendCompletionNotification: jest.fn() } as unknown as EmailService,
        {} as PdfService,
        {} as unknown as StorageService
      );
    }

    it('writes exactly one viewed row across repeated opens of the same link', async () => {
      const controller = makeController();

      // Three separate opens - the shape of a signer loading the page,
      // refreshing, and a link-preview bot fetching it.
      await controller.getDocumentBySigningToken(makeSigningRequest(), makeResponse());
      await controller.getDocumentBySigningToken(makeSigningRequest(), makeResponse());
      await controller.getDocumentBySigningToken(makeSigningRequest(), makeResponse());

      const rows = await pool.query(
        "SELECT metadata FROM audit_events WHERE document_id = $1 AND event_type = 'viewed'",
        [testDocumentId]
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].metadata.signer_id).toBe(testSignerId);
    });

    it('stamps signers.viewed_at on the first open and leaves it unchanged afterwards', async () => {
      const controller = makeController();

      await controller.getDocumentBySigningToken(makeSigningRequest(), makeResponse());
      const first = await pool.query('SELECT viewed_at FROM signers WHERE id = $1', [testSignerId]);
      expect(first.rows[0].viewed_at).not.toBeNull();

      await controller.getDocumentBySigningToken(makeSigningRequest(), makeResponse());
      const second = await pool.query('SELECT viewed_at FROM signers WHERE id = $1', [testSignerId]);
      // Not merely "still set" - the same instant. A non-conditional UPDATE
      // would keep overwriting it and lose the true first-view time.
      expect(second.rows[0].viewed_at).toEqual(first.rows[0].viewed_at);
    });

    it('emits from only one of several concurrent opens', async () => {
      const controller = makeController();

      // The dedup is a database race, not a code branch: without the
      // `AND viewed_at IS NULL` predicate every one of these would emit.
      await Promise.all(
        Array.from({ length: 5 }, () =>
          controller.getDocumentBySigningToken(makeSigningRequest(), makeResponse())
        )
      );

      const rows = await pool.query(
        "SELECT id FROM audit_events WHERE document_id = $1 AND event_type = 'viewed'",
        [testDocumentId]
      );
      expect(rows.rows).toHaveLength(1);
    });
  });
});
