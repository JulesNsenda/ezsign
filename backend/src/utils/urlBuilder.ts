/**
 * Pure URL-building helpers for signer-facing links.
 *
 * Extracted from `EmailService` so that both provider-mode and legacy-mode
 * sends - and any other caller that has already resolved `app.url` via
 * `SettingsService.getAppUrl()` - construct the exact same URL shapes
 * without going through EmailService itself. No `baseUrl` is ever captured
 * here; callers resolve it fresh per call.
 */

/** Builds the signing link a signer uses to open their signing session. */
export function buildSigningUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/sign/${token}`;
}

/** Builds the link used to download a document (e.g. after completion). */
export function buildDownloadUrl(baseUrl: string, documentId: string): string {
  return `${baseUrl}/api/documents/${documentId}/download`;
}
