import { hasNestedQuantifier, MAX_CUSTOM_REGEX_LENGTH, MAX_VALUE_LENGTH } from './regexGuard';
import { VALIDATION_PATTERNS } from '@/services/validationPatternService';

describe('regexGuard', () => {
  describe('hasNestedQuantifier', () => {
    it('rejects the classic (X+)+ / (X*)* nested-quantifier shapes', () => {
      const dangerous = ['(a+)+$', '(a*)*', '(a+)*', '(\\d+)+'];

      for (const pattern of dangerous) {
        expect(hasNestedQuantifier(pattern)).toBe(true);
      }
    });

    it('rejects the (X+)+ shape when the group is non-capturing (?:...)', () => {
      // Regression: NESTED_QUANTIFIER_RE was briefly refactored in a way
      // that stopped matching a non-capturing group prefix `(?:` - only
      // `(` immediately followed by the atom, not `(?:` followed by the
      // atom, was recognized. `(?:\?:)?` in the regex source restores
      // tolerance for that optional non-capturing prefix. Every pattern
      // here must still be flagged with that piece in place.
      const nonCapturing = ['(?:a+)+', '(?:\\d*)*', '(?:[a-z]*)*'];

      for (const pattern of nonCapturing) {
        expect(hasNestedQuantifier(pattern)).toBe(true);
      }
    });

    it('does not flag a non-capturing group whose content is not a single quantified atom', () => {
      // `(?:abc)+` repeats a fixed 3-character literal - no ambiguous
      // decomposition, no catastrophic backtracking. Must not be flagged,
      // with or without the `(?:\?:)?` piece (it never matched this shape,
      // since the group's content is more than a single atom).
      expect(hasNestedQuantifier('(?:abc)+')).toBe(false);
    });

    it('rejects a nested-quantifier bracket class padded past a naive fixed-width window', () => {
      // Regression: an earlier version of this detector bounded the inner
      // group content to a fixed window shorter than MAX_CUSTOM_REGEX_LENGTH,
      // letting a padded-but-still-dangerous group slip through under the
      // length cap.
      const padded = '([' + 'a'.repeat(120) + ']+)+';
      expect(padded.length).toBeLessThanOrEqual(MAX_CUSTOM_REGEX_LENGTH);

      expect(hasNestedQuantifier(padded)).toBe(true);
    });

    it('does not flag a bounded inner quantifier ({m,n}) - it caps the multiplier, it is linear', () => {
      const linear = [
        '(\\d{3})+',
        '^\\d{1,3}(,\\d{3})*$',
        '^([A-Z]{2}\\d{4})+$',
      ];

      for (const pattern of linear) {
        expect(hasNestedQuantifier(pattern)).toBe(false);
      }
    });

    it('does not flag a quantified atom preceded by a literal separator inside the group', () => {
      // `(,\d{3})*` and `(\.\d+)*` are safe: each outer-loop iteration must
      // start with a literal character that isn't part of what's being
      // repeated, so there is exactly one way to decompose a matching
      // input - no cross-iteration ambiguity, no exponential backtracking.
      expect(hasNestedQuantifier('^-?\\$?\\d{1,3}(,\\d{3})*(\\.\\d{2})?$')).toBe(false); // currency preset
      expect(hasNestedQuantifier('^\\d+(\\.\\d+)*$')).toBe(false);
    });

    it('accepts every preset in VALIDATION_PATTERNS - a user pasting the documented ' +
      'presets back in as a "custom" pattern must not get rejected', () => {
      for (const info of Object.values(VALIDATION_PATTERNS)) {
        expect(hasNestedQuantifier(info.regex)).toBe(false);
      }
      // Sanity: make sure this actually exercised all 15 documented presets,
      // not an empty or partial list.
      expect(Object.keys(VALIDATION_PATTERNS)).toHaveLength(15);
    });

    it('known gap: does not detect a nested GROUP one level down from the outer quantifier', () => {
      // `((a+))+` is just as catastrophic as `(a+)+` - the repeated group
      // here is the outer `(...)`, and its content `(a+)` is itself a group
      // containing an unbounded quantifier - but this heuristic only
      // inspects the immediate content of the outer-quantified group for a
      // single atom+quantifier, one level deep. Documented here as a known
      // gap per @/utils/regexGuard's docstring, not silently left untested.
      expect(hasNestedQuantifier('((a+))+')).toBe(false);
    });

    it('known gap: does not detect alternation-overlap blowup', () => {
      // `(a|a)+` and `(a+|b)+` can also blow up exponentially (ambiguous
      // alternatives inside a repeated group), but neither has the
      // "single atom quantified, then repeated" shape this heuristic keys
      // off. Documented known gap, not silently left untested.
      expect(hasNestedQuantifier('(a|a)+$')).toBe(false);
      expect(hasNestedQuantifier('(a+|b)+')).toBe(false);
    });

    it('cannot itself hang regardless of input length (only bounded, non-nested repetition)', () => {
      const longInnocuous = '(' + 'x'.repeat(MAX_CUSTOM_REGEX_LENGTH) + ')?';
      const t0 = Date.now();
      hasNestedQuantifier(longInnocuous);
      expect(Date.now() - t0).toBeLessThan(50);
    });
  });

  describe('constants', () => {
    it('exports the shared length caps used by both call sites', () => {
      expect(MAX_CUSTOM_REGEX_LENGTH).toBe(256);
      expect(MAX_VALUE_LENGTH).toBe(512);
    });
  });
});
