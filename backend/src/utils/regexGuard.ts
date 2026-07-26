/**
 * Regex ReDoS guard
 *
 * Shared length caps and nested-quantifier detector for any code path that
 * compiles a user-suppliable regex pattern (custom field validation regexes,
 * either via the `/api/util` routes or the `Field` model) or executes one
 * against a user-suppliable value. Kept as a single copy - a shared leaf
 * module - so the call sites (`validationPatternService` and `Field`) can't
 * drift into divergent (and possibly under-protective) guards.
 */

/** User-supplied regex source - capped well below anything a legitimate pattern needs. */
export const MAX_CUSTOM_REGEX_LENGTH = 256;

/** Value tested against a pattern - capped well below anything a real form field needs. */
export const MAX_VALUE_LENGTH = 512;

/**
 * Best-effort syntactic heuristic for the classic ReDoS shape `(X+)+` /
 * `(X*)*` / `(X+)*` / etc: a group (capturing, or non-capturing via `(?:`)
 * whose ENTIRE content is a single atom (an escape sequence like `\d`, a
 * bracket class like `[a-z]`, or one literal character) quantified by
 * `+`/`*`, itself wrapped in an outer
 * `+`/`*`. That "entire content is just the atom" restriction is what keeps
 * this from flagging patterns like the `currency` preset's
 * `(,\d{3})*` - there the group's content is a literal `,` *followed by* a
 * quantified atom, not the quantified atom alone, so a real input can only
 * decompose into outer-loop iterations one way (each iteration must start
 * with the literal `,`) and there is no backtracking blowup.
 *
 * This is a syntactic check, not a semantic one, and it is NOT a complete
 * ReDoS detector - no static check for arbitrary JS regexes is achievable.
 * Known gaps, left undetected on purpose rather than papered over:
 *   - Nested groups: `((a+))+` - the dangerous repetition is one level down
 *     from the outer `+`, which this only inspects one level deep.
 *   - Alternation overlap: `(a|a)+` or `(a+|b)+` - overlapping alternatives
 *     inside a repeated group can blow up with no literal-quantifier shape
 *     at all for this to key off.
 * Do not rely on this as a security boundary by itself - it catches the
 * common case and rejecting a pattern is cheap (the caller can explain why),
 * but a clean pattern here does not mean the pattern is safe. The paired
 * length cap (`MAX_CUSTOM_REGEX_LENGTH`) and the ban on this endpoint being
 * reachable with attacker-chosen *values* (see `validationPatternService`
 * and `Field`) matter at least as much.
 *
 * The check itself only ever applies bounded, non-nested repetition to the
 * input, so it cannot itself become a ReDoS vector regardless of input
 * length.
 */
const NESTED_QUANTIFIER_RE = /\((?:\?:)?(?:\\.|\[[^\]]*\]|[^()])[+*]\??\)[+*]/;

export function hasNestedQuantifier(pattern: string): boolean {
  return NESTED_QUANTIFIER_RE.test(pattern);
}
