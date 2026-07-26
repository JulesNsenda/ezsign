import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { LocalStorageAdapter } from './LocalStorageAdapter';
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

/**
 * Exercises the SEC-C2 containment guard against a real temp directory
 * (rather than a mocked fs) - the adapter is automocked
 * (`jest.mock('@/adapters/LocalStorageAdapter')`) in most controller test
 * suites, so this is the only place that runs it for real.
 */
describe('LocalStorageAdapter path containment', () => {
  let baseDir: string;
  let outsideFile: string;
  let adapter: LocalStorageAdapter;

  beforeEach(async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ezsign-storage-test-'));
    baseDir = path.join(root, 'storage');
    await fs.mkdir(baseDir, { recursive: true });

    // A file outside baseDir that a traversal attempt would target.
    outsideFile = path.join(root, 'secret.txt');
    await fs.writeFile(outsideFile, 'top secret');

    adapter = new LocalStorageAdapter(baseDir);
  });

  afterEach(async () => {
    await fs.rm(path.dirname(baseDir), { recursive: true, force: true });
  });

  describe('throwing methods', () => {
    it('save() rejects a traversal key and writes nothing outside base', async () => {
      await expect(
        adapter.save(Buffer.from('x'), '../secret.txt')
      ).rejects.toThrow();

      const untouched = await fs.readFile(outsideFile, 'utf-8');
      expect(untouched).toBe('top secret');
    });

    it('save() accepts an ordinary nested filename', async () => {
      const stored = await adapter.save(Buffer.from('hello'), 'doc.pdf', {
        directory: 'documents',
      });

      expect(stored).toBe('documents/doc.pdf');
      const written = await fs.readFile(path.join(baseDir, 'documents', 'doc.pdf'), 'utf-8');
      expect(written).toBe('hello');
    });

    it('save() with options.metadata writes the sibling .meta.json at the expected path (getMetadataPath unchanged for a normal key)', async () => {
      await adapter.save(Buffer.from('hello'), 'doc.pdf', {
        directory: 'documents',
        metadata: { uploadedBy: 'test' },
      });

      const metaPath = path.join(baseDir, 'documents', 'doc.pdf.meta.json');
      const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
      expect(meta).toEqual({ uploadedBy: 'test' });
    });

    it('read() rejects a traversal key', async () => {
      await expect(adapter.read('../secret.txt')).rejects.toThrow();
    });

    it('read() rejects an absolute path', async () => {
      // Asserting the failure reason, not just "it throws" - the pre-guard
      // adapter (`path.join(basePath, filePath)`) also throws here, but
      // only coincidentally: joining an absolute path onto basePath
      // produces a garbled path that happens not to exist, so it fails
      // with "File not found", not because anything was contained.
      await expect(adapter.read(outsideFile)).rejects.toThrow(/Storage key rejected/);
    });

    it('getMetadata() rejects a traversal key', async () => {
      await expect(adapter.getMetadata('../secret.txt')).rejects.toThrow();
    });

    it('copy() rejects a traversal destination', async () => {
      await adapter.save(Buffer.from('hello'), 'doc.pdf');
      await expect(adapter.copy('doc.pdf', '../escaped.pdf')).rejects.toThrow();
    });

    it('move() rejects a traversal source', async () => {
      await expect(adapter.move('../secret.txt', 'doc.pdf')).rejects.toThrow();
    });
  });

  describe('soft-fail methods', () => {
    it('exists() returns false (not a throw) for a traversal key', async () => {
      await expect(adapter.exists('../secret.txt')).resolves.toBe(false);
    });

    it('exists() returns false for a Windows drive-absolute key', async () => {
      // Asserting only `resolves.toBe(false)` is also true of the pre-guard
      // adapter, coincidentally: joining a drive-absolute key onto basePath
      // produces a path that simply doesn't exist, so fs.access() throws
      // and the catch returns false regardless of any containment check.
      // Spying on the guard's own warn call proves it was actually rejected
      // by the guard, not just "not found" for an unrelated reason.
      await expect(adapter.exists('C:\\Windows\\System32\\config\\SAM')).resolves.toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        'Rejected storage path outside base directory in exists()',
        expect.objectContaining({ filePath: 'C:\\Windows\\System32\\config\\SAM' })
      );
    });

    it('delete() returns false (not a throw) for a traversal key', async () => {
      await expect(adapter.delete('../secret.txt')).resolves.toBe(false);

      // Confirm nothing outside base was touched.
      const untouched = await fs.readFile(outsideFile, 'utf-8');
      expect(untouched).toBe('top secret');
    });

    // Not asserted here: delete()'s pre-existing ENOENT branch for an
    // ordinary missing file (unrelated to containment, unchanged by this
    // guard) - `error instanceof Error` fails under jest-environment-node's
    // realm for a real fs.unlink ENOENT, a pre-existing, codebase-wide
    // pattern this task didn't touch. Confirmed present before this change
    // too (reproduces identically against the pre-guard adapter).
  });
});
