import { categorizeSmtpError } from '@/utils/smtpErrorCategorizer';

/**
 * Who may see raw SMTP error text, in one place.
 *
 * `error_message` on an email log describes the *instance's* SMTP transport -
 * host, port, auth username - not anything document-scoped, so owning the
 * document does not earn it. Without this gate, any user on a multi-user
 * instance can upload a document, add a signer at a nonexistent domain, send,
 * and read the instance's SMTP host and username back out of the failure.
 * Everyone else with document access gets the categorized string.
 *
 * This lives in one module because it is a disclosure *policy*, not a helper:
 * it is enforced by both `/documents/:id/emails` and
 * `/documents/:id/activity`, and a future change ("team owners may see raw
 * errors too") must not be able to land in one of them and not the other.
 */
export function canSeeRawSmtpError(role: string | undefined): boolean {
  return role === 'admin';
}

/**
 * Replaces raw SMTP errors with their categorized form on any page of rows
 * carrying an `errorMessage`. Rows without one pass through untouched.
 */
export function redactSmtpErrors<
  T extends { errorMessage: string | null; recipientEmail?: string | null },
>(rows: T[]): T[] {
  return rows.map((row) =>
    row.errorMessage
      ? {
          ...row,
          errorMessage: categorizeSmtpError(
            row.errorMessage,
            undefined,
            row.recipientEmail?.split('@')[1]
          ),
        }
      : row
  );
}
