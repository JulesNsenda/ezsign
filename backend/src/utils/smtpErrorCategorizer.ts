/**
 * SMTP Error Categorizer
 *
 * Categorizes an SMTP send failure into one of a small set of safe,
 * non-identifying messages. The raw error (which can include host/port/
 * credential-adjacent details) is safe to log server-side, but must never
 * be returned to a caller who isn't the document owner or an instance
 * admin.
 *
 * Extracted from `adminSettingsController.ts`'s `categorizeSmtpError`
 * (which still keeps its own copy guarding the admin-only SMTP test-send
 * route) so the same categorization logic also covers the per-document
 * email log endpoints in `emailLogController.ts`.
 */
export function categorizeSmtpError(
  error: unknown,
  fallbackMessage = 'Email delivery failed',
  /**
   * The domain the message was addressed to, when known. Used only to tell a
   * DNS failure for the *recipient's* domain apart from one for the
   * instance's own SMTP host - without it, both read as a transport problem.
   */
  recipientDomain?: string,
): string {
  const message =
    typeof error === 'string'
      ? error.toLowerCase()
      : error instanceof Error
        ? error.message.toLowerCase()
        : '';
  const code = (error as { code?: string } | undefined)?.code;

  if (code === 'EAUTH' || message.includes('auth') || message.includes('invalid login')) {
    return 'Authentication failed';
  }

  // Recipient-side failures, checked BEFORE the transport cases below.
  //
  // These are safe to name precisely, and naming them is the point of the
  // whole activity feature: the categories above and below describe the
  // *instance's* mail setup, which a document owner has no business seeing,
  // but "that address does not exist" describes the address they typed in
  // themselves. Collapsing it into a generic "Email delivery failed" recreates
  // the exact complaint the feature exists to answer - the owner can see that
  // it failed and still not why.
  //
  // Matched on SMTP reply codes and standard status codes rather than free
  // text where possible, since those cannot carry a hostname.
  if (
    message.includes('550') ||
    message.includes('551') ||
    message.includes('553') ||
    message.includes('5.1.1') ||
    message.includes('5.1.0') ||
    message.includes('user unknown') ||
    message.includes('no such user') ||
    message.includes('recipient address rejected') ||
    message.includes('mailbox unavailable') ||
    message.includes('does not exist')
  ) {
    return 'Recipient address rejected';
  }
  if (
    message.includes('452') ||
    message.includes('552') ||
    message.includes('5.2.2') ||
    message.includes('quota') ||
    message.includes('mailbox full')
  ) {
    return 'Recipient mailbox is full';
  }
  // A DNS lookup that named the recipient's own domain. Checked before the
  // transport branch, which would otherwise swallow it as "SMTP connection
  // failed" and point the reader at the instance instead of at the address.
  if (
    (code === 'ENOTFOUND' || message.includes('enotfound') || message.includes('getaddrinfo')) &&
    recipientDomain &&
    message.includes(recipientDomain.toLowerCase())
  ) {
    return 'Recipient domain not found';
  }
  if (
    code === 'ECONNECTION' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ESOCKET' ||
    // The code checks above only fire for a live Error object. `email_logs`
    // stores the *message text*, so every categorisation on the read path
    // arrives as a string with no `code` at all - without these substring
    // checks a stored transport failure fell through to the generic fallback,
    // which is how a DNS failure came out as "Email delivery failed".
    message.includes('enotfound') ||
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('econnection') ||
    message.includes('esocket') ||
    message.includes('connect') ||
    message.includes('timeout') ||
    message.includes('timed out')
  ) {
    return 'SMTP connection failed';
  }
  return fallbackMessage;
}
