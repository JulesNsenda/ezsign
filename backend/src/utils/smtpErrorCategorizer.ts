/**
 * SMTP Error Categorizer
 *
 * Turns an SMTP send failure into one of a small set of fixed messages. The
 * raw error can name the instance's host, port and auth username, so it is
 * safe to log server-side but must never reach a caller who is not an
 * instance admin - see `smtpErrorRedaction.ts`, which owns that policy.
 *
 * Live call sites (all four share this classification, so a change here
 * changes what every one of them tells its caller):
 *   - `utils/smtpErrorRedaction.ts` - the per-document email log and activity
 *     timeline endpoints
 *   - `controllers/adminSettingsController.ts` - the admin SMTP test-send
 *   - `controllers/signerController.ts` - the per-signer resend
 *   - `controllers/signingController.ts` - send-for-signature
 *
 * **Reply codes are parsed, never substring-matched.** An SMTP status code is
 * a token at a known position; searching for `'550'` anywhere in the text
 * matches `Connection timed out after 5500 ms`, and searching for `'5.1.1'`
 * matches the IP literal in `ENOTFOUND smtp-host-at-195.1.16.4`. Both invert
 * the whole point of the recipient categories: they would tell an operator
 * their signer's address is bad when the instance's own mail transport is
 * down.
 */

export interface CategorizeOptions {
  /** Returned when nothing matches. */
  fallbackMessage?: string;
}

/** Leading three-digit SMTP reply code, e.g. `550 5.1.1 User unknown`. */
const REPLY_CODE = /(?:^|[\s(])(\d{3})[\s-]/;
/** Enhanced status code, e.g. `5.1.1`. Bounded so an IP literal cannot match. */
const ENHANCED_CODE = /(?:^|[\s(])([245])\.(\d{1,3})\.(\d{1,3})(?=$|[\s,;)])/;

const RECIPIENT_REJECTED_REPLY_CODES = new Set(['550', '551', '553', '450']);
const MAILBOX_FULL_REPLY_CODES = new Set(['452', '552']);

const RECIPIENT_REJECTED_PHRASES = [
  'user unknown',
  'no such user',
  'no such recipient',
  'recipient address rejected',
  'mailbox unavailable',
  'address does not exist',
];
const MAILBOX_FULL_PHRASES = ['mailbox full', 'over quota', 'exceeded storage allocation'];
const DOMAIN_NOT_FOUND_PHRASES = ['domain not found', 'host unknown', 'unrouteable address'];

const TRANSPORT_CODES = new Set([
  'ECONNECTION',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ESOCKET',
]);
/**
 * `email_logs` stores the error *text*, so everything arriving on a read path
 * is a plain string with no `code` property at all. Without these the stored
 * form of a transport failure fell through to the generic fallback - which is
 * how a DNS failure came to read "Email delivery failed" on the activity page.
 */
const TRANSPORT_PHRASES = [
  'enotfound',
  'econnrefused',
  'etimedout',
  'econnection',
  'esocket',
  'connect',
  'timeout',
  'timed out',
];

export function categorizeSmtpError(
  error: unknown,
  options: CategorizeOptions | string = {},
): string {
  // A bare string second argument is the older signature (fallback message).
  const { fallbackMessage = 'Email delivery failed' } =
    typeof options === 'string' ? { fallbackMessage: options } : options;

  const message =
    typeof error === 'string'
      ? error.toLowerCase()
      : error instanceof Error
        ? error.message.toLowerCase()
        : '';
  const code = (error as { code?: string } | undefined)?.code;

  // Credentials first: an auth failure can carry the username, and no other
  // branch should be able to claim it.
  if (code === 'EAUTH' || message.includes('invalid login') || /\bauth\w*\b/.test(message)) {
    return 'Authentication failed';
  }

  const replyCode = REPLY_CODE.exec(message)?.[1];
  const enhanced = ENHANCED_CODE.exec(message);
  const enhancedSubject = enhanced ? `${enhanced[2]}.${enhanced[3]}` : null;

  // A recipient domain that does not resolve, as reported *by the relay* in
  // an SMTP reply. Deliberately not inferred from a local `ENOTFOUND`:
  // nodemailer connects to the configured SMTP host, not to the recipient's
  // MX, so a `getaddrinfo` failure names the instance's own host and says
  // nothing about the recipient.
  //
  // An earlier version of this file tried to tell the two apart by checking
  // whether the raw error text contained the recipient's domain. That both
  // misfired on the ordinary self-hosted case (host `smtp.example.com`,
  // recipient `@example.com` - the owner was told their signer's domain was
  // missing while the instance's own transport was down) and, because the
  // recipient address is caller-chosen, turned the returned category into a
  // one-bit oracle over exactly the text the admin-only gate withholds.
  if (
    enhancedSubject === '1.2' ||
    DOMAIN_NOT_FOUND_PHRASES.some((phrase) => message.includes(phrase))
  ) {
    return 'Recipient domain not found';
  }

  // Recipient-side failures. Safe to name precisely, and naming them is the
  // point of the activity timeline: the other categories describe the
  // *instance's* mail setup, which a document owner has no business seeing,
  // but "that address does not exist" describes the address they typed in
  // themselves. Collapsing it into a generic failure recreates the exact
  // complaint the feature exists to answer.
  if (
    (replyCode && RECIPIENT_REJECTED_REPLY_CODES.has(replyCode)) ||
    enhancedSubject === '1.1' ||
    enhancedSubject === '1.0' ||
    RECIPIENT_REJECTED_PHRASES.some((phrase) => message.includes(phrase))
  ) {
    return 'Recipient address rejected';
  }
  if (
    (replyCode && MAILBOX_FULL_REPLY_CODES.has(replyCode)) ||
    enhancedSubject === '2.2' ||
    MAILBOX_FULL_PHRASES.some((phrase) => message.includes(phrase))
  ) {
    return 'Recipient mailbox is full';
  }

  if (
    (code && TRANSPORT_CODES.has(code)) ||
    TRANSPORT_PHRASES.some((phrase) => message.includes(phrase))
  ) {
    return 'SMTP connection failed';
  }

  return fallbackMessage;
}
