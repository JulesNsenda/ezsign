import { Pool } from 'pg';
import { Request, Response } from 'express';
import { SigningController } from './signingController';
import { EmailService } from '@/services/emailService';
import { PdfService } from '@/services/pdfService';
import { StorageService } from '@/services/storageService';
import { getSettingsService } from '@/services/settingsService';
import logger from '@/services/loggerService';

jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// `jest.config.js` sets `resetMocks: true`, which clears any implementation
// given inline in the factory below before every test - so the return value
// is set fresh in `beforeEach` instead (mirrors signerController.test.ts).
jest.mock('@/services/settingsService', () => ({
  getSettingsService: jest.fn(),
}));

/**
 * Covers item 4 (SEC-C3/C4/C5): field-ownership, document status/expiry, and
 * sequential-order re-checks on the three public signing-token routes, plus
 * the item-4.6 payload validation that replaces the dead `validate()`
 * middleware. Most rejection paths are proven never to reach
 * `pool.connect()`/the transaction at all - the checks all run before any
 * write - so only the one positive round-trip test needs the full
 * transaction mocked.
 */

const VALID_FIELD_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_FIELD_ID = '22222222-2222-4222-8222-222222222222';

function makeSignerRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'signer-1',
    document_id: 'doc-1',
    email: 'signer@example.com',
    name: 'Signer One',
    signing_order: null,
    status: 'pending',
    access_token: 'good-token',
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
    workflow_type: 'parallel',
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

/**
 * The dispatcher mocks below route on a short SQL prefix purely to decide
 * which canned response `client.query`/`pool.query` should return for a
 * given call - they are not assertions on the production SQL's exact
 * formatting. Collapsing all whitespace (including newlines/indentation)
 * before matching means a harmless reformat of a query in
 * `signingController.ts` (e.g. wrapping a long statement across lines)
 * can't silently misroute into the `throw` fallback and fail an unrelated
 * test. Where the SQL text genuinely *is* the thing under test (the
 * completion-JOIN scoping assertions further down), that stays a narrow,
 * explicit `.toContain()` on the normalized text instead.
 */
function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/**
 * SEC-C3's field-ownership check (`assertFieldsOwnedBySigner`) now runs on
 * the connected transaction client (post-`BEGIN`), not on `pool` directly -
 * so any test whose rejection depends on that check must mock `pool.connect`
 * to return a client whose `query` answers `BEGIN`/`ROLLBACK` and the
 * ownership `SELECT` itself.
 */
function makeFieldOwnershipClient(ownershipRows: Array<{ id: string }>) {
  const query = jest.fn((sql: string) => {
    const text = normalizeSql(sql);
    if (text === 'BEGIN' || text === 'ROLLBACK') {
      return Promise.resolve({ rows: [] });
    }
    if (text.startsWith('SELECT id FROM fields WHERE id = ANY')) {
      return Promise.resolve({ rows: ownershipRows });
    }
    throw new Error(`Unexpected client query in test: ${text}`);
  });
  return { query, release: jest.fn() };
}

describe('SigningController', () => {
  let controller: SigningController;
  let mockPool: { query: jest.Mock; connect: jest.Mock };
  let mockEmailService: Partial<EmailService>;
  let mockPdfService: Partial<PdfService>;
  let mockStorageService: { fileExists: jest.Mock; downloadFile: jest.Mock; uploadFile: jest.Mock };
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseJson: jest.Mock;
  let responseStatus: jest.Mock;
  let responseSetHeader: jest.Mock;
  let responseSend: jest.Mock;
  const originalEnforceExpiry = process.env.SIGNING_ENFORCE_EXPIRY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SIGNING_ENFORCE_EXPIRY = originalEnforceExpiry;

    mockPool = { query: jest.fn(), connect: jest.fn() };
    mockEmailService = { sendSigningRequest: jest.fn(), sendCompletionNotification: jest.fn() } as any;
    mockPdfService = {} as any;
    mockStorageService = {
      fileExists: jest.fn(),
      downloadFile: jest.fn(),
      uploadFile: jest.fn(),
    };
    (getSettingsService as jest.Mock).mockReturnValue({
      getAppUrl: jest.fn().mockResolvedValue('https://example.test'),
    });

    controller = new SigningController(
      mockPool as unknown as Pool,
      mockEmailService as EmailService,
      mockPdfService as PdfService,
      mockStorageService as unknown as StorageService,
      undefined
    );

    responseJson = jest.fn();
    responseStatus = jest.fn().mockReturnValue({ json: responseJson });
    responseSetHeader = jest.fn();
    responseSend = jest.fn();
    mockResponse = {
      status: responseStatus,
      json: responseJson,
      setHeader: responseSetHeader,
      send: responseSend,
    };
  });

  afterAll(() => {
    process.env.SIGNING_ENFORCE_EXPIRY = originalEnforceExpiry;
  });

  describe('submitSignature - payload validation (item 4.6)', () => {
    it('rejects more than 50 signature entries with 400, without querying the database', async () => {
      const signatures = Array.from({ length: 51 }, (_, i) => ({
        field_id: VALID_FIELD_ID,
        signature_type: 'typed',
        signature_data: `data-${i}`,
        text_value: 'x',
      }));
      mockRequest = { params: { token: 'good-token' }, body: { signatures } } as any;

      await controller.submitSignature(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('50') })
      );
      expect(mockPool.query).not.toHaveBeenCalled();
      expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('rejects a non-UUID field_id with 400, not 500, without querying the database', async () => {
      mockRequest = {
        params: { token: 'good-token' },
        body: {
          signatures: [
            { field_id: "'; DROP TABLE fields; --", signature_type: 'typed', signature_data: 'x', text_value: 'hi' },
          ],
        },
      } as any;

      await controller.submitSignature(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseStatus).not.toHaveBeenCalledWith(500);
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  describe('submitSignature - context resolution', () => {
    it('returns 404 for an invalid/unknown signing token', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // signer lookup misses

      mockRequest = {
        params: { token: 'bad-token' },
        body: { signatures: [{ field_id: VALID_FIELD_ID, signature_type: 'typed', signature_data: 'x', text_value: 'hi' }] },
      } as any;

      await controller.submitSignature(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(404);
    });
  });

  describe('submitSignature - SEC-C4 (document status and expiry)', () => {
    it('rejects submission against a cancelled document', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow()] })
        .mockResolvedValueOnce({ rows: [makeDocumentRow({ status: 'cancelled' })] })
        .mockResolvedValueOnce({ rows: [makeSignerRow()] });

      mockRequest = {
        params: { token: 'good-token' },
        body: { signatures: [{ field_id: VALID_FIELD_ID, signature_type: 'typed', signature_data: 'x', text_value: 'hi' }] },
      } as any;

      await controller.submitSignature(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('cancelled') })
      );
      expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('rejects submission against an expired pending document when SIGNING_ENFORCE_EXPIRY=true (H3: opt-in, not opt-out)', async () => {
      process.env.SIGNING_ENFORCE_EXPIRY = 'true';
      const pastDate = new Date(Date.now() - 60_000);
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow()] })
        .mockResolvedValueOnce({ rows: [makeDocumentRow({ expires_at: pastDate })] })
        .mockResolvedValueOnce({ rows: [makeSignerRow()] });

      mockRequest = {
        params: { token: 'good-token' },
        body: { signatures: [{ field_id: VALID_FIELD_ID, signature_type: 'typed', signature_data: 'x', text_value: 'hi' }] },
      } as any;

      await controller.submitSignature(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('deadline') })
      );
      expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('does not reject for expiry when SIGNING_ENFORCE_EXPIRY=false (proceeds to the next check instead)', async () => {
      process.env.SIGNING_ENFORCE_EXPIRY = 'false';
      const pastDate = new Date(Date.now() - 60_000);
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow()] })
        .mockResolvedValueOnce({ rows: [makeDocumentRow({ expires_at: pastDate })] })
        .mockResolvedValueOnce({ rows: [makeSignerRow()] });
      // Field-ownership check runs on the connected client (post-BEGIN) -
      // reject via mismatch, proving we got past expiry.
      mockPool.connect.mockResolvedValue(makeFieldOwnershipClient([]));

      mockRequest = {
        params: { token: 'good-token' },
        body: { signatures: [{ field_id: VALID_FIELD_ID, signature_type: 'typed', signature_data: 'x', text_value: 'hi' }] },
      } as any;

      await controller.submitSignature(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      const [[body]] = responseJson.mock.calls;
      expect(body.error).not.toContain('deadline');
      expect(body.error).toContain('do not belong');
    });
  });

  describe('submitSignature - SEC-C5 (sequential order)', () => {
    it('rejects an out-of-turn sequential signer', async () => {
      const signer = makeSignerRow({ signing_order: 1 });
      const previousSigner = makeSignerRow({ id: 'signer-0', signing_order: 0, status: 'pending' });
      mockPool.query
        .mockResolvedValueOnce({ rows: [signer] })
        .mockResolvedValueOnce({ rows: [makeDocumentRow({ workflow_type: 'sequential' })] })
        .mockResolvedValueOnce({ rows: [previousSigner, signer] });

      mockRequest = {
        params: { token: 'good-token' },
        body: { signatures: [{ field_id: VALID_FIELD_ID, signature_type: 'typed', signature_data: 'x', text_value: 'hi' }] },
      } as any;

      await controller.submitSignature(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('not your turn') })
      );
      expect(mockPool.connect).not.toHaveBeenCalled();
    });
  });

  describe('submitSignature - SEC-C3 (field ownership)', () => {
    it('rejects a field_id belonging to another document (fields query scoped by document_id returns nothing)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow()] })
        .mockResolvedValueOnce({ rows: [makeDocumentRow()] })
        .mockResolvedValueOnce({ rows: [makeSignerRow()] });
      // Field-ownership check runs on the connected client (post-BEGIN): no
      // field matches this document/email.
      mockPool.connect.mockResolvedValue(makeFieldOwnershipClient([]));

      mockRequest = {
        params: { token: 'good-token' },
        body: { signatures: [{ field_id: VALID_FIELD_ID, signature_type: 'typed', signature_data: 'x', text_value: 'hi' }] },
      } as any;

      await controller.submitSignature(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('do not belong') })
      );
      expect(mockPool.connect).toHaveBeenCalled();
    });

    it("rejects a field_id belonging to another signer on the same document (partial match)", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow()] })
        .mockResolvedValueOnce({ rows: [makeDocumentRow()] })
        .mockResolvedValueOnce({ rows: [makeSignerRow()] });
      // Only the first id is owned by this signer; the second belongs to someone else.
      mockPool.connect.mockResolvedValue(makeFieldOwnershipClient([{ id: VALID_FIELD_ID }]));

      mockRequest = {
        params: { token: 'good-token' },
        body: {
          signatures: [
            { field_id: VALID_FIELD_ID, signature_type: 'typed', signature_data: 'x', text_value: 'hi' },
            { field_id: OTHER_FIELD_ID, signature_type: 'typed', signature_data: 'y', text_value: 'bye' },
          ],
        },
      } as any;

      await controller.submitSignature(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('do not belong') })
      );
      expect(mockPool.connect).toHaveBeenCalled();
    });
  });

  describe('submitSignature - positive round-trip (typed signature with text_value/font_family)', () => {
    it('inserts the signature with text_value and font_family preserved unchanged, and does not complete the document while another signer is still pending', async () => {
      const signer = makeSignerRow();
      const otherSigner = makeSignerRow({ id: 'signer-2', email: 'other@example.com', access_token: 'other-token' });
      const document = makeDocumentRow();

      mockPool.query
        .mockResolvedValueOnce({ rows: [signer] }) // resolve: signer by token
        .mockResolvedValueOnce({ rows: [document] }) // resolve: document
        .mockResolvedValueOnce({ rows: [signer, otherSigner] }); // resolve: all signers

      const insertedParams: any[] = [];
      const clientQuery = jest.fn((sql: string, params?: unknown[]) => {
        const text = normalizeSql(sql);
        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
          return Promise.resolve({ rows: [] });
        }
        if (text.startsWith('SELECT id FROM fields WHERE id = ANY')) {
          return Promise.resolve({ rows: [{ id: VALID_FIELD_ID }] }); // field ownership check
        }
        if (text.startsWith('INSERT INTO signatures')) {
          insertedParams.push(params);
          return Promise.resolve({ rows: [] });
        }
        if (text.startsWith("UPDATE signers SET status = 'signed'")) {
          return Promise.resolve({ rows: [] });
        }
        if (text.startsWith('SELECT user_id FROM documents')) {
          return Promise.resolve({ rows: [{ user_id: 'user-1' }] });
        }
        if (text.startsWith('SELECT * FROM signers WHERE document_id')) {
          // This signer has just signed; the other one is still pending -
          // document must NOT complete, keeping this test out of the
          // PDF-processing branch entirely.
          return Promise.resolve({
            rows: [
              { ...signer, status: 'signed' },
              { ...otherSigner, status: 'pending' },
            ],
          });
        }
        if (text.startsWith('SELECT * FROM documents WHERE id')) {
          return Promise.resolve({ rows: [document] });
        }
        throw new Error(`Unexpected client query in test: ${text}`);
      });
      mockPool.connect.mockResolvedValue({ query: clientQuery, release: jest.fn() });

      mockRequest = {
        params: { token: 'good-token' },
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('test-agent'),
        body: {
          signatures: [
            {
              field_id: VALID_FIELD_ID,
              signature_type: 'typed',
              signature_data: 'text:My Typed Text',
              text_value: 'My Typed Text',
              font_family: 'Arial',
            },
          ],
        },
      } as any;

      await controller.submitSignature(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(200);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: { document_completed: false } })
      );

      expect(insertedParams).toHaveLength(1);
      const [signerId, fieldId, signatureType, signatureData, textValue, fontFamily] = insertedParams[0];
      expect(signerId).toBe('signer-1');
      expect(fieldId).toBe(VALID_FIELD_ID);
      expect(signatureType).toBe('typed');
      expect(signatureData).toBe('text:My Typed Text');
      expect(textValue).toBe('My Typed Text');
      expect(fontFamily).toBe('Arial');
    });
  });

  describe('submitSignature - completion JOIN scoping (SEC-C3 defence in depth)', () => {
    /**
     * These two tests are the only ones in this file that let `allSigned`
     * become true, so they're the only ones that exercise the completion
     * JOIN and its count-mismatch warn at all - every other test deliberately
     * keeps a second signer pending to stay out of this branch.
     */
    function makeSingleSignerCompletionSetup() {
      const signer = makeSignerRow();
      const document = makeDocumentRow();

      mockPool.query
        .mockResolvedValueOnce({ rows: [signer] })
        .mockResolvedValueOnce({ rows: [document] })
        .mockResolvedValueOnce({ rows: [signer] });

      mockPdfService.getPdfInfo = jest.fn().mockResolvedValue({ pages: [{ pageNumber: 0, height: 792 }] });
      mockPdfService.addMultipleFields = jest.fn().mockResolvedValue(Buffer.from('signed-pdf'));
      mockStorageService.downloadFile.mockResolvedValue(Buffer.from('original-pdf'));
      mockStorageService.uploadFile.mockResolvedValue(undefined);

      mockRequest = {
        params: { token: 'good-token' },
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('test-agent'),
        body: {
          signatures: [
            { field_id: VALID_FIELD_ID, signature_type: 'typed', signature_data: 'text:hi', text_value: 'hi' },
          ],
        },
      } as any;

      return { signer, document };
    }

    it('scopes the completion JOIN to this document\'s own signers and fields (tripwire on the SQL itself, since a mock returns rows regardless of predicate)', async () => {
      const { signer, document } = makeSingleSignerCompletionSetup();
      const capturedQueries: string[] = [];

      const clientQuery = jest.fn((sql: string) => {
        const text = normalizeSql(sql);
        capturedQueries.push(text);
        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
          return Promise.resolve({ rows: [] });
        }
        if (text.startsWith('SELECT id FROM fields WHERE id = ANY')) {
          return Promise.resolve({ rows: [{ id: VALID_FIELD_ID }] });
        }
        if (text.startsWith('INSERT INTO signatures')) {
          return Promise.resolve({ rows: [] });
        }
        if (text.startsWith("UPDATE signers SET status = 'signed'")) {
          return Promise.resolve({ rows: [] });
        }
        if (text.startsWith('SELECT user_id FROM documents')) {
          return Promise.resolve({ rows: [{ user_id: 'user-1' }] });
        }
        if (text.startsWith('SELECT * FROM signers WHERE document_id')) {
          return Promise.resolve({ rows: [{ ...signer, status: 'signed' }] });
        }
        if (text.startsWith('SELECT * FROM documents WHERE id')) {
          return Promise.resolve({ rows: [document] });
        }
        if (text.startsWith('SELECT COUNT(*)')) {
          // No mismatch - the scoped join below is exercised on its own merits.
          return Promise.resolve({ rows: [{ count: 0 }] });
        }
        if (text.startsWith('SELECT s.*, f.page')) {
          return Promise.resolve({
            rows: [
              {
                signer_id: signer.id,
                field_id: VALID_FIELD_ID,
                page: 0,
                x: '0',
                y: '0',
                width: '100',
                height: '50',
                type: 'signature',
                properties: {},
                signature_data: 'text:hi',
                text_value: 'hi',
              },
            ],
          });
        }
        if (text.startsWith('UPDATE documents SET status')) {
          return Promise.resolve({ rows: [] });
        }
        if (text.startsWith('SELECT email FROM users WHERE id')) {
          return Promise.resolve({ rows: [{ email: 'owner@example.com' }] });
        }
        throw new Error(`Unexpected client query in test: ${text}`);
      });
      mockPool.connect.mockResolvedValue({ query: clientQuery, release: jest.fn() });

      await controller.submitSignature(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(200);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({ data: { document_completed: true } })
      );

      const scopedJoinSql = capturedQueries.find((q) => q.startsWith('SELECT s.*, f.page'));
      expect(scopedJoinSql).toBeDefined();
      expect(scopedJoinSql).toContain('JOIN signers sg ON s.signer_id = sg.id');
      // H1: scoped by document on both sides of the join, not by
      // `f.signer_email = sg.email` (that predicate is a classifier for the
      // separate mismatch count below, not a filter on the stamping query).
      expect(scopedJoinSql).toContain('WHERE f.document_id = $1 AND sg.document_id = $1');
    });

    it('refuses to complete (rolls back the transaction) when the completion JOIN finds a signer_email mismatch (H1: throws, not logger.warn)', async () => {
      const { signer, document } = makeSingleSignerCompletionSetup();
      const capturedQueries: string[] = [];

      const clientQuery = jest.fn((sql: string) => {
        const text = normalizeSql(sql);
        capturedQueries.push(text);
        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
          return Promise.resolve({ rows: [] });
        }
        if (text.startsWith('SELECT id FROM fields WHERE id = ANY')) {
          return Promise.resolve({ rows: [{ id: VALID_FIELD_ID }] });
        }
        if (text.startsWith('INSERT INTO signatures')) {
          return Promise.resolve({ rows: [] });
        }
        if (text.startsWith("UPDATE signers SET status = 'signed'")) {
          return Promise.resolve({ rows: [] });
        }
        if (text.startsWith('SELECT user_id FROM documents')) {
          return Promise.resolve({ rows: [{ user_id: 'user-1' }] });
        }
        if (text.startsWith('SELECT * FROM signers WHERE document_id')) {
          return Promise.resolve({ rows: [{ ...signer, status: 'signed' }] });
        }
        if (text.startsWith('SELECT * FROM documents WHERE id')) {
          return Promise.resolve({ rows: [document] });
        }
        if (text.startsWith('SELECT COUNT(*)')) {
          // A pre-existing case-mismatched signer_email: the unconditional
          // stamping query below still returns the row (fetched per H1
          // regardless of this predicate), but this count flags it.
          return Promise.resolve({ rows: [{ count: 1 }] });
        }
        if (text.startsWith('SELECT s.*, f.page')) {
          return Promise.resolve({
            rows: [
              {
                signer_id: signer.id,
                field_id: VALID_FIELD_ID,
                page: 0,
                x: '0',
                y: '0',
                width: '100',
                height: '50',
                type: 'signature',
                properties: {},
                signature_data: 'text:hi',
                text_value: 'hi',
              },
            ],
          });
        }
        // Deliberately no handler for 'UPDATE documents SET status' or
        // 'SELECT email FROM users WHERE id' - the mismatch must roll back
        // before either is reached; if a regression reaches them anyway,
        // the mock throws and the test fails loudly.
        throw new Error(`Unexpected client query in test: ${text}`);
      });
      mockPool.connect.mockResolvedValue({ query: clientQuery, release: jest.fn() });

      await controller.submitSignature(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      // H6: the detailed mismatch message (which includes the document id
      // and count) is server-side-only - the unauthenticated caller gets
      // the fixed generic message instead.
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        error: 'An error occurred while processing your request',
      });
      expect(responseJson).not.toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('refusing to stamp') })
      );
      expect(logger.error).toHaveBeenCalledWith(
        "Refusing to complete document: completion JOIN found signature(s) whose field signer_email does not match the owning signer's email",
        expect.objectContaining({ documentId: document.id, mismatchCount: 1 })
      );
      expect(capturedQueries).toContain('ROLLBACK');
      expect(capturedQueries.some((q) => q.startsWith('UPDATE documents SET status'))).toBe(false);
    });
  });

  describe('getDocumentBySigningToken - shares the same resolver/checks', () => {
    it('rejects a cancelled document with 400', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow()] })
        .mockResolvedValueOnce({ rows: [makeDocumentRow({ status: 'cancelled' })] })
        .mockResolvedValueOnce({ rows: [makeSignerRow()] });

      mockRequest = { params: { token: 'good-token' } } as any;

      await controller.getDocumentBySigningToken(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('cancelled') })
      );
    });

    it('returns 404 for an invalid signing token', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      mockRequest = { params: { token: 'bad-token' } } as any;

      await controller.getDocumentBySigningToken(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(404);
    });
  });

  describe('downloadDocumentByToken - SEC-C4/C5', () => {
    it('rejects a download for a cancelled document (was previously unchecked)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow()] })
        .mockResolvedValueOnce({ rows: [makeDocumentRow({ status: 'cancelled' })] })
        .mockResolvedValueOnce({ rows: [makeSignerRow()] });

      mockRequest = { params: { token: 'good-token' }, correlationId: 'corr-1' } as any;

      await controller.downloadDocumentByToken(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(mockStorageService.fileExists).not.toHaveBeenCalled();
    });

    it('still serves the file for a completed document (post-signing download link)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow({ status: 'signed' })] })
        .mockResolvedValueOnce({ rows: [makeDocumentRow({ status: 'completed' })] })
        .mockResolvedValueOnce({ rows: [makeSignerRow({ status: 'signed' })] });
      mockStorageService.fileExists.mockResolvedValue(true);
      mockStorageService.downloadFile.mockResolvedValue(Buffer.from('pdf-bytes'));

      mockRequest = { params: { token: 'good-token' }, correlationId: 'corr-1' } as any;

      await controller.downloadDocumentByToken(mockRequest as Request, mockResponse as Response);

      expect(responseSend).toHaveBeenCalledWith(Buffer.from('pdf-bytes'));
      expect(responseStatus).not.toHaveBeenCalledWith(400);
    });

    it('rejects a download for a declined signer while the document is still pending (H4)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow({ status: 'declined' })] })
        .mockResolvedValueOnce({ rows: [makeDocumentRow()] })
        .mockResolvedValueOnce({ rows: [makeSignerRow({ status: 'declined' })] });

      mockRequest = { params: { token: 'good-token' }, correlationId: 'corr-1' } as any;

      await controller.downloadDocumentByToken(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('declined') })
      );
      expect(mockStorageService.fileExists).not.toHaveBeenCalled();
    });

    it('rejects a download for an out-of-turn sequential signer while the document is still pending (H4)', async () => {
      const signer = makeSignerRow({ signing_order: 1 });
      const previousSigner = makeSignerRow({ id: 'signer-0', signing_order: 0, status: 'pending' });
      mockPool.query
        .mockResolvedValueOnce({ rows: [signer] })
        .mockResolvedValueOnce({ rows: [makeDocumentRow({ workflow_type: 'sequential' })] })
        .mockResolvedValueOnce({ rows: [previousSigner, signer] });

      mockRequest = { params: { token: 'good-token' }, correlationId: 'corr-1' } as any;

      await controller.downloadDocumentByToken(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('not your turn') })
      );
      expect(mockStorageService.fileExists).not.toHaveBeenCalled();
    });

    it('still serves the file for a declined signer once the document is completed (H4: declined check is pending-only, guards against hoisting it out of that block)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow({ status: 'declined' })] })
        .mockResolvedValueOnce({ rows: [makeDocumentRow({ status: 'completed' })] })
        .mockResolvedValueOnce({ rows: [makeSignerRow({ status: 'declined' })] });
      mockStorageService.fileExists.mockResolvedValue(true);
      mockStorageService.downloadFile.mockResolvedValue(Buffer.from('pdf-bytes'));

      mockRequest = { params: { token: 'good-token' }, correlationId: 'corr-1' } as any;

      await controller.downloadDocumentByToken(mockRequest as Request, mockResponse as Response);

      expect(responseSend).toHaveBeenCalledWith(Buffer.from('pdf-bytes'));
      expect(responseStatus).not.toHaveBeenCalledWith(400);
    });

    it("still serves the file for a signed signer mid-workflow in a pending parallel document (Sign.tsx's post-submit \"Download Signed Document\" button)", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow({ status: 'signed' })] })
        .mockResolvedValueOnce({ rows: [makeDocumentRow({ workflow_type: 'parallel' })] })
        .mockResolvedValueOnce({ rows: [makeSignerRow({ status: 'signed' })] });
      mockStorageService.fileExists.mockResolvedValue(true);
      mockStorageService.downloadFile.mockResolvedValue(Buffer.from('pdf-bytes'));

      mockRequest = { params: { token: 'good-token' }, correlationId: 'corr-1' } as any;

      await controller.downloadDocumentByToken(mockRequest as Request, mockResponse as Response);

      expect(responseSend).toHaveBeenCalledWith(Buffer.from('pdf-bytes'));
      expect(responseStatus).not.toHaveBeenCalledWith(400);
    });

    it('does not leak internal error details (e.g. a storage path) when the file download unexpectedly fails (H6)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow({ status: 'signed' })] })
        .mockResolvedValueOnce({ rows: [makeDocumentRow({ status: 'completed' })] })
        .mockResolvedValueOnce({ rows: [makeSignerRow({ status: 'signed' })] });
      mockStorageService.fileExists.mockResolvedValue(true);
      mockStorageService.downloadFile.mockRejectedValue(new Error('ENOENT: /srv/storage/documents/secret.pdf'));

      mockRequest = { params: { token: 'good-token' }, correlationId: 'corr-1' } as any;

      await controller.downloadDocumentByToken(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        success: false,
        error: 'An error occurred while processing your request',
      });
      expect(responseJson).not.toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('/srv/storage') })
      );
    });

    it('returns 404 for an invalid signing token', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      mockRequest = { params: { token: 'bad-token' }, correlationId: 'corr-1' } as any;

      await controller.downloadDocumentByToken(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(404);
    });

    it('still returns a clean 404 (not 500) when the file is missing from storage', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow()] })
        .mockResolvedValueOnce({ rows: [makeDocumentRow()] })
        .mockResolvedValueOnce({ rows: [makeSignerRow()] });
      mockStorageService.fileExists.mockResolvedValue(false);

      mockRequest = { params: { token: 'good-token' }, correlationId: 'corr-1' } as any;

      await controller.downloadDocumentByToken(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(404);
    });
  });
});
