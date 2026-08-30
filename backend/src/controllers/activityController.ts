import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { createActivityService } from '@/services/activityService';
import { AuditService } from '@/services/auditService';
import { parsePageParam, parsePageSizeParam } from '@/utils/pagination';
import { canSeeRawSmtpError, redactSmtpErrors } from '@/utils/smtpErrorRedaction';

/**
 * `checkDocumentAccess` rejects a malformed id as a side effect of looking it
 * up, but the instance-admin bypass skips that middleware entirely - so an
 * admin's `/documents/not-a-uuid/activity` would otherwise reach the query
 * and surface a raw Postgres type error as a 500. Validate here instead.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ActivityController {
  private activityService: ReturnType<typeof createActivityService>;
  private auditService: AuditService;

  constructor(pool: Pool, auditService?: AuditService) {
    this.activityService = createActivityService(pool);
    this.auditService = auditService ?? new AuditService(pool);
  }

  /**
   * A document's activity timeline - lifecycle events and email attempts in
   * one time-ordered stream.
   *
   * GET /api/documents/:id/activity
   *
   * Two limits a consumer of this endpoint has to respect:
   *
   * - **The timeline is best-effort, not an attested log.** Audit writes
   *   swallow their own failures so they can never fail a user's operation,
   *   and a crash between a COMMIT and its post-commit emit loses that row.
   *   Reconcile against `signers.signed_at` / `documents.completed_at` rather
   *   than treating an absent row as proof nothing happened.
   * - **It does not survive the document.** `audit_events.document_id` and
   *   `email_logs.document_id` are both `ON DELETE CASCADE`, so deleting a
   *   document erases its whole timeline. An empty response means "no rows",
   *   which is not distinguishable from "the document was deleted".
   */
  getDocumentActivity = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const documentId = req.params.id;
      if (!documentId || !UUID_PATTERN.test(documentId)) {
        res.status(400).json({ error: 'A valid document ID is required' });
        return;
      }

      const page = parsePageParam(req.query.page);
      const limit = parsePageSizeParam(req.query.pageSize);

      const { items, total, totalPages } = await this.activityService.getByDocumentId(
        documentId,
        page,
        limit
      );

      res.json({
        items: canSeeRawSmtpError(req.user?.role) ? items : redactSmtpErrors(items),
        pagination: { total, page, limit, total_pages: totalPages },
        // Whether the caller may act on what they are reading. An instance
        // admin reaches this timeline through `allowAdmin`, but the resend
        // endpoint it would offer (`POST /:id/signers/:signerId/resend`) is
        // `checkDocumentAccess`-only - so a Resend button rendered for them
        // would 403 for exactly the user the bypass exists to help. The
        // server knows which door the caller came through; the client cannot
        // infer it, so it is stated here rather than guessed.
        permissions: { canResend: !req.usedAdminBypass },
      });

      // An instance admin reading a document they do not own is the one
      // access on this endpoint that the audit trail should itself show: a
      // compromised admin account enumerating tenants is otherwise
      // indistinguishable from normal operation after the fact. Recorded
      // after the response so it can never delay or fail the read, and as a
      // system event rather than a document lifecycle verb - reusing `viewed`
      // would mean "the signer opened this" in every timeline that renders it.
      if (req.usedAdminBypass && req.user) {
        await this.auditService.recordEvent({
          document_id: documentId,
          user_id: req.user.userId,
          event_type: 'admin.activity_viewed',
          ip_address: req.ip ?? null,
          user_agent: req.get('user-agent') ?? null,
          metadata: { actor_email: req.user.email },
        });
      }
    } catch (error) {
      next(error);
    }
  };
}
