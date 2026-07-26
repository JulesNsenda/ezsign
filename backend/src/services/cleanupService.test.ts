import { Pool } from 'pg';
import { CleanupService } from './cleanupService';

jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

/**
 * SEC-C2: `deleteDocumentFiles` is one of the eight bypass sites
 * (`path.join(basePath, key)` with no containment) - covers the guard now
 * wrapping its two `key`s (the main document file, and the per-row
 * signature path). The orphan-scan methods (`cleanupOrphanedDocumentFiles`,
 * `cleanupOrphanedSignatures`) walk the filesystem outward and compare
 * against DB rows rather than resolving an untrusted key inward, so they
 * are not part of this bypass class and are untouched.
 */
describe('CleanupService.deleteDocumentFiles path containment', () => {
  let mockPool: { query: jest.Mock };
  let service: CleanupService;

  beforeEach(() => {
    mockPool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    service = new CleanupService(mockPool as unknown as Pool, '/storage');
  });

  it('rejects a traversal document file path instead of unlinking outside the base', async () => {
    await expect(
      service.deleteDocumentFiles('doc-1', '../../../../etc/passwd')
    ).rejects.toThrow();

    // The broken `document_id` query (known, pre-existing, not fixed here)
    // means this never gets reached in practice either way, but confirms
    // the guard rejects before any fs call is attempted.
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('does not throw for an ordinary nested document file path (only the fs.unlink itself can fail, and that is swallowed for ENOENT)', async () => {
    // No real file exists at this path, but the guard must not be what
    // rejects it - only downstream ENOENT handling should apply, and this
    // method already swallows the ENOENT case in the main file branch.
    await expect(
      service.deleteDocumentFiles('doc-2', 'documents/does-not-exist.pdf')
    ).resolves.toBeUndefined();
  });
});
