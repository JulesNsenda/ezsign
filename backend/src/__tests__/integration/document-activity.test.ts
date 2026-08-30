import { Pool } from 'pg';
import { createActivityService } from '@/services/activityService';

/**
 * Integration coverage for Item 4 (see
 * docs/plans/2026-08-23-envelope-activity-log-and-email-templates.md).
 *
 * Everything here needs a real database. The service is one `UNION ALL` with
 * a total order and two LEFT JOINs; a mocked pool returns whatever it was
 * told to and would prove none of it. In particular the page-boundary test
 * below is the *only* thing that demonstrates why the ordering carries
 * `kind` and `id` tiebreakers rather than `created_at` alone.
 */
describe('Document activity timeline (real DB)', () => {
  let pool: Pool;
  let activityService: ReturnType<typeof createActivityService>;
  let testUserId: string;
  let otherUserId: string;
  let testDocumentId: string;
  let otherDocumentId: string;
  let testSignerId: string;

  const testEmail = 'test-activity@example.com';
  const otherEmail = 'test-activity-other@example.com';
  const signerEmail = 'activity-signer@example.com';

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
    });
    activityService = createActivityService(pool);

    await pool.query('DELETE FROM users WHERE email = ANY($1)', [[testEmail, otherEmail]]);

    const users = await pool.query(
      `INSERT INTO users (email, password_hash, role, email_verified)
       VALUES ($1, 'x', 'creator', true), ($2, 'x', 'creator', true)
       RETURNING id, email`,
      [testEmail, otherEmail]
    );
    testUserId = users.rows.find((r) => r.email === testEmail).id;
    otherUserId = users.rows.find((r) => r.email === otherEmail).id;

    const docs = await pool.query(
      `INSERT INTO documents (user_id, title, original_filename, file_path, file_size, mime_type, status, workflow_type)
       VALUES ($1, 'Activity Doc', 'a.pdf', 'documents/a.pdf', 1, 'application/pdf', 'pending', 'parallel'),
              ($2, 'Other Doc', 'b.pdf', 'documents/b.pdf', 1, 'application/pdf', 'pending', 'parallel')
       RETURNING id, user_id`,
      [testUserId, otherUserId]
    );
    testDocumentId = docs.rows.find((r) => r.user_id === testUserId).id;
    otherDocumentId = docs.rows.find((r) => r.user_id === otherUserId).id;

    const signer = await pool.query(
      `INSERT INTO signers (document_id, email, name, status, access_token)
       VALUES ($1, $2, 'Activity Signer', 'pending', 'activity-test-token')
       RETURNING id`,
      [testDocumentId, signerEmail]
    );
    testSignerId = signer.rows[0].id;
  });

  afterAll(async () => {
    if (!pool) return;
    try {
      const users = await pool.query('SELECT id FROM users WHERE email = ANY($1)', [
        [testEmail, otherEmail],
      ]);
      const ids = users.rows.map((r) => r.id);
      if (ids.length > 0) {
        await pool.query(
          'DELETE FROM audit_events WHERE user_id = ANY($1) OR document_id IN (SELECT id FROM documents WHERE user_id = ANY($1))',
          [ids]
        );
        await pool.query(
          'DELETE FROM email_logs WHERE user_id = ANY($1) OR document_id IN (SELECT id FROM documents WHERE user_id = ANY($1))',
          [ids]
        );
        await pool.query(
          'DELETE FROM signers WHERE document_id IN (SELECT id FROM documents WHERE user_id = ANY($1))',
          [ids]
        );
        await pool.query('DELETE FROM documents WHERE user_id = ANY($1)', [ids]);
        await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
      }
    } finally {
      await pool.end();
    }
  });

  beforeEach(async () => {
    // Scoped to this suite's own rows. `document_id IS NULL` alone would
    // delete every instance-level audit row in the shared test database and
    // make any suite asserting on `settings.updated` order-dependently flaky.
    await pool.query(
      'DELETE FROM audit_events WHERE document_id = $1 OR (document_id IS NULL AND user_id = $2)',
      [testDocumentId, testUserId]
    );
    await pool.query('DELETE FROM email_logs WHERE document_id = $1', [testDocumentId]);
  });

  const insertAudit = (eventType: string, at: string, metadata: object | null = null) =>
    pool.query(
      `INSERT INTO audit_events (document_id, user_id, event_type, ip_address, user_agent, metadata, created_at)
       VALUES ($1, $2, $3, '198.51.100.9', 'secret-agent/1.0', $4, $5)`,
      [testDocumentId, testUserId, eventType, metadata ? JSON.stringify(metadata) : null, at]
    );

  const insertEmail = (
    emailType: string,
    at: string,
    overrides: { status?: string; error?: string | null; signerId?: string | null } = {}
  ) =>
    pool.query(
      `INSERT INTO email_logs (document_id, signer_id, user_id, recipient_email, email_type, subject, status, error_message, created_at)
       VALUES ($1, $2, $3, $4, $5, 'Please sign', $6, $7, $8)`,
      [
        testDocumentId,
        overrides.signerId === undefined ? testSignerId : overrides.signerId,
        testUserId,
        signerEmail,
        emailType,
        overrides.status ?? 'sent',
        overrides.error ?? null,
        at,
      ]
    );

  it('interleaves audit and email rows into one stream, newest first', async () => {
    await insertAudit('created', '2026-08-01T10:00:00Z');
    await insertAudit('sent', '2026-08-01T10:00:02Z');
    await insertEmail('signing_request', '2026-08-01T10:00:03Z');
    await insertAudit('viewed', '2026-08-01T10:00:04Z', { signer_id: testSignerId });

    const { items, total } = await activityService.getByDocumentId(testDocumentId, 1, 20);

    expect(total).toBe(4);
    expect(items.map((i) => [i.kind, i.type])).toEqual([
      ['audit', 'viewed'],
      ['email', 'signing_request'],
      ['audit', 'sent'],
      ['audit', 'created'],
    ]);
  });

  it('never exposes ip_address or user_agent', async () => {
    // The UNION bypasses `AuditEvent.toPublicJSON()`, which is the only thing
    // stripping these today - so the explicit column projection is the sole
    // guard, and this asserts it rather than trusting it.
    await insertAudit('created', '2026-08-01T10:00:00Z');

    const { items } = await activityService.getByDocumentId(testDocumentId, 1, 20);

    expect(items).toHaveLength(1);
    const serialized = JSON.stringify(items);
    expect(serialized).not.toContain('198.51.100.9');
    expect(serialized).not.toContain('secret-agent');
    expect(items[0]).not.toHaveProperty('ip_address');
    expect(items[0]).not.toHaveProperty('user_agent');
  });

  it('never exposes email_logs.metadata to a caller with mere document access', async () => {
    // `/documents/:id/emails` strips this column deliberately -
    // `PublicEmailLog = Omit<EmailLog, 'metadata'>` exists precisely because
    // that endpoint is reachable by any team member. This endpoint has the
    // same audience, so it has to make the same call; returning the blob here
    // would silently reverse a shipped control on a parallel route.
    await pool.query(
      `INSERT INTO email_logs (document_id, signer_id, user_id, recipient_email, email_type, subject, status, metadata, created_at)
       VALUES ($1, $2, $3, $4, 'signing_request', 'Please sign', 'sent', $5, '2026-08-01T10:00:00Z')`,
      [
        testDocumentId,
        testSignerId,
        testUserId,
        signerEmail,
        JSON.stringify({ context: { secret: 'do-not-leak-sentinel' } }),
      ]
    );

    const { items } = await activityService.getByDocumentId(testDocumentId, 1, 20);

    expect(items).toHaveLength(1);
    expect(JSON.stringify(items)).not.toContain('do-not-leak-sentinel');
    expect(items[0]?.metadata).toBeNull();
  });

  it('does not resolve a signer belonging to a different document', async () => {
    // The signer joins are scoped by `document_id`. Without that, an audit
    // row naming another document's signer renders that signer's name and
    // email into this document's timeline.
    const foreign = await pool.query(
      `INSERT INTO signers (document_id, email, name, status, access_token)
       VALUES ($1, 'foreign@example.com', 'Foreign Signer', 'pending', 'foreign-token')
       RETURNING id`,
      [otherDocumentId]
    );
    await insertAudit('viewed', '2026-08-01T10:00:00Z', { signer_id: foreign.rows[0].id });

    const { items } = await activityService.getByDocumentId(testDocumentId, 1, 20);

    expect(items).toHaveLength(1);
    expect(items[0]?.signerId).toBeNull();
    expect(JSON.stringify(items)).not.toContain('foreign@example.com');

    await pool.query('DELETE FROM signers WHERE id = $1', [foreign.rows[0].id]);
  });

  it('exposes signerId so the UI can call the resend endpoint', async () => {
    // Item 5's Resend button needs `POST /:id/signers/:signerId/resend`.
    // Matching on recipientEmail instead would be wrong - the schema permits
    // two signers to share an address.
    await insertAudit('completed', '2026-08-01T10:00:01Z', { signer_id: testSignerId });
    await insertEmail('signing_request', '2026-08-01T10:00:00Z', { status: 'failed', error: 'nope' });

    const { items } = await activityService.getByDocumentId(testDocumentId, 1, 20);

    const completed = items.find((i) => i.type === 'completed');
    expect(completed?.signerId).toBe(testSignerId);
    const failedEmail = items.find((i) => i.kind === 'email');
    expect(failedEmail?.signerId).toBe(testSignerId);
  });

  it('orders tied timestamps by the full (created_at, kind, id) key, not just the timestamp', async () => {
    // Four rows sharing one instant - an email logged in the same instant as
    // the event that triggered it is the common case, not a rare one.
    //
    // `kind ASC` puts 'audit' above 'email' in this newest-first list, which
    // is the order they happened in - an email is logged after the event that
    // triggered it, so `kind DESC` would render the email above its own cause.
    //
    // Asserting "the two pages together hold four distinct ids" is NOT enough
    // to prove this: on a table this small Postgres reads rows in the same
    // physical order every time, so that assertion passes even with the
    // tiebreakers removed (verified by mutation). What actually pins the
    // contract is comparing against the total order computed independently
    // here - with random uuids, `id DESC` is uncorrelated with insertion
    // order, so an implementation ordering by `created_at` alone cannot match
    // it by luck.
    const sameInstant = '2026-08-01T12:00:00Z';
    await insertAudit('created', sameInstant);
    await insertAudit('sent', sameInstant);
    await insertEmail('signing_request', sameInstant);
    await insertEmail('reminder', sameInstant);

    const rows = await pool.query(
      `SELECT id, 'audit' AS kind FROM audit_events WHERE document_id = $1
       UNION ALL
       SELECT id, 'email' AS kind FROM email_logs WHERE document_id = $1`,
      [testDocumentId]
    );
    // Postgres orders uuid by byte value, which for the canonical lowercase
    // hyphenated form is the same as comparing the strings.
    const expectedIds = rows.rows
      .sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : b.id > a.id ? 1 : -1))
      .map((r) => r.id);

    const wholePage = await activityService.getByDocumentId(testDocumentId, 1, 20);
    expect(wholePage.items.map((i) => i.id)).toEqual(expectedIds);

    // And the same order has to hold when the boundary cuts through the tie,
    // or a row lands on both pages or on neither.
    const first = await activityService.getByDocumentId(testDocumentId, 1, 2);
    const second = await activityService.getByDocumentId(testDocumentId, 2, 2);
    expect([...first.items, ...second.items].map((i) => i.id)).toEqual(expectedIds);
    expect(first.total).toBe(4);
    expect(first.totalPages).toBe(2);
  });

  it('excludes rows belonging to another document and instance-level rows', async () => {
    await insertAudit('created', '2026-08-01T10:00:00Z');
    // Another document's row.
    await pool.query(
      `INSERT INTO audit_events (document_id, user_id, event_type) VALUES ($1, $2, 'created')`,
      [otherDocumentId, otherUserId]
    );
    // An instance-level row: `document_id` is NULL, and `NULL = uuid` is
    // never TRUE, so the WHERE clause excludes it by construction rather
    // than by an event-type blocklist.
    await pool.query(
      `INSERT INTO audit_events (document_id, user_id, event_type) VALUES (NULL, $1, 'settings.updated')`,
      [testUserId]
    );

    const { items, total } = await activityService.getByDocumentId(testDocumentId, 1, 20);

    expect(total).toBe(1);
    expect(items[0]?.type).toBe('created');
  });

  it('resolves the actor and the signer to names rather than bare ids', async () => {
    // Without the joins the timeline reads "signed by 3f9a…-…", which is
    // useless for the support workflow the feature exists for.
    await insertAudit('signed', '2026-08-01T10:00:00Z', { signer_id: testSignerId });
    await insertEmail('signing_request', '2026-08-01T10:00:01Z');

    const { items } = await activityService.getByDocumentId(testDocumentId, 1, 20);

    const auditRow = items.find((i) => i.kind === 'audit');
    expect(auditRow?.actorEmail).toBe(testEmail);
    expect(auditRow?.signerEmail).toBe(signerEmail);
    expect(auditRow?.signerName).toBe('Activity Signer');

    const emailRow = items.find((i) => i.kind === 'email');
    expect(emailRow?.signerEmail).toBe(signerEmail);
    expect(emailRow?.recipientEmail).toBe(signerEmail);
  });

  it('falls back to the recorded actor email when the user row is gone', async () => {
    // `audit_events.user_id` is ON DELETE SET NULL, so deleting a user nulls
    // the join and the actor would otherwise vanish from the timeline. The
    // snapshot written at emit time is what keeps a deleted actor resolvable.
    await pool.query(
      `INSERT INTO audit_events (document_id, user_id, event_type, metadata, created_at)
       VALUES ($1, NULL, 'created', $2, '2026-08-01T10:00:00Z')`,
      [testDocumentId, JSON.stringify({ actor_email: 'deleted-user@example.com' })]
    );

    const { items } = await activityService.getByDocumentId(testDocumentId, 1, 20);

    expect(items[0]?.actorEmail).toBe('deleted-user@example.com');
  });

  it('prefers the live user identity over the recorded snapshot', async () => {
    // A renamed or re-emailed user should show their current address - you
    // contact the person who exists now, not the one who existed then.
    await insertAudit('created', '2026-08-01T10:00:00Z', { actor_email: 'stale@example.com' });

    const { items } = await activityService.getByDocumentId(testDocumentId, 1, 20);

    expect(items[0]?.actorEmail).toBe(testEmail);
  });

  it('survives a metadata signer_id that is not a uuid', async () => {
    // The join casts `signers.id` to text rather than casting the metadata
    // value to uuid: `(metadata->>'signer_id')::uuid` would throw for the
    // entire query on a single bad row, taking the endpoint down instead of
    // degrading that one row to a null signer.
    await insertAudit('viewed', '2026-08-01T10:00:00Z', { signer_id: 'not-a-uuid' });

    const { items } = await activityService.getByDocumentId(testDocumentId, 1, 20);

    expect(items).toHaveLength(1);
    expect(items[0]?.signerEmail).toBeNull();
  });

  it('carries the failure reason on a failed email row', async () => {
    // The entire point of the feature: a failed send has to say why.
    await insertEmail('signing_request', '2026-08-01T10:00:00Z', {
      status: 'failed',
      error: 'connect ECONNREFUSED 10.0.0.5:587',
    });

    const { items } = await activityService.getByDocumentId(testDocumentId, 1, 20);

    expect(items[0]?.status).toBe('failed');
    expect(items[0]?.errorMessage).toBe('connect ECONNREFUSED 10.0.0.5:587');
  });

  it('reports an empty timeline rather than failing when there is nothing to show', async () => {
    const { items, total } = await activityService.getByDocumentId(testDocumentId, 1, 20);

    expect(items).toEqual([]);
    expect(total).toBe(0);
  });
});
