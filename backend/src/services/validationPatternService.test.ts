import {
  validationPatternService,
  RegexValidationRejectedError,
  VALIDATION_PATTERNS,
} from './validationPatternService';

jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('validationPatternService - ReDoS guards', () => {
  describe('validateValue', () => {
    it('rejects a value over the length cap before compiling/testing any regex', () => {
      const oversized = 'a'.repeat(513);

      expect(() => validationPatternService.validateValue(oversized, 'alpha')).toThrow(
        RegexValidationRejectedError
      );
    });

    it('rejects a customRegex over the length cap before compiling', () => {
      const oversizedRegex = `^(${'a'.repeat(260)})$`; // > 256 chars

      expect(() =>
        validationPatternService.validateValue('aaa', 'custom', oversizedRegex)
      ).toThrow(RegexValidationRejectedError);
    });

    it('rejects a nested-quantifier custom pattern instead of compiling/testing it', () => {
      // The exact catastrophic-backtracking shape from the reported ReDoS report.
      // Assert on elapsed wall-clock, not just the thrown error: a
      // synchronous test can't be interrupted by Jest's own timeout, so if
      // the guard regresses and this falls through to `.test()`, the
      // assertion below would still eventually pass after the backtracking
      // finishes - just tens of seconds later instead of instantly.
      const t0 = Date.now();
      expect(() =>
        validationPatternService.validateValue(
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!',
          'custom',
          '(a+)+$'
        )
      ).toThrow(RegexValidationRejectedError);
      expect(Date.now() - t0).toBeLessThan(50);
    });

    it('rejects the nested-quantifier shape fast enough to fail on a revert instead of hanging on one', () => {
      // The test above uses a 30-char run against `(a+)+$` - a deliberately
      // dramatic input matching the reported ReDoS. But at that size, a
      // *reverted* guard doesn't fail this test quickly: `.test()` still
      // eventually returns (V8's backtracking terminates), it just takes
      // tens of seconds to do it, during which this test - and the whole
      // suite - hangs rather than going red. That's not a useful regression
      // check for anyone running the suite.
      //
      // A 20-char run against the same pattern keeps the "fixed" side
      // instant (guard rejects before compiling) while making the
      // "reverted" side slow enough to clear the 50ms bound in well under a
      // second - independently measured at ~150ms cold (fresh process) for
      // this exact shape and length - so a revert here shows up as a fast,
      // clean failure instead of a wedged test run. Growth is exponential
      // (~2x per extra character), so do not enlarge this without
      // re-measuring: 24 chars measured ~2.3s cold and ~6.7s once observed
      // under ts-jest's transform overhead in this exact suite.
      const craftedValue = 'a'.repeat(20) + '!';

      const t0 = Date.now();
      expect(() =>
        validationPatternService.validateValue(craftedValue, 'custom', '(a+)+$')
      ).toThrow(RegexValidationRejectedError);
      expect(Date.now() - t0).toBeLessThan(50);
    });

    it('rejects other nested-quantifier shapes', () => {
      const nestedQuantifierPatterns = ['(a*)*', '(a+)*', '(\\d+)+'];

      for (const pattern of nestedQuantifierPatterns) {
        expect(() => validationPatternService.validateValue('x', 'custom', pattern)).toThrow(
          RegexValidationRejectedError
        );
      }
    });

    it('still validates a normal preset pattern correctly', () => {
      expect(validationPatternService.validateValue('test@example.com', 'email')).toEqual({
        valid: true,
      });
      expect(validationPatternService.validateValue('not-an-email', 'email').valid).toBe(false);
    });

    it('still validates a normal custom pattern correctly', () => {
      expect(
        validationPatternService.validateValue('ABC-123', 'custom', '^[A-Z]{3}-\\d{3}$')
      ).toEqual({ valid: true });
      expect(
        validationPatternService.validateValue('abc-123', 'custom', '^[A-Z]{3}-\\d{3}$').valid
      ).toBe(false);
    });

    it('does not hang on the url preset - regression for a nested-quantifier group inside a built-in pattern', () => {
      // The `url` preset's trailing group used to be `([\/\w .-]*)*` - a
      // group quantified by `*` repeated by an outer `*`, the same
      // catastrophic-backtracking shape `hasNestedQuantifier` rejects for
      // custom patterns. Presets bypass that check entirely (they're
      // developer-authored, not attacker-supplied), so the preset regex
      // itself had to stop being vulnerable. A short value well under the
      // 512-char cap is enough to wedge the old pattern for a very long time.
      //
      // The boolean assertion alone doesn't detect a regression here: the
      // old, vulnerable regex returns the same `false` for this crafted
      // input eventually, it just takes a very long time to get there, and
      // Jest's per-test timeout can't interrupt synchronous backtracking.
      // Assert elapsed wall-clock too.
      const craftedValue = 'a.aa/' + 'a'.repeat(40) + '!';

      const t0 = Date.now();
      const result = validationPatternService.validateValue(craftedValue, 'url');
      expect(Date.now() - t0).toBeLessThan(50);

      expect(result.valid).toBe(false);
    });

    it('rejects a nested-quantifier pattern padded past the detector\'s old inner window', () => {
      // Regression: the detector's inner bound used to be a fixed {1,120},
      // shorter than MAX_CUSTOM_REGEX_LENGTH (256). A quantified group with
      // more than 120 chars of content - still well under the 256-char cap -
      // slipped past the old detector while remaining the exact nested-
      // quantifier shape it exists to catch.
      const padded = '([' + 'a'.repeat(120) + ']+)+';
      expect(padded.length).toBeLessThanOrEqual(256);

      expect(() => validationPatternService.validateValue('x', 'custom', padded)).toThrow(
        RegexValidationRejectedError
      );
    });

    it('does not reject a user pasting the currency preset back in as a custom pattern', () => {
      // Regression: `hasNestedQuantifier` used to treat the currency
      // preset's bounded `(,\d{3})*` group as the dangerous nested-quantifier
      // shape, so a user copying EzSign's own documented currency pattern
      // into a "custom" field got a 400.
      expect(() =>
        validationPatternService.validateValue('$1,234.56', 'custom', VALIDATION_PATTERNS.currency.regex)
      ).not.toThrow();
      expect(
        validationPatternService.validateValue('$1,234.56', 'custom', VALIDATION_PATTERNS.currency.regex)
      ).toEqual({ valid: true });
    });

    it('does not reject any of the 15 documented presets when pasted back in as a custom pattern', () => {
      for (const info of Object.values(VALIDATION_PATTERNS)) {
        expect(() =>
          validationPatternService.validateValue(info.example, 'custom', info.regex)
        ).not.toThrow();
      }
    });

    it('does not fall through to a polluted Object.prototype property for patternId "constructor"', () => {
      // `VALIDATION_PATTERNS['constructor']` is a truthy inherited property
      // (the `Object` constructor) on any plain object, so a naive
      // `!VALIDATION_PATTERNS[patternId]` check doesn't treat it as unknown.
      // A boolean-outcome test can't actually tell the fixed behavior apart
      // from the bug here: `pattern.regex` is `undefined` either way absent
      // pollution, `new RegExp(undefined)` compiles to `/(?:)/`, and that
      // matches every value - the exact same `{valid: true}` the fixed
      // "unknown pattern, skip" path also returns. To make the difference
      // observable, simulate a separate prototype-pollution primitive
      // elsewhere in the app having already planted `Object.prototype.regex`
      // - the buggy lookup would then compile and test *that* value.
      const hadOwnRegexProp = Object.prototype.hasOwnProperty.call(Object.prototype, 'regex');
      const originalRegexProp = (Object.prototype as Record<string, unknown>).regex;
      (Object.prototype as Record<string, unknown>).regex = '^should-never-match-an-ordinary-value$';

      try {
        const result = validationPatternService.validateValue(
          'some ordinary value',
          'constructor' as never
        );

        // Fixed: 'constructor' is not an own property of VALIDATION_PATTERNS,
        // so it's treated as unknown and skipped - the polluted
        // Object.prototype.regex is never consulted, let alone compiled.
        expect(result).toEqual({ valid: true });
      } finally {
        if (hadOwnRegexProp) {
          (Object.prototype as Record<string, unknown>).regex = originalRegexProp;
        } else {
          delete (Object.prototype as Record<string, unknown>).regex;
        }
      }
    });
  });

  describe('isValidRegex', () => {
    it('rejects a pattern over the length cap before compiling', () => {
      const oversizedRegex = `^(${'a'.repeat(260)})$`;

      expect(() => validationPatternService.isValidRegex(oversizedRegex)).toThrow(
        RegexValidationRejectedError
      );
    });

    it('rejects a nested-quantifier pattern before compiling', () => {
      expect(() => validationPatternService.isValidRegex('(a+)+$')).toThrow(
        RegexValidationRejectedError
      );
    });

    it('still validates an ordinary pattern correctly', () => {
      expect(validationPatternService.isValidRegex('^[A-Z]{3}-\\d{3}$')).toBe(true);
      expect(validationPatternService.isValidRegex('[unterminated')).toBe(false);
    });
  });
});
