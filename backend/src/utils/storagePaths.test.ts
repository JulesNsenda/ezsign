import * as path from 'path';
import { resolveWithinStorage } from './storagePaths';

jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('resolveWithinStorage', () => {
  const base = path.join('C:', 'storage');

  describe('traversal rejected', () => {
    const traversalKeys = [
      '../../../../etc/passwd',
      '..\\..\\secrets',
      'documents/../../etc/passwd',
    ];

    for (const key of traversalKeys) {
      it(`rejects ${JSON.stringify(key)}`, () => {
        expect(() => resolveWithinStorage(base, key)).toThrow();
      });
    }

    it('rejects a Windows drive-absolute path', () => {
      expect(() => resolveWithinStorage(base, 'C:\\Windows\\System32\\config\\SAM')).toThrow();
    });

    it('rejects a Windows drive-relative path (C:foo)', () => {
      // Node's path.resolve treats this inconsistently depending on
      // whether the drive letter happens to match `base` - reject
      // unconditionally rather than rely on that.
      expect(() => resolveWithinStorage(base, 'C:foo')).toThrow();
    });

    it('rejects a UNC path', () => {
      expect(() => resolveWithinStorage(base, '\\\\server\\share\\secret.txt')).toThrow();
    });

    it('rejects a Windows long-path prefix (\\\\?\\C:\\x)', () => {
      expect(() => resolveWithinStorage(base, '\\\\?\\C:\\x')).toThrow();
    });

    it('rejects a bare ".."', () => {
      expect(() => resolveWithinStorage(base, '..')).toThrow();
    });

    it('rejects an empty-after-strip key (a single separator alone)', () => {
      expect(() => resolveWithinStorage(base, '/')).toThrow();
    });
  });

  describe('ordinary keys accepted', () => {
    it('accepts an ordinary nested key', () => {
      const resolved = resolveWithinStorage(base, 'documents/x/y.pdf');
      expect(resolved).toBe(path.resolve(base, 'documents', 'x', 'y.pdf'));
    });

    it('accepts a leading-slash key (preserving path.join\'s current tolerance)', () => {
      const resolved = resolveWithinStorage(base, '/documents/x.pdf');
      expect(resolved).toBe(path.resolve(base, 'documents', 'x.pdf'));
    });

    it('accepts a leading-backslash key', () => {
      const resolved = resolveWithinStorage(base, '\\documents\\x.pdf');
      expect(resolved).toBe(path.resolve(base, 'documents', 'x.pdf'));
    });

    it('accepts the bogus-but-contained key templateService.ts writes today ([object Object])', () => {
      // Known pre-existing defect (templateService.ts:43-47 stores the
      // UploadedFile object, not .storedPath) - the resulting key still
      // resolves inside base, so the guard accepts it and it fails as
      // ENOENT exactly as it does today. Not fixed here.
      expect(() => resolveWithinStorage(base, '[object Object]')).not.toThrow();
    });

    // F6: `relative.startsWith('..')` alone false-rejects legitimate
    // root-level keys whose name merely starts with two dots - `..foo.pdf`
    // never escapes `base`, it just happens to produce a `path.relative`
    // string that also starts with "..". Only a bare `..` or a `..`
    // *segment* (followed by a separator) means an actual escape.
    it('accepts a root-level key starting with two dots ("..foo.pdf")', () => {
      const resolved = resolveWithinStorage(base, '..foo.pdf');
      expect(resolved).toBe(path.resolve(base, '..foo.pdf'));
    });

    it('accepts a root-level key that is all dots plus an extension ("...pdf")', () => {
      const resolved = resolveWithinStorage(base, '...pdf');
      expect(resolved).toBe(path.resolve(base, '...pdf'));
    });
  });

  describe('rejected-key error messages do not leak the key', () => {
    // F6: errorHandler returns `err.message` to the client for unhandled
    // 500s, so the thrown message must stay generic - the rejected key is
    // only ever logged (see the mocked logger above), never interpolated.
    it('omits the key from the thrown message on an absolute/drive-qualified rejection', () => {
      expect(() => resolveWithinStorage(base, 'C:\\Windows\\System32\\config\\SAM')).toThrow(
        /Storage key rejected/
      );
      try {
        resolveWithinStorage(base, 'C:\\Windows\\System32\\config\\SAM');
      } catch (error) {
        expect((error as Error).message).not.toContain('SAM');
      }
    });

    it('omits the key from the thrown message on an escapes-root rejection', () => {
      const traversalKey = '../../../../etc/passwd';
      expect(() => resolveWithinStorage(base, traversalKey)).toThrow(/Storage key rejected/);
      try {
        resolveWithinStorage(base, traversalKey);
      } catch (error) {
        expect((error as Error).message).not.toContain('passwd');
      }
    });
  });
});
