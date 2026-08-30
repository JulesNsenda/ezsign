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
  if (
    code === 'ECONNECTION' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ESOCKET' ||
    message.includes('connect') ||
    message.includes('timeout') ||
    message.includes('timed out')
  ) {
    return 'SMTP connection failed';
  }
  return fallbackMessage;
}
