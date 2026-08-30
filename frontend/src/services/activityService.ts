import apiClient from '@/api/client';

/**
 * Document activity service.
 *
 * Backs `GET /api/documents/:id/activity`, which returns one time-ordered
 * stream of a document's lifecycle events and every email we tried to send
 * for it. Field names mirror `backend/src/services/activityService.ts`
 * exactly - the payload is camelCase apart from `pagination.total_pages`,
 * which follows the document routes' existing envelope.
 */

/** Which table a row came from. */
export type ActivityKind = 'audit' | 'email';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  createdAt: string;
  /** `event_type` for audit rows, `email_type` for email rows. */
  type: string;
  /** Email delivery status; null on audit rows. */
  status: string | null;
  /**
   * Why an email failed. Raw SMTP text for instance admins, a categorized
   * summary for everyone else - the raw form names the instance's SMTP host
   * and username, which document access does not earn.
   */
  errorMessage: string | null;
  subject: string | null;
  recipientEmail: string | null;
  /**
   * The user behind the action. Live identity where the account still
   * exists, falling back to the address recorded at the time.
   */
  actorEmail: string | null;
  /** Null when no signer resolved - such a row cannot be resent. */
  signerId: string | null;
  signerEmail: string | null;
  signerName: string | null;
  /** Audit rows only; always null on email rows. */
  metadata: Record<string, unknown> | null;
}

export interface ActivityResponse {
  items: ActivityItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
  /**
   * What the caller may *do* with what they are reading. An instance admin
   * reaches this timeline through a route-local bypass, but the resend
   * endpoint is owner/team-only - so the server states whether the action is
   * available rather than letting the client guess and render a button that
   * 403s.
   */
  permissions: {
    canResend: boolean;
  };
}

export const activityService = {
  async getDocumentActivity(
    documentId: string,
    page = 1,
    pageSize = 20
  ): Promise<ActivityResponse> {
    const response = await apiClient.get(`/documents/${documentId}/activity`, {
      params: { page, pageSize },
    });
    return response.data;
  },
};

export default activityService;
