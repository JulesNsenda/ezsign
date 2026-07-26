import { SignerService, SignerNotFoundError } from './signerService';

/**
 * SEC-H3 coverage: `getSignerById`, `updateSigner`, `deleteSigner`,
 * `assignFieldsToSigner`, and `canSignInSequentialWorkflow` all now require a
 * `documentId` and scope their SQL with `AND document_id = $n`, and
 * `updateSigner` additionally gates `signing_order`/`status` mutation behind
 * the document still being `draft`.
 *
 * IMPORTANT re: detection power. `pool.query` is a bare `jest.fn()` here - it
 * returns whatever the test queues, not what a real scoped query would
 * filter. So a test that only asserts on the *return value* (e.g. "signer
 * from another document resolves to null") passes identically whether the
 * production SQL is scoped or not, because the mock - not the code - decided
 * what came back. The only channel that actually detects a reverted
 * `AND document_id = $n` predicate is asserting on the query string/params
 * `pool.query` was called with. Every SEC-H3 test below therefore pairs a
 * `toHaveBeenCalledWith(expect.stringContaining('document_id = $n'), [...])`
 * assertion with the behavioral one - do not drop the stringContaining half
 * as "redundant" in a later cleanup pass; it is the load-bearing half.
 */
describe('SignerService (SEC-H3 document scoping + draft gate)', () => {
  let service: SignerService;
  let mockPool: any;

  const documentId = 'doc-1';
  const signerId = 'signer-1';

  function makeSignerRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: signerId,
      document_id: documentId,
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

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    };
    service = new SignerService(mockPool);
  });

  describe('getSignerById', () => {
    it('scopes the lookup with AND document_id = $2', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [makeSignerRow()] });

      const result = await service.getSignerById(signerId, documentId);

      expect(result?.id).toBe(signerId);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('document_id = $2'),
        [signerId, documentId]
      );
    });

    it('returns null for a signer that exists but belongs to a different document', async () => {
      // The scoped query is what would exclude this row in a real database;
      // here we simulate "no match" the same way Postgres would for a
      // cross-document id. The stringContaining assertion above is what
      // actually proves the predicate is present - this test alone would
      // pass even against unscoped SQL, since the mock, not the query,
      // supplies the empty result.
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getSignerById(signerId, 'other-doc');

      expect(result).toBeNull();
      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [signerId, 'other-doc']);
    });
  });

  describe('updateSigner', () => {
    it('throws SignerNotFoundError for a signer belonging to another document', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // scoped getSignerById

      await expect(service.updateSigner(signerId, documentId, { name: 'New Name' })).rejects.toThrow(
        SignerNotFoundError
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('document_id = $2'),
        [signerId, documentId]
      );
    });

    it('updates a non-order/status field (name) without touching document status at all', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow()] }) // scoped getSignerById
        .mockResolvedValueOnce({ rows: [makeSignerRow({ name: 'New Name' })] }); // final UPDATE

      const result = await service.updateSigner(signerId, documentId, { name: 'New Name' });

      expect(result.name).toBe('New Name');
      // Exactly two queries: the scoped lookup and the update - no
      // `SELECT status FROM documents` in between. This is the flip side of
      // the draft gate: if it were ever widened to cover every field (not
      // just signing_order/status), ordinary edits on a pending document
      // would start failing.
      expect(mockPool.query).toHaveBeenCalledTimes(2);
      expect(mockPool.query).not.toHaveBeenCalledWith(
        expect.stringContaining('FROM documents'),
        expect.anything()
      );

      const [finalQuery, finalParams] = mockPool.query.mock.calls[1];
      expect(finalQuery).toContain('document_id = $3');
      expect(finalParams).toEqual(['New Name', signerId, documentId]);
    });

    it('rejects a signing_order change when the document is not draft', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow({ signing_order: 1 })] }) // scoped getSignerById
        .mockResolvedValueOnce({ rows: [{ status: 'pending' }] }); // document status check

      await expect(service.updateSigner(signerId, documentId, { signing_order: 2 })).rejects.toThrow(
        'Signing order and status can only be changed while the document is still in draft'
      );

      expect(mockPool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('SELECT status FROM documents WHERE id = $1'),
        [documentId]
      );
      // Only two queries ran - no duplicate-order check, no UPDATE - the
      // draft gate short-circuits before either.
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('rejects a status change when the document is not draft', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow({ status: 'pending' })] })
        .mockResolvedValueOnce({ rows: [{ status: 'sent' }] });

      await expect(service.updateSigner(signerId, documentId, { status: 'signed' })).rejects.toThrow(
        'Signing order and status can only be changed while the document is still in draft'
      );
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('allows a signing_order change when the document is draft', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow({ signing_order: 1 })] }) // scoped getSignerById
        .mockResolvedValueOnce({ rows: [{ status: 'draft' }] }) // document status check
        .mockResolvedValueOnce({ rows: [] }) // duplicate signing_order check
        .mockResolvedValueOnce({ rows: [makeSignerRow({ signing_order: 2 })] }); // final UPDATE

      const result = await service.updateSigner(signerId, documentId, { signing_order: 2 });

      expect(result.signing_order).toBe(2);
      const [finalQuery, finalParams] = mockPool.query.mock.calls[3];
      expect(finalQuery).toContain('document_id = $3');
      expect(finalParams).toEqual([2, signerId, documentId]);
    });

    it('allows a status change when the document is draft', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow({ status: 'pending' })] })
        .mockResolvedValueOnce({ rows: [{ status: 'draft' }] })
        .mockResolvedValueOnce({ rows: [makeSignerRow({ status: 'signed' })] }); // final UPDATE (no duplicate check for status)

      const result = await service.updateSigner(signerId, documentId, { status: 'signed' });

      expect(result.status).toBe('signed');
      const [finalQuery, finalParams] = mockPool.query.mock.calls[2];
      expect(finalQuery).toContain('document_id = $3');
      expect(finalParams).toEqual(['signed', signerId, documentId]);
    });
  });

  describe('deleteSigner', () => {
    it('returns false for a signer belonging to another document, without deleting anything', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // scoped getSignerById

      const result = await service.deleteSigner(signerId, documentId);

      expect(result).toBe(false);
      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('document_id = $2'),
        [signerId, documentId]
      );
    });

    it('scopes both the field-detach and the DELETE with the document predicate', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow()] }) // scoped getSignerById
        .mockResolvedValueOnce({ rows: [] }) // detach fields
        .mockResolvedValueOnce({ rowCount: 1 }); // DELETE

      const result = await service.deleteSigner(signerId, documentId);

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('document_id = $2'),
        [signerId, documentId]
      );
    });
  });

  describe('assignFieldsToSigner', () => {
    it('throws SignerNotFoundError for a signer belonging to another document', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // scoped getSignerById

      await expect(service.assignFieldsToSigner(signerId, documentId, ['field-1'])).rejects.toThrow(
        SignerNotFoundError
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('document_id = $2'),
        [signerId, documentId]
      );
    });

    it('scopes the fields UPDATE with AND document_id = $3', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow()] }) // scoped getSignerById
        .mockResolvedValueOnce({ rows: [{ document_id: documentId }] }) // per-field ownership check
        .mockResolvedValueOnce({ rows: [] }); // UPDATE fields

      await service.assignFieldsToSigner(signerId, documentId, ['field-1']);

      expect(mockPool.query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('document_id = $3'),
        ['signer@example.com', ['field-1'], documentId]
      );
    });
  });

  describe('canSignInSequentialWorkflow', () => {
    it('returns "Signer not found" for a signer belonging to another document', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // scoped getSignerById

      const result = await service.canSignInSequentialWorkflow(signerId, documentId);

      expect(result).toEqual({ canSign: false, reason: 'Signer not found' });
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('document_id = $2'),
        [signerId, documentId]
      );
    });

    it('resolves canSign for a signer that does belong to the document (parallel, no order)', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [makeSignerRow({ signing_order: null })] });

      const result = await service.canSignInSequentialWorkflow(signerId, documentId);

      expect(result).toEqual({ canSign: true });
    });
  });

  /**
   * Intentionally unscoped - not a gap in the fix. `markAsSigned` is dead
   * code today (the live signing write path is
   * `signingController.submitSignature`, which updates `signers` directly -
   * see the docstring in `signerService.ts`), so it was deliberately left
   * taking only `signerId`. `getSignerByAccessToken` is looked up by the
   * signing token itself, which *is* the credential - there is no
   * `documentId` to scope against until after the token has already resolved
   * a signer.
   */
  describe('deliberately unscoped methods', () => {
    it('markAsSigned looks up by id alone (documented dead path, not a SEC-H3 gap)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [makeSignerRow()] })
        .mockResolvedValueOnce({ rows: [makeSignerRow({ status: 'signed' })] });

      await service.markAsSigned(signerId);

      expect(mockPool.query).toHaveBeenNthCalledWith(1, expect.any(String), [signerId]);
    });

    it('getSignerByAccessToken looks up by token alone (the token is the credential)', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [makeSignerRow()] });

      const result = await service.getSignerByAccessToken('token-abc');

      expect(result?.id).toBe(signerId);
      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), ['token-abc']);
    });
  });
});
