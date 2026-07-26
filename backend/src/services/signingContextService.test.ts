import { Pool } from 'pg';
import { Document } from '@/models/Document';
import {
  resolveSigningContext,
  assertDocumentSignable,
  assertDocumentReadable,
  assertFieldsOwnedBySigner,
  isValidUuid,
  isExpiryEnforced,
  SigningContextError,
  mapRowToSignerData,
  mapRowToDocumentData,
} from './signingContextService';

jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const VALID_UUID = '11111111-1111-4111-8111-111111111111';
const OTHER_UUID = '22222222-2222-4222-8222-222222222222';

function makeSignerRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'signer-1',
    document_id: 'doc-1',
    email: 'signer@example.com',
    name: 'Signer One',
    signing_order: null,
    status: 'pending',
    access_token: 'token-abc',
    signed_at: null,
    ip_address: null,
    user_agent: null,
    last_reminder_sent_at: null,
    reminder_count: 0,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeDocumentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'doc-1',
    user_id: 'user-1',
    team_id: null,
    title: 'Test Doc',
    original_filename: 'test.pdf',
    file_path: 'documents/test.pdf',
    file_size: '1024',
    mime_type: 'application/pdf',
    page_count: 1,
    status: 'pending',
    workflow_type: 'single',
    completed_at: null,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    thumbnail_path: null,
    thumbnail_generated_at: null,
    is_optimized: false,
    original_file_size: null,
    optimized_at: null,
    expires_at: null,
    reminder_settings: { enabled: true, intervals: [1, 3, 7] },
    ...overrides,
  };
}

describe('isValidUuid', () => {
  it('accepts a well-formed v4 uuid', () => {
    expect(isValidUuid(VALID_UUID)).toBe(true);
  });

  it('rejects a non-uuid string', () => {
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid("'; DROP TABLE fields; --")).toBe(false);
    expect(isValidUuid('')).toBe(false);
  });
});

describe('resolveSigningContext', () => {
  it('throws a 404 SigningContextError when the token matches no signer', async () => {
    const pool = { query: jest.fn().mockResolvedValueOnce({ rows: [] }) } as unknown as Pool;

    await expect(resolveSigningContext(pool, 'bad-token')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Invalid signing link',
    });
  });

  it('throws a 404 SigningContextError when the signer exists but its document does not', async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [makeSignerRow()] })
        .mockResolvedValueOnce({ rows: [] }),
    } as unknown as Pool;

    await expect(resolveSigningContext(pool, 'token-abc')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Document not found',
    });
  });

  it('resolves signer, document, and the full ordered signer list', async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [makeSignerRow()] })
        .mockResolvedValueOnce({ rows: [makeDocumentRow()] })
        .mockResolvedValueOnce({ rows: [makeSignerRow(), makeSignerRow({ id: 'signer-2', signing_order: 1 })] }),
    } as unknown as Pool;

    const context = await resolveSigningContext(pool, 'token-abc');

    expect(context.signer.id).toBe('signer-1');
    expect(context.document.id).toBe('doc-1');
    expect(context.allSigners).toHaveLength(2);
  });
});

describe('assertDocumentSignable (SEC-C4, write path)', () => {
  const originalEnv = process.env.SIGNING_ENFORCE_EXPIRY;

  afterEach(() => {
    process.env.SIGNING_ENFORCE_EXPIRY = originalEnv;
  });

  it('passes for a pending, non-expired document', () => {
    const document = new Document(mapRowToDocumentData(makeDocumentRow()));
    expect(() => assertDocumentSignable(document)).not.toThrow();
  });

  it('rejects a cancelled document with 400', () => {
    const document = new Document(mapRowToDocumentData(makeDocumentRow({ status: 'cancelled' })));
    expect(() => assertDocumentSignable(document)).toThrow(SigningContextError);
    try {
      assertDocumentSignable(document);
      fail('expected throw');
    } catch (error) {
      expect((error as SigningContextError).statusCode).toBe(400);
      expect((error as SigningContextError).message).toContain('cancelled');
    }
  });

  it('rejects a completed document with 400 (cannot re-sign)', () => {
    const document = new Document(mapRowToDocumentData(makeDocumentRow({ status: 'completed' })));
    expect(() => assertDocumentSignable(document)).toThrow(SigningContextError);
  });

  it('does not reject an expired pending document by default (H3: opt-in, not opt-out)', () => {
    delete process.env.SIGNING_ENFORCE_EXPIRY;
    expect(isExpiryEnforced()).toBe(false);
    const pastDate = new Date(Date.now() - 60_000);
    const document = new Document(mapRowToDocumentData(makeDocumentRow({ expires_at: pastDate })));

    expect(() => assertDocumentSignable(document)).not.toThrow();
  });

  it('rejects an expired pending document when SIGNING_ENFORCE_EXPIRY=true', () => {
    process.env.SIGNING_ENFORCE_EXPIRY = 'true';
    const pastDate = new Date(Date.now() - 60_000);
    const document = new Document(mapRowToDocumentData(makeDocumentRow({ expires_at: pastDate })));

    let caught: SigningContextError | undefined;
    try {
      assertDocumentSignable(document);
    } catch (error) {
      caught = error as SigningContextError;
    }

    expect(caught).toBeInstanceOf(SigningContextError);
    expect(caught?.statusCode).toBe(400);
    expect(caught?.message).toContain(pastDate.toISOString());
  });

  it('allows an expired pending document when SIGNING_ENFORCE_EXPIRY=false', () => {
    process.env.SIGNING_ENFORCE_EXPIRY = 'false';
    const pastDate = new Date(Date.now() - 60_000);
    const document = new Document(mapRowToDocumentData(makeDocumentRow({ expires_at: pastDate })));

    expect(() => assertDocumentSignable(document)).not.toThrow();
  });

  it('does not reject a pending document with a future deadline', () => {
    const futureDate = new Date(Date.now() + 60_000);
    const document = new Document(mapRowToDocumentData(makeDocumentRow({ expires_at: futureDate })));
    expect(() => assertDocumentSignable(document)).not.toThrow();
  });
});

describe('assertDocumentReadable (SEC-C4, read path)', () => {
  const originalEnv = process.env.SIGNING_ENFORCE_EXPIRY;

  afterEach(() => {
    process.env.SIGNING_ENFORCE_EXPIRY = originalEnv;
  });

  it('allows a pending document', () => {
    const document = new Document(mapRowToDocumentData(makeDocumentRow({ status: 'pending' })));
    expect(() => assertDocumentReadable(document)).not.toThrow();
  });

  it('allows a completed document (signer downloading their finished copy)', () => {
    const document = new Document(mapRowToDocumentData(makeDocumentRow({ status: 'completed' })));
    expect(() => assertDocumentReadable(document)).not.toThrow();
  });

  it('rejects a cancelled document with 400 - a signing link must not survive cancellation', () => {
    const document = new Document(mapRowToDocumentData(makeDocumentRow({ status: 'cancelled' })));
    expect(() => assertDocumentReadable(document)).toThrow(SigningContextError);
    try {
      assertDocumentReadable(document);
      fail('expected throw');
    } catch (error) {
      expect((error as SigningContextError).statusCode).toBe(400);
    }
  });

  it('rejects a draft document defensively', () => {
    const document = new Document(mapRowToDocumentData(makeDocumentRow({ status: 'draft' })));
    expect(() => assertDocumentReadable(document)).toThrow(SigningContextError);
  });

  it('does not reject an expired-but-still-pending document by default (H3: opt-in, not opt-out)', () => {
    delete process.env.SIGNING_ENFORCE_EXPIRY;
    const pastDate = new Date(Date.now() - 60_000);
    const document = new Document(mapRowToDocumentData(makeDocumentRow({ status: 'pending', expires_at: pastDate })));
    expect(() => assertDocumentReadable(document)).not.toThrow();
  });

  it('rejects an expired-but-still-pending document when SIGNING_ENFORCE_EXPIRY=true', () => {
    process.env.SIGNING_ENFORCE_EXPIRY = 'true';
    const pastDate = new Date(Date.now() - 60_000);
    const document = new Document(mapRowToDocumentData(makeDocumentRow({ status: 'pending', expires_at: pastDate })));
    expect(() => assertDocumentReadable(document)).toThrow(SigningContextError);
  });

  it('allows an expired-but-pending document when SIGNING_ENFORCE_EXPIRY=false', () => {
    process.env.SIGNING_ENFORCE_EXPIRY = 'false';
    const pastDate = new Date(Date.now() - 60_000);
    const document = new Document(mapRowToDocumentData(makeDocumentRow({ status: 'pending', expires_at: pastDate })));
    expect(() => assertDocumentReadable(document)).not.toThrow();
  });

  it('allows a completed document even past its expiry - the deadline is moot once complete', () => {
    const pastDate = new Date(Date.now() - 60_000);
    const document = new Document(mapRowToDocumentData(makeDocumentRow({ status: 'completed', expires_at: pastDate })));
    expect(() => assertDocumentReadable(document)).not.toThrow();
  });
});

describe('assertFieldsOwnedBySigner (SEC-C3)', () => {
  it('resolves without querying when the id list is empty', async () => {
    const pool = { query: jest.fn() } as unknown as Pool;
    await expect(assertFieldsOwnedBySigner(pool, [], 'doc-1', 'signer@example.com')).resolves.toBeUndefined();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID field_id with 400 before ever querying the database', async () => {
    const pool = { query: jest.fn() } as unknown as Pool;

    await expect(
      assertFieldsOwnedBySigner(pool, ["'; DROP TABLE fields; --"], 'doc-1', 'signer@example.com')
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('de-duplicates the submitted id list before querying', async () => {
    const pool = {
      query: jest.fn().mockResolvedValueOnce({ rows: [{ id: VALID_UUID }] }),
    } as unknown as Pool;

    await assertFieldsOwnedBySigner(pool, [VALID_UUID, VALID_UUID], 'doc-1', 'signer@example.com');

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), [[VALID_UUID], 'doc-1', 'signer@example.com']);
  });

  it('SEC-C3: the query text itself scopes by document_id and signer_email, not just the call args', async () => {
    // With a fully mocked `pool.query`, a test that only inspects the
    // *return value* (like the cross-document-forgery test right below)
    // passes identically whether the SQL is scoped or not - the mock, not
    // the query, decides what comes back. Verified empirically: stripping
    // `AND document_id = $2 AND signer_email = $3` from the production query
    // left all other tests in this describe block green. This is the one
    // assertion that actually detects that regression.
    const pool = {
      query: jest.fn().mockResolvedValueOnce({ rows: [{ id: VALID_UUID }] }),
    } as unknown as Pool;

    await assertFieldsOwnedBySigner(pool, [VALID_UUID], 'doc-1', 'signer@example.com');

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringMatching(/document_id\s*=\s*\$2/),
      [[VALID_UUID], 'doc-1', 'signer@example.com']
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringMatching(/signer_email\s*=\s*\$3/),
      [[VALID_UUID], 'doc-1', 'signer@example.com']
    );
  });

  it('rejects the whole batch when a field_id belongs to a different document (cross-document forgery)', async () => {
    // The scoped query itself filters on document_id, so a cross-document id
    // simply never comes back in the result set. NOTE: this test alone has
    // no detection power against a reverted predicate, since the mock
    // supplies the empty row set directly - see the SEC-C3 query-text test
    // above for the assertion that actually proves the predicate exists.
    const pool = {
      query: jest.fn().mockResolvedValueOnce({ rows: [] }),
    } as unknown as Pool;

    await expect(
      assertFieldsOwnedBySigner(pool, [VALID_UUID], 'doc-1', 'signer@example.com')
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('do not belong') });
  });

  it('rejects the whole batch when only some ids belong to this signer (claiming another signer\'s field)', async () => {
    const pool = {
      query: jest.fn().mockResolvedValueOnce({ rows: [{ id: VALID_UUID }] }),
    } as unknown as Pool;

    await expect(
      assertFieldsOwnedBySigner(pool, [VALID_UUID, OTHER_UUID], 'doc-1', 'signer@example.com')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('resolves when every submitted id is owned by this signer on this document', async () => {
    const pool = {
      query: jest.fn().mockResolvedValueOnce({ rows: [{ id: VALID_UUID }, { id: OTHER_UUID }] }),
    } as unknown as Pool;

    await expect(
      assertFieldsOwnedBySigner(pool, [VALID_UUID, OTHER_UUID], 'doc-1', 'signer@example.com')
    ).resolves.toBeUndefined();
  });
});

describe('mapRowToSignerData / mapRowToDocumentData', () => {
  it('maps every field SignerData/DocumentData require, including reminder columns', () => {
    const signerData = mapRowToSignerData(makeSignerRow({ last_reminder_sent_at: new Date('2026-02-01'), reminder_count: 2 }));
    expect(signerData.last_reminder_sent_at).toEqual(new Date('2026-02-01'));
    expect(signerData.reminder_count).toBe(2);
    expect(signerData).not.toHaveProperty('declined_at');

    const documentData = mapRowToDocumentData(
      makeDocumentRow({ is_optimized: true, original_file_size: 2048, thumbnail_path: 'thumb.png' })
    );
    expect(documentData.is_optimized).toBe(true);
    expect(documentData.original_file_size).toBe(2048);
    expect(documentData.thumbnail_path).toBe('thumb.png');
  });
});
