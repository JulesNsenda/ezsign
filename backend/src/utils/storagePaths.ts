import * as path from 'path';
import logger from '@/services/loggerService';

/**
 * Storage path containment (SEC-C2)
 *
 * `path.join(base, key)` normalizes `..` segments but does not confine the
 * result to `base` - `path.join('/base', '../../etc/passwd')` resolves to
 * `/etc/passwd`. `resolveWithinStorage` is the single shared chokepoint that
 * contains a storage key against `base`: every module that turns a
 * DB-sourced or otherwise untrusted key into a filesystem path must go
 * through it (or through `LocalStorageAdapter`, which does).
 *
 * This containment is purely lexical (string/segment comparison via
 * `path.resolve`/`path.relative`), not filesystem-aware: it does not resolve
 * symlinks. A symlink planted inside `base` pointing outside it would still
 * pass this guard - the key's *path string* stays within `base`, even
 * though the file it ultimately reaches does not. Nothing under `base` is
 * currently attacker-writable as a symlink target through this codebase's
 * upload paths, so this is a documented limitation, not a fix here (no
 * `fs.realpath`).
 */

/**
 * `C:foo` (drive-relative, no separator after the colon) and `C:\foo`
 * (drive-absolute) both start with a drive letter and a colon. Node's
 * `path.resolve` handling of the drive-relative form is inconsistent
 * depending on whether it happens to share a drive letter with `base` -
 * sometimes it stays contained by accident, sometimes it silently resolves
 * against the process's cwd on that drive instead, ignoring `base`
 * entirely. Rejecting on the prefix alone removes that inconsistency.
 */
const WINDOWS_DRIVE_PREFIX_RE = /^[a-zA-Z]:/;

/**
 * Two (or more) leading separators is how UNC paths (`\\server\share\...`)
 * and the Windows long-path prefix (`\\?\C:\...`) are spelled. A *single*
 * leading separator, by contrast, is the form `path.join` already tolerates
 * today (real stored keys rely on it) and is deliberately left alone here -
 * it is stripped, not rejected, in the next step.
 *
 * Note this is why `path.isAbsolute(key)` is not used for this check: it
 * returns `true` for both a single leading separator and a double one, on
 * every platform (POSIX and win32 alike) - it cannot tell the tolerated form
 * apart from the UNC/long-path form.
 */
const DOUBLE_LEADING_SEPARATOR_RE = /^[\\/]{2}/;

/**
 * Resolve `key` against `base`, guaranteeing the result stays within `base`.
 * Throws on any containment violation - callers that need soft-fail
 * behaviour (`exists`/`delete`) catch at the call site, since the correct
 * failure mode differs by caller (see `LocalStorageAdapter`). The rejected
 * key is logged here (server-side only) rather than interpolated into the
 * thrown message - `errorHandler` returns `err.message` to the client for
 * unhandled 500s, so the message itself must stay generic.
 *
 * Order matters:
 *  1. Reject keys that a naive separator-strip would not neutralize: a
 *     Windows drive prefix, or a double-leading-separator (UNC/long-path).
 *  2. Strip a *single* leading separator - preserves `path.join`'s current
 *     tolerance for keys like `/documents/x.pdf`.
 *  3. Resolve and compare with `path.relative`, not a `startsWith` prefix
 *     check on the raw strings - a prefix check on `/base` would also
 *     match the sibling directory `/basement`. The escape check itself
 *     must not be a bare `relative.startsWith('..')` either - that also
 *     false-rejects legitimate root-level keys like `..foo.pdf`, whose
 *     `path.relative` output starts with `..` without actually escaping.
 *     Only `..` itself or a `..` segment (`..` + separator) means escape;
 *     both separator forms are checked since a key can arrive with
 *     posix-style separators on win32.
 */
export function resolveWithinStorage(base: string, key: string): string {
  if (WINDOWS_DRIVE_PREFIX_RE.test(key) || DOUBLE_LEADING_SEPARATOR_RE.test(key)) {
    logger.warn('Storage key rejected: looks like an absolute or drive-qualified path', { key });
    throw new Error('Storage key rejected: looks like an absolute or drive-qualified path');
  }

  const stripped = key.replace(/^[\\/]+/, '');

  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(resolvedBase, stripped);
  const relative = path.relative(resolvedBase, resolved);

  const escapesRoot =
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    relative.startsWith('../') ||
    path.isAbsolute(relative);

  if (escapesRoot) {
    logger.warn('Storage key rejected: escapes storage root', { key });
    throw new Error('Storage key rejected: escapes storage root');
  }

  return resolved;
}
