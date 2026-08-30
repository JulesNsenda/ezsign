import { escapeHtml, safeUrl, safeMailto } from './emailTemplate';

describe('emailTemplate', () => {
  describe('escapeHtml', () => {
    it('should escape ampersand, angle brackets, double and single quotes', () => {
      expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
    });

    it('should escape ampersand before the entities it introduces (no double-escaping)', () => {
      expect(escapeHtml('<')).toBe('&lt;');
      expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    });

    it('should neutralize an attribute break-out payload', () => {
      const payload = `x" onerror="alert(1)`;
      const escaped = escapeHtml(payload);
      expect(escaped).not.toContain('"');
      expect(escaped).toBe('x&quot; onerror=&quot;alert(1)');
    });

    it('should neutralize a script tag', () => {
      const escaped = escapeHtml('<script>alert(1)</script>');
      expect(escaped).not.toContain('<script>');
      expect(escaped).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('should coerce numbers and other non-string values to strings', () => {
      expect(escapeHtml(42)).toBe('42');
      expect(escapeHtml(true)).toBe('true');
    });

    it('should return empty string for null and undefined', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    it('should return empty string for empty string input', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should leave plain text unchanged', () => {
      expect(escapeHtml('John Doe')).toBe('John Doe');
    });
  });

  describe('safeUrl', () => {
    it('should pass through a valid http URL unchanged', () => {
      expect(safeUrl('http://example.com/path')).toBe('http://example.com/path');
    });

    it('should pass through a valid https URL unchanged', () => {
      expect(safeUrl('https://ezsign.com/sign/abc123')).toBe('https://ezsign.com/sign/abc123');
    });

    it('should reject javascript: URLs', () => {
      expect(safeUrl('javascript:alert(1)')).toBe('');
    });

    it('should reject javascript: URLs regardless of case', () => {
      expect(safeUrl('JaVaScRiPt:alert(1)')).toBe('');
    });

    it('should reject entity-obfuscated javascript: URLs', () => {
      expect(safeUrl('java&#10;script:alert(1)')).toBe('');
    });

    it('should reject whitespace-obfuscated javascript: URLs', () => {
      expect(safeUrl('java\nscript:alert(1)')).toBe('');
      expect(safeUrl('\tjavascript:alert(1)')).toBe('');
    });

    it('should reject data: URLs', () => {
      expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    });

    it('should reject protocol-relative URLs', () => {
      expect(safeUrl('//evil.com')).toBe('');
    });

    it('should reject vbscript: URLs', () => {
      expect(safeUrl('vbscript:msgbox(1)')).toBe('');
    });

    it('should return empty string for null, undefined and empty string', () => {
      expect(safeUrl(null)).toBe('');
      expect(safeUrl(undefined)).toBe('');
      expect(safeUrl('')).toBe('');
    });

    it('should return empty string for an unparseable value', () => {
      expect(safeUrl('not a url at all')).toBe('');
    });

    it('should reject a raw double quote by percent-encoding it (URL normalization)', () => {
      // WHATWG URL percent-encodes an unescaped '"' in the query string, so
      // the returned value never contains a raw quote either way.
      const result = safeUrl('https://example.com/?q="onmouseover="alert(1)');
      expect(result).not.toContain('"');
    });

    it('should HTML-escape a literal ampersand that URL normalization leaves intact', () => {
      // '&' is a legal URL character and is not percent-encoded, so the
      // escapeHtml step is what protects the surrounding href="" attribute.
      const result = safeUrl('https://example.com/?a=1&b=2');
      expect(result).toBe('https://example.com/?a=1&amp;b=2');
    });
  });

  describe('safeMailto', () => {
    it('should build a mailto: href for a valid email', () => {
      expect(safeMailto('support@example.com')).toBe('mailto:support@example.com');
    });

    it('should reject a value without an @', () => {
      expect(safeMailto('not-an-email')).toBe('');
    });

    it('should reject a value without a domain', () => {
      expect(safeMailto('user@')).toBe('');
    });

    it('should reject a javascript: value', () => {
      expect(safeMailto('javascript:alert(1)')).toBe('');
    });

    it('should reject a local part containing a double quote rather than pass it through escaped', () => {
      // Previously this fell through to escapeHtml and shipped as
      // 'mailto:a&quot;b@example.com' - tightened alongside the `? & = ' < >`
      // rejection below: a raw '"' has no place in a bare local@domain
      // address, so reject it outright instead of rendering an
      // escaped-but-still-wrong mailto: target.
      expect(safeMailto('a"b@example.com')).toBe('');
    });

    it('should reject a mailto header-injection payload (bcc/subject smuggling via ?, &, =)', () => {
      expect(safeMailto('a@b.c?bcc=attacker@x&subject=Urgent')).toBe('');
    });

    it('should reject values containing a single quote or angle brackets', () => {
      expect(safeMailto(`a'b@example.com`)).toBe('');
      expect(safeMailto('a<b@example.com')).toBe('');
      expect(safeMailto('a>b@example.com')).toBe('');
    });

    it('should return empty string for null, undefined and empty string', () => {
      expect(safeMailto(null)).toBe('');
      expect(safeMailto(undefined)).toBe('');
      expect(safeMailto('')).toBe('');
    });
  });
});
