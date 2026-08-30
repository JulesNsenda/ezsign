/**
 * Escaping/allowlisting helpers for values interpolated into outgoing email
 * HTML. Every value that lands inside an HTML tag or attribute in
 * `emailService.ts` must be routed through one of these before
 * interpolation - the values originate from team branding, sender-supplied
 * messages, signer names, and other data that is not code-owned, so treating
 * it as trusted markup is a stored/reflected injection vector (see plan
 * "BUG-5" and Item 0).
 */

/**
 * Escapes a value for safe interpolation into HTML text or attribute
 * content. Coerces non-string input to a string first (mirrors template
 * literal semantics, so callers can pass numbers/dates without a manual
 * `String()`), and treats null/undefined as the empty string rather than the
 * literal text "null"/"undefined".
 *
 * Order matters: `&` must be replaced first, otherwise the ampersands
 * introduced by escaping `< > " '` would themselves get re-escaped.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates a URL for use in an `href`/`src` attribute and returns it
 * HTML-escaped, or returns `''` if it is not a safe http(s) URL.
 *
 * Parses with `new URL()` rather than a regex - entity/whitespace-obfuscated
 * schemes (`java&#10;script:`, `\tjavascript:`) and protocol-relative URLs
 * (`//evil.com`) are exactly the class of thing a regex allowlist misses and
 * `URL` resolves/rejects correctly. Only `http:`/`https:` are allowed; every
 * other scheme (`javascript:`, `data:`, `vbscript:`, etc.) is dropped.
 */
export function safeUrl(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  try {
    const url = new URL(String(value));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '';
    }
    return escapeHtml(url.toString());
  } catch {
    return '';
  }
}

/**
 * Validates a plain `local@domain` mailto target and returns an escaped
 * `mailto:` href, or `''` if it doesn't look like an email address.
 *
 * Separate from `safeUrl` on purpose: `generateFooterLinks` renders a
 * tenant's support address as `mailto:${supportEmail}`, and a uniform
 * http/https scheme allowlist would silently drop every tenant's support
 * link. This is intentionally a narrower, purpose-built check rather than
 * reusing `safeUrl` with an added scheme.
 */
export function safeMailto(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const email = String(value);
  // Excludes `? & = " ' < >` in addition to whitespace/@ - a bare
  // `[^\s@]+` local/domain part admits query-string-like characters, so a
  // support_email of e.g. `a@b.c?bcc=attacker@x&subject=Urgent` would
  // otherwise produce a `mailto:` href with attacker-chosen pre-filled
  // headers (bcc/subject/body).
  const emailRegex = /^[^\s@?&="'<>]+@[^\s@?&="'<>]+\.[^\s@?&="'<>]+$/;
  if (!emailRegex.test(email)) {
    return '';
  }

  return escapeHtml(`mailto:${email}`);
}
