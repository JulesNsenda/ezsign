import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { validationService } from './validationService';
import type { ValidationConfig } from '@/types';

/**
 * `validationService.ts` deliberately carries its own copy of the backend's
 * `MAX_CUSTOM_REGEX_LENGTH` and `NESTED_QUANTIFIER_RE` (see the module's own
 * comment: "the backend module isn't importable from the frontend"). Both
 * constants are module-private (not exported), so this file can't `import`
 * them to compare - instead it reads the frontend source text directly and
 * asserts the literal declarations are present verbatim. The two constants
 * drifted once already during this change; a source-text tripwire fails
 * loudly the next time only one side of the copy gets edited.
 *
 * The expected literal is stated here (not derived) so a change to either
 * side has to touch this file too:
 *   const NESTED_QUANTIFIER_RE = /\((?:\?:)?(?:\\.|\[[^\]]*\]|[^()])[+*]\??\)[+*]/;
 *   const MAX_CUSTOM_REGEX_LENGTH = 256;
 * This is the exact same regex source as `backend/src/utils/regexGuard.ts`'s
 * `NESTED_QUANTIFIER_RE` (see that file, which the backend test suite
 * exercises independently) - kept as two hardcoded literals rather than a
 * shared import because there is no shared import across the frontend/
 * backend boundary here.
 */
describe('validationService - frontend/backend regex-guard parity', () => {
  const sourceText = fs.readFileSync(path.join(__dirname, 'validationService.ts'), 'utf-8');

  it('declares MAX_CUSTOM_REGEX_LENGTH with the exact value the backend guard uses (256)', () => {
    expect(sourceText).toContain('const MAX_CUSTOM_REGEX_LENGTH = 256;');
  });

  it('declares NESTED_QUANTIFIER_RE byte-identical to backend/src/utils/regexGuard.ts', () => {
    // String.raw so the backslashes below are exactly what appears in the
    // source file - no double-escaping to keep straight.
    const expectedDeclaration =
      'const NESTED_QUANTIFIER_RE = ' +
      String.raw`/\((?:\?:)?(?:\\.|\[[^\]]*\]|[^()])[+*]\??\)[+*]/` +
      ';';

    expect(sourceText).toContain(expectedDeclaration);
  });

  // Belt-and-suspenders on top of the source-text tripwire above: even if
  // the literal were rewritten in an equivalent-but-differently-spelled way
  // that still contained the substring check, the regex must actually
  // *behave* the same as the backend's for the shapes that matter. This
  // doesn't replace the tripwire (a byte-for-byte source difference should
  // fail even if behavior happens to coincide on this sample), but it means
  // a "fix" that satisfies the tripwire by coincidence still gets caught.
  it('behaves identically to the backend nested-quantifier shapes on a parity table', () => {
    // Mirrors backend/src/utils/regexGuard.test.ts's fixtures exactly.
    const parityTable: Array<{ pattern: string; expected: boolean }> = [
      { pattern: '(a+)+$', expected: true },
      { pattern: '(a*)*', expected: true },
      { pattern: '(a+)*', expected: true },
      { pattern: '(\\d+)+', expected: true },
      { pattern: '(?:a+)+', expected: true },
      { pattern: '(?:\\d*)*', expected: true },
      { pattern: '(?:[a-z]*)*', expected: true },
      { pattern: '(?:abc)+', expected: false },
      { pattern: '(\\d{3})+', expected: false },
      { pattern: '^\\d{1,3}(,\\d{3})*$', expected: false },
      { pattern: '^-?\\$?\\d{1,3}(,\\d{3})*(\\.\\d{2})?$', expected: false }, // currency preset
    ];

    for (const { pattern, expected } of parityTable) {
      const config: ValidationConfig = { pattern: 'custom', customRegex: pattern };
      const result = validationService.validateValueLocally('x', config);
      // A flagged pattern is rejected with the guard's own message, before
      // ever compiling/testing the regex against the value.
      if (expected) {
        expect(result).toEqual({ valid: false, message: 'Invalid custom pattern configuration' });
      } else {
        // Not flagged: the pattern actually gets compiled and tested against
        // 'x', which fails for all of these (they don't match a bare 'x'),
        // but with the *pattern's own* message, not the guard's rejection.
        expect(result.valid).toBe(false);
        expect(result.message).not.toBe('Invalid custom pattern configuration');
      }
    }
  });
});

describe('validationService.validateValueLocally - reject-before-compile branch', () => {
  // `validateValueLocally` runs on every keystroke while signing, with no
  // server round-trip - see the module-level comment. A custom regex that
  // is over-length or has the nested-quantifier ReDoS shape must be
  // rejected before `new RegExp()`/`.test()` ever runs against it.

  it('rejects a customRegex over the length cap before compiling', () => {
    const oversizedRegex = `^(${'a'.repeat(260)})$`; // > 256 chars
    const config: ValidationConfig = { pattern: 'custom', customRegex: oversizedRegex };

    const result = validationService.validateValueLocally('anything', config);

    expect(result).toEqual({ valid: false, message: 'Invalid custom pattern configuration' });
  });

  it('rejects a nested-quantifier customRegex with the guard\'s message, not the compiled pattern\'s', () => {
    const config: ValidationConfig = { pattern: 'custom', customRegex: '(a+)+$' };

    const result = validationService.validateValueLocally('aaaaaaaaaaaaaaaaaaaa!', config);

    expect(result).toEqual({ valid: false, message: 'Invalid custom pattern configuration' });
  });

  it('rejects the nested-quantifier shape fast enough to fail on a revert instead of hanging on one', () => {
    // Mirrors the backend's `validationPatternService.test.ts` equivalent:
    // a small (20-char) crafted value keeps the fixed branch instant while
    // still making a *reverted* guard (falling through to `new RegExp().test()`)
    // slow enough to clear the 50ms bound in well under a second - so a
    // revert shows up as a fast, clean failure rather than a hung test run.
    // Growth is exponential; do not enlarge without re-measuring.
    const config: ValidationConfig = { pattern: 'custom', customRegex: '(a+)+$' };
    const craftedValue = 'a'.repeat(20) + '!';

    const t0 = Date.now();
    const result = validationService.validateValueLocally(craftedValue, config);
    expect(Date.now() - t0).toBeLessThan(50);

    expect(result).toEqual({ valid: false, message: 'Invalid custom pattern configuration' });
  });

  it('still validates an ordinary custom pattern correctly (no false-positive rejection)', () => {
    const config: ValidationConfig = { pattern: 'custom', customRegex: '^[A-Z]{3}-\\d{3}$' };

    expect(validationService.validateValueLocally('ABC-123', config)).toEqual({ valid: true });
    expect(validationService.validateValueLocally('abc-123', config).valid).toBe(false);
  });
});
