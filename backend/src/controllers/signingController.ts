import { Request, Response } from 'express';
import { Pool } from 'pg';
import { Document } from '@/models/Document';
import { Signer } from '@/models/Signer';
import { Signature } from '@/models/Signature';
import { Field } from '@/models/Field';
import { Branding } from '@/models/Branding';
import { EmailService, EmailBranding, CompletionEmailData, SigningRequestEmailData } from '@/services/emailService';
import { PdfService } from '@/services/pdfService';
import { StorageService } from '@/services/storageService';
import { BrandingService } from '@/services/brandingService';
import { AuditService } from '@/services/auditService';
import { socketService } from '@/services/socketService';
import { ReminderService } from '@/services/reminderService';
import { getSettingsService } from '@/services/settingsService';
import { buildSigningUrl, buildDownloadUrl } from '@/utils/urlBuilder';
import { categorizeSmtpError } from '@/utils/smtpErrorCategorizer';
import logger from '@/services/loggerService';
import {
  resolveSigningContext,
  assertDocumentSignable,
  assertDocumentReadable,
  assertFieldsOwnedBySigner,
  isValidUuid,
  mapRowToSignerData,
  mapRowToDocumentData,
  SigningContextError,
} from '@/services/signingContextService';

/** Item 4.6 payload cap: matches the array bound enforced in `validateSignaturesPayload`. */
const MAX_SIGNATURES_PER_SUBMISSION = 50;

export class SigningController {
  private pool: Pool;
  private emailService: EmailService;
  private _pdfService: PdfService;
  private _storageService: StorageService;
  private brandingService: BrandingService;
  private auditService: AuditService;
  private reminderService?: ReminderService;

  constructor(
    pool: Pool,
    emailService: EmailService,
    pdfService: PdfService,
    storageService: StorageService,
    reminderService?: ReminderService,
    auditService?: AuditService
  ) {
    this.pool = pool;
    this.emailService = emailService;
    this._pdfService = pdfService;
    this._storageService = storageService;
    this.brandingService = new BrandingService(pool);
    // Injectable so tests can assert what is recorded: with a mocked pool,
    // every emission fails inside `recordEvent`'s catch and a broken call
    // looks exactly like a working one.
    this.auditService = auditService ?? new AuditService(pool);
    this.reminderService = reminderService;
  }

  /**
   * Convert Branding model to EmailBranding interface
   */
  private convertToEmailBranding(branding: Branding, baseUrl: string): EmailBranding {
    return {
      companyName: branding.company_name,
      logoUrl: branding.getLogoUrl(baseUrl),
      primaryColor: branding.primary_color,
      secondaryColor: branding.secondary_color,
      footerText: branding.email_footer_text,
      supportEmail: branding.support_email,
      supportUrl: branding.support_url,
      privacyUrl: branding.privacy_url,
      termsUrl: branding.terms_url,
      showPoweredBy: branding.show_powered_by,
      hideEzsignBranding: branding.hide_ezsign_branding,
    };
  }

  /**
   * Get email branding for a document based on its team_id
   */
  private async getEmailBranding(teamId: string | null | undefined, baseUrl: string): Promise<EmailBranding | undefined> {
    if (!teamId) {
      return undefined;
    }

    try {
      const branding = await this.brandingService.getByTeamId(teamId);
      if (branding) {
        return this.convertToEmailBranding(branding, baseUrl);
      }
    } catch (error) {
      logger.warn('Failed to fetch branding for email', {
        teamId,
        error: (error as Error).message,
      });
    }

    return undefined;
  }

  /**
   * H6: the three public, unauthenticated signing-token routes below each
   * fell through to a catch-all that echoed `error.message` straight back to
   * the caller once the `SigningContextError` branch (checked first, by
   * every caller of this helper) didn't match - raw driver text,
   * constraint/table names, and (post-H1) an operator-actionable document id
   * and mismatch count. Logs the real error server-side instead and
   * responds with a fixed, generic message. `SigningContextError` messages
   * (SEC-C3/C4/C5, the item-4.6 payload validation) are deliberately NOT
   * routed through here - those are written for the signer and stay
   * verbatim.
   */
  private respondWithGenericSigningError(logMessage: string, error: unknown, req: Request, res: Response): void {
    logger.error(logMessage, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      correlationId: req.correlationId,
    });
    res.status(400).json({ success: false, error: 'An error occurred while processing your request' });
  }

  /**
   * Send document for signature
   * POST /api/documents/:id/send
   */
  sendForSignature = async (req: Request, res: Response): Promise<void> => {
    logger.debug('sendForSignature called', { documentId: req.params.id, correlationId: req.correlationId });
    try {
      const userId = (req as any).user?.userId; // Fixed: should be userId not id
      if (!userId) {
        logger.debug('No userId found, returning 401', { correlationId: req.correlationId });
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const documentId = req.params.id as string;
      const message = req.body?.message;
      logger.debug('Processing send for document', { documentId, userId, correlationId: req.correlationId });

      // Get document
      const docResult = await this.pool.query(
        'SELECT * FROM documents WHERE id = $1',
        [documentId]
      );

      if (docResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const document = new Document(mapRowToDocumentData(docResult.rows[0]));
      logger.debug('Document loaded', { documentId, status: document.status, correlationId: req.correlationId });

      // Check if user owns the document
      if (document.user_id !== userId) {
        logger.debug('Access denied - user does not own document', { documentId, userId, correlationId: req.correlationId });
        res.status(403).json({ success: false, error: 'Access denied' });
        return;
      }

      // Check if document can be sent
      if (!document.canSend()) {
        logger.debug('Document cannot be sent', { documentId, status: document.status, correlationId: req.correlationId });
        res.status(400).json({
          success: false,
          error: `Document cannot be sent in ${document.status} status`,
        });
        return;
      }
      logger.debug('Document can be sent', { documentId, correlationId: req.correlationId });

      // Validate all fields are assigned to signers
      const fieldsResult = await this.pool.query(
        'SELECT * FROM fields WHERE document_id = $1',
        [documentId]
      );
      logger.debug('Fields found', { documentId, count: fieldsResult.rows.length, correlationId: req.correlationId });

      if (fieldsResult.rows.length === 0) {
        logger.debug('No fields found', { documentId, correlationId: req.correlationId });
        res.status(400).json({
          success: false,
          error: 'Document must have at least one field',
        });
        return;
      }

      const unassignedFields = fieldsResult.rows.filter(
        (f) => !f.signer_email || f.signer_email.trim() === ''
      );
      logger.debug('Unassigned fields check', { documentId, unassignedCount: unassignedFields.length, correlationId: req.correlationId });

      if (unassignedFields.length > 0) {
        logger.debug('Some fields are unassigned', { documentId, correlationId: req.correlationId });
        res.status(400).json({
          success: false,
          error: 'All fields must be assigned to signers',
        });
        return;
      }

      // Get all signers
      const signersResult = await this.pool.query(
        'SELECT * FROM signers WHERE document_id = $1',
        [documentId]
      );
      logger.debug('Signers found', { documentId, count: signersResult.rows.length, correlationId: req.correlationId });

      if (signersResult.rows.length === 0) {
        logger.debug('No signers found', { documentId, correlationId: req.correlationId });
        res.status(400).json({
          success: false,
          error: 'Document must have at least one signer',
        });
        return;
      }
      logger.debug('All validations passed, proceeding to send', { documentId, correlationId: req.correlationId });

      // Update document status to pending
      await this.pool.query(
        'UPDATE documents SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['pending', documentId]
      );

      // Emit WebSocket event for document status change
      socketService.emitDocumentUpdate({
        documentId,
        status: 'pending',
        updatedAt: new Date().toISOString(),
        updatedBy: userId,
      });

      // Item 3.2: one `sent` row for the document's draft -> pending
      // transition, emitted here rather than after the per-signer send loop
      // below. Two consequences worth stating, both deliberate:
      //   - It is not per-signer. Which signer got which email, and which
      //     sends failed, is what `email_logs` records; duplicating that per
      //     recipient here would make the timeline unreadable.
      //   - It is NOT suppressed when some sends fail. Since Item 1.4 the
      //     loop continues past a failure, so suppressing would produce
      //     documents that are `pending` with failed emails and no `sent`
      //     event - exactly the blind spot this feature exists to remove.
      // There is no transaction here (the status flip above is a bare
      // UPDATE), so no post-commit staging is needed.
      await this.auditService.recordEvent({
        document_id: documentId,
        user_id: userId,
        event_type: 'sent',
        ip_address: req.ip ?? null,
        user_agent: req.get('user-agent') ?? null,
        metadata: {
          signer_count: signersResult.rows.length,
          // A sequential workflow emails only the first signer, so a bare
          // count would read as "sent to 3" beside a single email-log row -
          // the false-failure impression this feature exists to remove.
          workflow_type: document.workflow_type,
          actor_email: (req as any).user?.email ?? null,
        },
      });

      // Get user info for sender name
      const userResult = await this.pool.query(
        'SELECT email FROM users WHERE id = $1',
        [userId]
      );
      const senderName = userResult.rows[0]?.email || 'Someone';

      // Resolve app base URL fresh (per send) from instance settings
      const baseUrl = await getSettingsService(this.pool).getAppUrl();

      // Fetch branding for email customization
      const emailBranding = await this.getEmailBranding(document.team_id, baseUrl);

      // Send signing requests to all signers (or first signer if sequential).
      // BUG-3 / Item 1.4: each send is wrapped in its own try/catch - the
      // document is already `pending` by this point (and `canSend()`
      // requires `draft`, so a mid-loop throw used to strand it), so one bad
      // address must not stop the remaining signers from being notified or
      // skip reminder scheduling below.
      const signers = signersResult.rows.map((row) => new Signer(mapRowToSignerData(row)));
      const signersFailed: Array<{ signer_id: string; email: string; error: string }> = [];
      let signersNotifiedCount = 0;

      const sendToSigner = async (signer: Signer): Promise<void> => {
        try {
          await this.emailService.sendSigningRequest({
            recipientEmail: signer.email,
            recipientName: signer.name,
            documentTitle: document.title,
            senderName,
            signingUrl: buildSigningUrl(baseUrl, signer.access_token),
            message,
            branding: emailBranding,
            documentId,
            signerId: signer.id,
            userId,
          });
          signersNotifiedCount++;
        } catch (error) {
          logger.error('Failed to send signing request to signer', {
            documentId,
            signerId: signer.id,
            error: (error as Error).message,
            correlationId: req.correlationId,
          });
          // G2: this reaches any team member with document access (the
          // response to this same request), not just the owner or an admin -
          // categorize rather than echo the raw nodemailer error (host/port/
          // credential-adjacent details). The raw message is logged above.
          signersFailed.push({
            signer_id: signer.id,
            email: signer.email,
            error: categorizeSmtpError(error, 'Failed to send signing request'),
          });
        }
      };

      if (document.workflow_type === 'sequential') {
        // For sequential workflow, only send to first signer
        const firstSigner = signers.find((s) => s.signing_order === 0);
        if (firstSigner) {
          await sendToSigner(firstSigner);
        }
      } else {
        // For parallel or single workflow, send to all signers
        for (const signer of signers) {
          await sendToSigner(signer);
        }
      }

      // Schedule deadline reminders if document has an expiration date
      if (this.reminderService && document.expires_at) {
        try {
          const reminders = await this.reminderService.scheduleRemindersForDocument(documentId);
          logger.info('Scheduled deadline reminders for document', {
            documentId,
            reminderCount: reminders.length,
            correlationId: req.correlationId,
          });
        } catch (error) {
          // Log but don't fail the send operation if reminder scheduling fails
          logger.warn('Failed to schedule deadline reminders', {
            documentId,
            error: (error as Error).message,
            correlationId: req.correlationId,
          });
        }
      }

      // G5: a send that notifies nobody deserves a server-side signal even
      // when it isn't surfaced as an error response below (the all-attempted-
      // and-failed case, which stays 200 - see the Item 1.4 comment).
      if (signersNotifiedCount === 0) {
        logger.error('No signer was notified when sending document for signature', {
          documentId,
          workflowType: document.workflow_type,
          signersFailedCount: signersFailed.length,
          correlationId: req.correlationId,
        });
      }

      // G5: `signers.find(s => s.signing_order === 0)` (sequential workflow,
      // above) silently sends nothing if signing_order values don't start at
      // 0 - `signerService.create` only requires `signing_order !== null`,
      // and nothing else enforces consecutive-from-0 ordering. That leaves
      // both counters at zero: nobody was notified AND nobody was even
      // attempted, so `signers_failed` is empty and there is nothing for the
      // per-signer resend endpoint to retry. Unlike the "attempted and all
      // failed" case below (where `signers_failed` gives the UI a retry
      // path), this is reported as a failure rather than a success.
      if (signersNotifiedCount === 0 && signersFailed.length === 0) {
        res.status(500).json({
          success: false,
          error:
            'Failed to send document: no signer could be notified. Check that signing_order values are configured correctly for a sequential workflow.',
          data: {
            document_id: documentId,
            status: 'pending',
            signers_notified: 0,
            signers_failed: [],
          },
        });
        return;
      }

      // Item 1.4 all-failed decision: still 200. The document is durably
      // `pending` regardless of email outcome (the UPDATE above already
      // committed, and `canSend()` forbids re-sending from `pending`), so a
      // transport-level error status here would misrepresent what actually
      // happened - the send was attempted and reminders were scheduled. The
      // per-signer resend endpoint (BUG-1, fixed in Item 1) is the intended
      // recovery path, and `signers_failed` is what the UI needs to offer it.
      res.status(200).json({
        success: true,
        message: signersFailed.length > 0
          ? 'Document sent for signature with some notification failures'
          : 'Document sent for signature',
        data: {
          document_id: documentId,
          status: 'pending',
          signers_notified: signersNotifiedCount,
          signers_failed: signersFailed,
        },
      });
    } catch (error) {
      logger.error('Error sending document for signature', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        documentId: req.params.id,
        correlationId: req.correlationId,
      });
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  };

  /**
   * Get document for signing (by access token)
   * GET /api/signing/:token
   */
  getDocumentBySigningToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const token = req.params.token as string;

      const { signer, document, allSigners } = await resolveSigningContext(this.pool, token);

      // Check if signer already signed
      if (signer.status === 'signed') {
        res.status(400).json({
          success: false,
          error: 'Document already signed by this signer',
        });
        return;
      }

      // SEC-C4: document must still be pending and not past its deadline.
      assertDocumentSignable(document);

      // SEC-C5: for sequential workflow, check if it's this signer's turn
      if (document.workflow_type === 'sequential' && !Signer.canSignInSequence(signer, allSigners)) {
        res.status(400).json({
          success: false,
          error: 'It is not your turn to sign yet (sequential workflow)',
        });
        return;
      }

      // Get fields assigned to this signer
      const fieldsResult = await this.pool.query(
        'SELECT * FROM fields WHERE document_id = $1 AND signer_email = $2',
        [signer.document_id, signer.email]
      );

      const fields = fieldsResult.rows.map((row) => new Field(this.mapRowToFieldData(row)));

      // Get existing signatures for this signer
      const signaturesResult = await this.pool.query(
        'SELECT * FROM signatures WHERE signer_id = $1',
        [signer.id]
      );

      // Item 3.2: record `viewed` once per signer, never per request. This
      // handler is public and unauthenticated, and is hit on every page
      // load, refresh and link-preview bot - a row per request would bury
      // the timeline under noise. The conditional UPDATE is the gate: only
      // the request that actually flips `viewed_at` from NULL gets a row
      // back, so concurrent opens race for one row and exactly one of them
      // emits. Placed after every access gate above, so the event means
      // "this signer was served the document", not "someone hit the URL".
      //
      // `user_id` is necessarily NULL on a token route - the viewer has no
      // account - so the signer is identified in metadata instead, which is
      // also what activityService will join on to render a name.
      //
      // `resolveSigningContext` already SELECTed this signer, so the common
      // case (every open after the first) is settled without touching the
      // database again; the conditional UPDATE still carries `AND viewed_at
      // IS NULL` because that predicate, not this check, is what makes
      // concurrent first-opens race for a single row.
      if (!signer.viewed_at) {
        const viewedResult = await this.pool.query(
          'UPDATE signers SET viewed_at = CURRENT_TIMESTAMP WHERE id = $1 AND viewed_at IS NULL RETURNING id',
          [signer.id]
        );
        if (viewedResult.rows.length > 0) {
          const recorded = await this.auditService.recordEvent({
            document_id: signer.document_id,
            user_id: null,
            event_type: 'viewed',
            ip_address: req.ip ?? null,
            user_agent: req.get('user-agent') ?? null,
            metadata: { signer_id: signer.id, signer_email: signer.email },
          });

          // The UPDATE above autocommits on its own connection, so if the
          // audit write then fails the gate has been consumed and the event
          // can never be emitted or retried - BUG-1's shape with the 500
          // removed. Put the gate back so a later open records it.
          if (!recorded) {
            await this.pool
              .query('UPDATE signers SET viewed_at = NULL WHERE id = $1', [signer.id])
              .catch((error) => {
                logger.warn('Could not release the viewed_at gate after a failed audit write', {
                  signerId: signer.id,
                  error: (error as Error).message,
                });
              });
          }
        }
      }

      res.status(200).json({
        document: document.toPublicJSON(),
        signer: signer.toPublicJSON(),
        fields: fields.map((f) => f.toPublicJSON()),
        signatures: signaturesResult.rows,
      });
    } catch (error) {
      if (error instanceof SigningContextError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      this.respondWithGenericSigningError('Error resolving signing session', error, req, res);
    }
  };

  /**
   * Submit signature
   * POST /api/signing/:token/sign
   */
  submitSignature = async (req: Request, res: Response): Promise<void> => {
    try {
      const token = req.params.token as string;
      // Array of { field_id, signature_type, signature_data, text_value?, font_family? } -
      // structurally validated up front (item 4.6): array bounds, per-entry
      // shape. `text_value`/`font_family` are preserved as-is (defaulted to
      // null, never dropped) - every non-signature field type (radio, text,
      // date, checkbox, dropdown) submits `signature_type: 'typed'` and
      // relies on `text_value` to render.
      const validatedSignatures = this.validateSignaturesPayload(req.body?.signatures);

      const { signer, document, allSigners } = await resolveSigningContext(this.pool, token);

      // Check if signer can sign
      if (signer.status !== 'pending') {
        res.status(400).json({
          success: false,
          error: `Signer is already ${signer.status}`,
        });
        return;
      }

      // SEC-C4: document must still be pending and not past its deadline.
      assertDocumentSignable(document);

      // SEC-C5: for sequential workflow, reject an out-of-turn submission.
      if (document.workflow_type === 'sequential' && !Signer.canSignInSequence(signer, allSigners)) {
        res.status(400).json({
          success: false,
          error: 'It is not your turn to sign yet (sequential workflow)',
        });
        return;
      }

      // Resolve app base URL fresh (per send) from instance settings, before
      // opening the transaction below (avoid holding a client while awaiting).
      const baseUrl = await getSettingsService(this.pool).getAppUrl();

      // BUG-4 / Item 1.5: the completion-notification and next-signer emails
      // used to be awaited *inside* the BEGIN/COMMIT span below - an SMTP
      // failure there hit the catch, which ROLLBACKs a signature that had
      // already been emailed about. Everything each send needs is staged
      // into these locals while the transaction is open; the sends
      // themselves (and the completion reminder-cancellation, which sat in
      // the same span) run only after COMMIT succeeds, so a send failure can
      // never roll back a persisted signature.
      let allSigned = false;
      let completionEmailStaged: { data: CompletionEmailData; teamId: string | null | undefined } | undefined;
      let nextSignerEmailStaged: { data: SigningRequestEmailData; teamId: string | null | undefined } | undefined;
      let cancelDocumentRemindersAfterCommit = false;
      // G4: the completion WebSocket emit was still inside the BEGIN/COMMIT
      // span - a later statement in this same transaction (the owner SELECT,
      // the next-signer lookup, or COMMIT itself) throwing would ROLLBACK
      // after clients were already told "completed". Staged like the emails
      // above and fired only after COMMIT succeeds.
      let completionBroadcastStaged: { documentId: string; ownerId: string } | undefined;

      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        // SEC-C3: every submitted field must belong to this document and be
        // assigned to this signer's email (batched, before any insert). Runs
        // on `client` rather than `this.pool` so the check and the writes
        // below share one session/snapshot instead of two separate
        // connections.
        await assertFieldsOwnedBySigner(
          client,
          validatedSignatures.map((s) => s.field_id),
          signer.document_id,
          signer.email
        );

        // Validate and insert signatures
        for (const sigData of validatedSignatures) {
          const signature = new Signature({
            id: '',
            signer_id: signer.id,
            field_id: sigData.field_id,
            signature_type: sigData.signature_type,
            signature_data: sigData.signature_data,
            text_value: sigData.text_value,
            font_family: sigData.font_family,
            ip_address: req.ip || null,
            user_agent: req.get('user-agent') || null,
            signed_at: new Date(),
            created_at: new Date(),
          });

          // Validate signature. Typed (not a plain Error) so this stays
          // alongside the other intentionally user-facing rejections -
          // see the catch-all's error-taxonomy comment below.
          const validation = signature.validateSignatureData();
          if (!validation.valid) {
            throw new SigningContextError(`Invalid signature: ${validation.errors.join(', ')}`, 400);
          }

          // Insert signature
          await client.query(
            `INSERT INTO signatures (signer_id, field_id, signature_type, signature_data, text_value, font_family, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              signer.id,
              sigData.field_id,
              sigData.signature_type,
              sigData.signature_data,
              sigData.text_value,
              sigData.font_family,
              req.ip || null,
              req.get('user-agent') || null,
            ]
          );
        }

        // Update signer status to signed
        await client.query(
          `UPDATE signers SET status = 'signed', signed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [signer.id]
        );

        // Get document owner for WebSocket emission
        const ownerResult = await client.query(
          'SELECT user_id FROM documents WHERE id = $1',
          [signer.document_id]
        );
        const documentOwnerId = ownerResult.rows[0]?.user_id;

        // Emit WebSocket event for signer status change
        socketService.emitSignerUpdate({
          documentId: signer.document_id,
          signerId: signer.id,
          signerEmail: signer.email,
          status: 'signed',
          signedAt: new Date().toISOString(),
        });

        // Also emit document update to notify owner
        socketService.emitDocumentUpdate({
          documentId: signer.document_id,
          status: 'signing_progress',
          updatedAt: new Date().toISOString(),
          ownerId: documentOwnerId,
        });

        // Cancel any pending reminders for this signer (they have signed)
        if (this.reminderService) {
          try {
            const cancelledCount = await this.reminderService.cancelRemindersForSigner(signer.id);
            if (cancelledCount > 0) {
              logger.debug('Cancelled reminders for signer', {
                signerId: signer.id,
                cancelledCount,
              });
            }
          } catch (error) {
            logger.warn('Failed to cancel signer reminders', {
              signerId: signer.id,
              error: (error as Error).message,
            });
          }
        }

        // Check if all signers have signed (document completion)
        const allSignersResult = await client.query(
          'SELECT * FROM signers WHERE document_id = $1',
          [signer.document_id]
        );

        allSigned = allSignersResult.rows.every((s) => s.status === 'signed');

        if (allSigned) {
          // All signers have signed - complete the document
          logger.info('All signers have signed, applying signatures to PDF', { documentId: signer.document_id });

          // Get document for processing
          const docResult = await client.query(
            'SELECT * FROM documents WHERE id = $1',
            [signer.document_id]
          );
          const document = new Document(mapRowToDocumentData(docResult.rows[0]));

          // Get all signatures for this document with field type and properties.
          // H1 (post-review correction): scoped to this *document* only -
          // `f.document_id = $1 AND sg.document_id = $1` - never also
          // filtered by `f.signer_email = sg.email`. That predicate is a
          // *classifier*, not a filter: two legitimate owner actions can
          // desynchronize `fields.signer_email` from `signers.email` after a
          // signature has already been collected against the field
          // (`signerService.updateSigner` changing a signer's email without
          // touching their fields' `signer_email`, and
          // `assignFieldsToSigner` repointing a field's `signer_email` to a
          // different signer). Filtering the stamping query on that
          // predicate would silently exclude an already-collected,
          // *legitimate* signature from the stamped PDF while the document
          // still reports itself completed - worse than the forgery this
          // check exists to guard against. So: fetch every document-scoped
          // signature row unconditionally for stamping, and separately count
          // how many have a mismatched `signer_email` (case-insensitively,
          // so a pure case drift doesn't itself brick completion - a genuine
          // repoint via `assignFieldsToSigner` still trips this). If that
          // count is non-zero, refuse to complete at all: throwing here rolls
          // back the whole transaction (including this signer's own
          // just-inserted signature and status update), so the submission
          // 400s and an operator has to reconcile the data before anyone can
          // complete this document, rather than a wrong PDF being persisted.
          const allSignaturesResult = await client.query(
            `SELECT s.*, f.page, f.x, f.y, f.width, f.height, f.type, f.properties
             FROM signatures s
             JOIN signers sg ON s.signer_id = sg.id
             JOIN fields f ON s.field_id = f.id
             WHERE f.document_id = $1 AND sg.document_id = $1`,
            [signer.document_id]
          );
          const mismatchCountResult = await client.query(
            `SELECT COUNT(*)::int AS count
             FROM signatures s
             JOIN signers sg ON s.signer_id = sg.id
             JOIN fields f ON s.field_id = f.id
             WHERE f.document_id = $1 AND sg.document_id = $1
               AND lower(f.signer_email) IS DISTINCT FROM lower(sg.email)`,
            [signer.document_id]
          );
          const mismatchCount = mismatchCountResult.rows[0].count;

          if (mismatchCount > 0) {
            // Operator-actionable detail goes to the server log only - this
            // is a public, unauthenticated route, so the response the signer
            // receives (see the outer catch) must not repeat it.
            logger.error(
              'Refusing to complete document: completion JOIN found signature(s) whose field signer_email does not match the owning signer\'s email',
              { documentId: signer.document_id, mismatchCount }
            );
            throw new Error(
              `Document ${signer.document_id}: ${mismatchCount} signature(s) reference a field whose signer_email no longer matches the signing signer's email; refusing to stamp an incomplete signed PDF`
            );
          }

          logger.info('Found signatures to apply', {
            documentId: signer.document_id,
            count: allSignaturesResult.rows.length,
            signerIds: allSignaturesResult.rows.map(r => r.signer_id),
            fieldIds: allSignaturesResult.rows.map(r => r.field_id),
          });

          // Apply signatures to PDF
          try {
            // Load original PDF
            const originalPdfBuffer = await this._storageService.downloadFile(document.file_path);

            // Get page dimensions for coordinate transformation
            const pdfInfo = await this._pdfService.getPdfInfo(originalPdfBuffer);
            const pageHeights: Map<number, number> = new Map();
            for (const pageInfo of pdfInfo.pages) {
              pageHeights.set(pageInfo.pageNumber, pageInfo.height);
            }

            // Separate fields by type
            const signatureFields: any[] = [];
            const textFields: any[] = [];
            const dateFields: any[] = [];
            const checkboxFields: any[] = [];
            const radioFields: any[] = [];
            const dropdownFields: any[] = [];
            const textareaFields: any[] = [];

            for (const row of allSignaturesResult.rows) {
              const pageNumber = parseInt(row.page);
              const fieldHeight = parseFloat(row.height);
              const frontendY = parseFloat(row.y);

              // Get page height (default to 792 points for Letter size)
              const pageHeight = pageHeights.get(pageNumber) || 792;

              // Transform Y coordinate: frontend uses top-left origin, PDF uses bottom-left
              // Formula: pdfY = pageHeight - frontendY - fieldHeight
              const pdfY = pageHeight - frontendY - fieldHeight;

              const baseField = {
                page: pageNumber,
                x: parseFloat(row.x),
                y: pdfY,
                width: parseFloat(row.width),
                height: fieldHeight,
              };

              logger.debug('Coordinate transformation', {
                fieldId: row.field_id,
                frontendY,
                pdfY,
                pageHeight,
                fieldHeight
              });

              switch (row.type) {
                case 'radio': {
                  // Radio field - use text_value as selectedValue
                  const properties = row.properties || {};
                  radioFields.push({
                    ...baseField,
                    options: properties.options || [],
                    selectedValue: row.text_value,
                    orientation: properties.orientation || 'vertical',
                    fontSize: properties.fontSize || 12,
                    textColor: properties.textColor || '#000000',
                    optionSpacing: properties.optionSpacing || 20,
                  });
                  logger.debug('Processing radio field', { fieldId: row.field_id, selectedValue: row.text_value });
                  break;
                }

                case 'dropdown': {
                  // Dropdown field - use text_value as selectedValue
                  const properties = row.properties || {};
                  dropdownFields.push({
                    ...baseField,
                    options: properties.options || [],
                    selectedValue: row.text_value,
                    settings: {
                      placeholder: properties.placeholder || 'Select an option',
                      fontSize: properties.fontSize || 12,
                      textColor: properties.textColor || '#000000',
                      backgroundColor: properties.backgroundColor || '#FFFFFF',
                      borderColor: properties.borderColor || '#000000',
                    },
                  });
                  logger.debug('Processing dropdown field', { fieldId: row.field_id, selectedValue: row.text_value });
                  break;
                }

                case 'textarea': {
                  // Textarea field - use text_value as multi-line text
                  const properties = row.properties || {};
                  textareaFields.push({
                    ...baseField,
                    text: row.text_value || '',
                    settings: {
                      fontSize: properties.fontSize || 12,
                      textColor: properties.textColor || '#000000',
                      backgroundColor: properties.backgroundColor || '#FFFFFF',
                      borderColor: properties.borderColor || '#000000',
                      lineHeight: 1.2,
                    },
                  });
                  logger.debug('Processing textarea field', { fieldId: row.field_id, textLength: row.text_value?.length });
                  break;
                }

                case 'text': {
                  // Text field - use text_value
                  const properties = row.properties || {};
                  textFields.push({
                    ...baseField,
                    text: row.text_value || '',
                    fontSize: properties.fontSize || 12,
                    fontColor: properties.fontColor || '#000000',
                  });
                  logger.debug('Processing text field', { fieldId: row.field_id, text: row.text_value });
                  break;
                }

                case 'date': {
                  // Date field - use text_value (already formatted)
                  const properties = row.properties || {};
                  dateFields.push({
                    ...baseField,
                    date: row.text_value || '',
                    format: properties.dateFormat || 'MM/DD/YYYY',
                    fontSize: properties.fontSize || 12,
                    fontColor: properties.fontColor || '#000000',
                  });
                  logger.debug('Processing date field', { fieldId: row.field_id, date: row.text_value });
                  break;
                }

                case 'checkbox': {
                  // Checkbox field - use text_value to determine checked state
                  const properties = row.properties || {};
                  checkboxFields.push({
                    ...baseField,
                    checked: row.text_value === 'checked',
                    options: {
                      checkColor: properties.checkColor || '#000000',
                      borderColor: properties.borderColor || '#000000',
                      backgroundColor: properties.backgroundColor || '#FFFFFF',
                      borderWidth: properties.borderWidth || 1,
                      style: properties.style || 'checkmark',
                    },
                  });
                  logger.debug('Processing checkbox field', { fieldId: row.field_id, checked: row.text_value === 'checked' });
                  break;
                }

                case 'signature':
                case 'initials':
                default: {
                  // Signature/initials field - use imageData
                  signatureFields.push({
                    ...baseField,
                    imageData: row.signature_data,
                  });
                  logger.debug('Processing signature row', {
                    page: row.page,
                    x: row.x,
                    y: row.y,
                    width: row.width,
                    height: row.height,
                    signature_data_length: row.signature_data?.length
                  });
                  break;
                }
              }
            }

            logger.debug('Applying fields to PDF...', {
              documentId: signer.document_id,
              signatureCount: signatureFields.length,
              textCount: textFields.length,
              dateCount: dateFields.length,
              checkboxCount: checkboxFields.length,
              radioCount: radioFields.length,
              dropdownCount: dropdownFields.length,
              textareaCount: textareaFields.length,
            });

            // Apply all fields to the PDF
            const signedPdfBuffer = await this._pdfService.addMultipleFields(
              originalPdfBuffer,
              {
                signatures: signatureFields.length > 0 ? signatureFields : undefined,
                textFields: textFields.length > 0 ? textFields : undefined,
                dateFields: dateFields.length > 0 ? dateFields : undefined,
                checkboxFields: checkboxFields.length > 0 ? checkboxFields : undefined,
                radioFields: radioFields.length > 0 ? radioFields : undefined,
                dropdownFields: dropdownFields.length > 0 ? dropdownFields : undefined,
                textareaFields: textareaFields.length > 0 ? textareaFields : undefined,
              }
            );

            logger.debug('Signed PDF created', { documentId: signer.document_id, size: signedPdfBuffer.length });

            // Save the signed PDF (replace the original file). Routed
            // through StorageService/LocalStorageAdapter rather than a raw
            // fs.writeFile so resolveWithinStorage guards document.file_path
            // before anything touches the filesystem (SEC-C2) - this was the
            // priority bypass site: an attacker-influenceable write inside a
            // catch that swallows the error and completes the document
            // anyway (unchanged by this fix - a rejected path still means
            // the document completes with the original, unsigned PDF).
            await this._storageService.uploadFile(signedPdfBuffer, document.file_path);

            logger.info('Signed PDF saved', { documentId: signer.document_id, path: document.file_path });
          } catch (error) {
            logger.error('Error applying signatures to PDF', { error: (error as Error).message, stack: (error as Error).stack, documentId: signer.document_id });
            // Continue with document completion even if PDF signing fails
            // This ensures the workflow completes
          }

          // Update document status to completed
          await client.query(
            'UPDATE documents SET status = $1, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['completed', signer.document_id]
          );

          // G4: stage the completion WebSocket emit - sent after COMMIT
          // (see completionBroadcastStaged's declaration above), never inside
          // this transaction.
          completionBroadcastStaged = {
            documentId: signer.document_id,
            ownerId: document.user_id,
          };

          // Stage the completion notification for the document owner - sent
          // after COMMIT (BUG-4 / Item 1.5), never inside this transaction.
          const ownerResult = await client.query(
            'SELECT email FROM users WHERE id = $1',
            [document.user_id]
          );

          if (ownerResult.rows.length > 0) {
            const owner = ownerResult.rows[0];
            completionEmailStaged = {
              data: {
                recipientEmail: owner.email,
                recipientName: owner.email,
                documentTitle: document.title,
                completedAt: new Date(),
                downloadUrl: buildDownloadUrl(baseUrl, document.id),
                documentId: document.id,
                userId: document.user_id,
              },
              teamId: document.team_id,
            };
          }

          // Reminder cancellation for the completed document sits in the
          // same span as the completion email above - deferred alongside it.
          cancelDocumentRemindersAfterCommit = true;
        } else {
          // Check if next signer should be notified (sequential workflow)
          const docResult = await client.query(
            'SELECT * FROM documents WHERE id = $1',
            [signer.document_id]
          );
          const document = new Document(mapRowToDocumentData(docResult.rows[0]));

          if (document.workflow_type === 'sequential' && signer.signing_order !== null) {
            // Find next signer
            const nextSignerResult = await client.query(
              'SELECT * FROM signers WHERE document_id = $1 AND signing_order = $2',
              [signer.document_id, signer.signing_order + 1]
            );

            if (nextSignerResult.rows.length > 0) {
              const nextSigner = new Signer(mapRowToSignerData(nextSignerResult.rows[0]));

              // Get sender info
              const userResult = await client.query(
                'SELECT email FROM users WHERE id = $1',
                [document.user_id]
              );
              const senderName = userResult.rows[0]?.email || 'Someone';

              // Stage the next-signer signing request - sent after COMMIT
              // (BUG-4 / Item 1.5), never inside this transaction.
              nextSignerEmailStaged = {
                data: {
                  recipientEmail: nextSigner.email,
                  recipientName: nextSigner.name,
                  documentTitle: document.title,
                  senderName,
                  signingUrl: buildSigningUrl(baseUrl, nextSigner.access_token),
                  documentId: document.id,
                  signerId: nextSigner.id,
                  userId: document.user_id,
                },
                teamId: document.team_id,
              };
            }
          }
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      // Post-commit, best-effort I/O (BUG-4 / Item 1.5): the signature is
      // already durably saved at this point, so a failure below must be
      // logged and swallowed - never surfaced as an error to the signer, and
      // never allowed to undo the commit above.
      // Item 3.2: `signed`, and `completed` when this submission finished the
      // document. Emitted here - after COMMIT - and not inside the
      // transaction above, because `AuditService` holds its own pool: a call
      // made mid-transaction commits on a different connection, so the
      // ROLLBACK in the catch would leave permanent `signed`/`completed`
      // rows describing a signature that does not exist. Ordered before the
      // email I/O below so the recorded timestamps sit as close as possible
      // to the commit they describe rather than behind an SMTP round-trip.
      await this.auditService.recordEvent({
        document_id: signer.document_id,
        user_id: null,
        event_type: 'signed',
        ip_address: req.ip ?? null,
        user_agent: req.get('user-agent') ?? null,
        metadata: { signer_id: signer.id, signer_email: signer.email },
      });

      if (allSigned) {
        await this.auditService.recordEvent({
          document_id: signer.document_id,
          user_id: null,
          event_type: 'completed',
          ip_address: req.ip ?? null,
          user_agent: req.get('user-agent') ?? null,
          // Item 4 joins signers on `metadata->>'signer_id'`; `completed`
          // used a different key, so the row a support reader cares most
          // about resolved to a NULL signer. Same key everywhere - the
          // distinguishing information is the event type, not the key name.
          metadata: { signer_id: signer.id, signer_email: signer.email },
        });
      }

      if (completionBroadcastStaged) {
        socketService
          .emitDocumentUpdate({
            documentId: completionBroadcastStaged.documentId,
            status: 'completed',
            updatedAt: new Date().toISOString(),
            ownerId: completionBroadcastStaged.ownerId,
          })
          .catch((error) => {
            logger.warn('Failed to emit completed-document WebSocket update (signature already committed)', {
              documentId: signer.document_id,
              error: (error as Error).message,
            });
          });
      }

      if (completionEmailStaged) {
        try {
          const completionBranding = await this.getEmailBranding(completionEmailStaged.teamId, baseUrl);
          await this.emailService.sendCompletionNotification({
            ...completionEmailStaged.data,
            branding: completionBranding,
          });
        } catch (error) {
          logger.warn('Failed to send completion notification email (signature already committed)', {
            documentId: signer.document_id,
            error: (error as Error).message,
          });
        }
      }

      if (nextSignerEmailStaged) {
        try {
          const nextSignerBranding = await this.getEmailBranding(nextSignerEmailStaged.teamId, baseUrl);
          await this.emailService.sendSigningRequest({
            ...nextSignerEmailStaged.data,
            branding: nextSignerBranding,
          });
        } catch (error) {
          logger.warn('Failed to send next-signer signing request email (signature already committed)', {
            documentId: signer.document_id,
            error: (error as Error).message,
          });
        }
      }

      if (cancelDocumentRemindersAfterCommit && this.reminderService) {
        try {
          const cancelledCount = await this.reminderService.cancelRemindersForDocument(signer.document_id);
          if (cancelledCount > 0) {
            logger.info('Cancelled remaining reminders for completed document', {
              documentId: signer.document_id,
              cancelledCount,
            });
          }
        } catch (error) {
          logger.warn('Failed to cancel document reminders on completion', {
            documentId: signer.document_id,
            error: (error as Error).message,
          });
        }
      }

      res.status(200).json({
        success: true,
        message: 'Signature submitted successfully',
        data: {
          document_completed: allSigned,
        },
      });
    } catch (error) {
      if (error instanceof SigningContextError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      this.respondWithGenericSigningError('Error submitting signature', error, req, res);
    }
  };

  /**
   * Download document for signing (by access token)
   * GET /api/signing/:token/download
   */
  downloadDocumentByToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const token = req.params.token as string;
      logger.debug('Download request for token', { tokenPrefix: token.substring(0, 8), correlationId: req.correlationId });

      const { signer, document, allSigners } = await resolveSigningContext(this.pool, token);
      logger.debug('Signer found', { signerId: signer.id, documentId: signer.document_id, correlationId: req.correlationId });
      logger.debug('Document found', { documentId: document.id, filePath: document.file_path, correlationId: req.correlationId });

      // SEC-C4 (read-time gate): a signing link must not be a permanent read
      // credential that survives cancellation - but keep serving `pending`
      // and `completed`, since Sign.tsx reuses this same token both to
      // preview the PDF while signing and for the post-submit "Download
      // Signed Document" button (see assertDocumentReadable's doc comment).
      assertDocumentReadable(document);

      // H4: while still pending, this route must not expose the PDF to a
      // signer who couldn't view it via the GET /:token session route
      // either. Two cases the sequential gate alone doesn't cover between
      // them: an out-of-turn sequential signer (same check as the session
      // route), and a `declined` signer specifically - their predecessors,
      // if any, have necessarily already signed (you can only decline your
      // own turn once it arrives), so `canSignInSequence` returns true for
      // them and the sequential check alone would let them through. Once
      // `completed`, every signer's copy is the same finished document, so
      // neither check applies - this is the route the frontend reuses for
      // the post-signing "Download Signed Document" button.
      if (document.status === 'pending') {
        if (signer.status === 'declined') {
          res.status(400).json({
            success: false,
            error: 'You have declined to sign this document and can no longer access it',
          });
          return;
        }
        if (document.workflow_type === 'sequential' && !Signer.canSignInSequence(signer, allSigners)) {
          res.status(400).json({
            success: false,
            error: 'It is not your turn to sign yet (sequential workflow)',
          });
          return;
        }
      }

      // Check if file exists
      const fileExists = await this._storageService.fileExists(document.file_path);
      if (!fileExists) {
        logger.warn('File not found on storage', { documentId: document.id, filePath: document.file_path, correlationId: req.correlationId });
        res.status(404).json({ error: 'Document file not found' });
        return;
      }

      // Download file buffer
      const fileBuffer = await this._storageService.downloadFile(document.file_path);
      logger.debug('File downloaded', { documentId: document.id, size: fileBuffer.length, correlationId: req.correlationId });

      // Set headers for file download (inline for PDF viewing in browser)
      res.setHeader('Content-Type', document.mime_type);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${document.original_filename}"`
      );
      res.setHeader('Content-Length', fileBuffer.length.toString());

      // Send file buffer
      res.send(fileBuffer);
      logger.debug('File sent successfully', { documentId: document.id, correlationId: req.correlationId });
    } catch (error) {
      if (error instanceof SigningContextError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      this.respondWithGenericSigningError('Download error', error, req, res);
    }
  };

  /**
   * Get signing status for a document
   * GET /api/documents/:id/status
   */
  getSigningStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId; // Fixed: should be userId not id
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const documentId = req.params.id as string;

      // Get document
      const docResult = await this.pool.query(
        'SELECT * FROM documents WHERE id = $1',
        [documentId]
      );

      if (docResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const document = new Document(mapRowToDocumentData(docResult.rows[0]));

      // Check access
      if (document.user_id !== userId) {
        res.status(403).json({ success: false, error: 'Access denied' });
        return;
      }

      // Get signers
      const signersResult = await this.pool.query(
        'SELECT * FROM signers WHERE document_id = $1 ORDER BY signing_order NULLS LAST, email',
        [documentId]
      );

      const signers = signersResult.rows.map((row) => {
        const signer = new Signer(mapRowToSignerData(row));
        return signer.toPublicJSON();
      });

      res.status(200).json({
        success: true,
        data: {
          document_status: document.status,
          workflow_type: document.workflow_type,
          signers,
          total_signers: signers.length,
          signed_count: signers.filter((s) => s.status === 'signed').length,
          pending_count: signers.filter((s) => s.status === 'pending').length,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  };

  /**
   * Item 4.6: structural validation of the submitted signatures batch, as an
   * explicit controller check rather than reviving the dead `validate()`
   * middleware (zero call sites anywhere - see the launch-security plan).
   * Normalizes `text_value`/`font_family` to `null` when absent, but never
   * drops them when present: every non-signature field type (radio, text,
   * date, checkbox, dropdown) submits `signature_type: 'typed'` and relies
   * on `text_value` to render (`frontend/src/pages/Sign.tsx`).
   *
   * H5/H6 (post-review): enforces the `text_value`/`font_family` length caps
   * unconditionally (not just for `signature_type: 'typed'`, unlike
   * `Signature.validateSignatureData()`) and rejects duplicate `field_id`s,
   * all here, before `resolveSigningContext`/`BEGIN` - so a batch that would
   * otherwise fail late (a raw `unique_field_signature` constraint violation
   * mid-insert, rolling back everything already written) is rejected up
   * front instead. Every rejection here throws `SigningContextError` (400) -
   * the message is written for the signer, so it must stay typed alongside
   * the C3/C4/C5 checks rather than falling through the catch-all's generic
   * fallback (see the three handlers' catch blocks).
   */
  private validateSignaturesPayload(input: unknown): Array<{
    field_id: string;
    signature_type: 'drawn' | 'typed' | 'uploaded';
    signature_data: string;
    text_value: string | null;
    font_family: string | null;
  }> {
    if (!Array.isArray(input) || input.length === 0) {
      throw new SigningContextError('Signatures array is required', 400);
    }
    if (input.length > MAX_SIGNATURES_PER_SUBMISSION) {
      throw new SigningContextError(
        `Signatures array cannot contain more than ${MAX_SIGNATURES_PER_SUBMISSION} entries`,
        400
      );
    }

    const seenFieldIds = new Set<string>();

    return input.map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw new SigningContextError(`Signature at index ${index} must be an object`, 400);
      }

      const { field_id, signature_type, signature_data, text_value, font_family } = entry as Record<string, unknown>;

      if (typeof field_id !== 'string' || !isValidUuid(field_id)) {
        throw new SigningContextError(`Signature at index ${index} has an invalid field_id`, 400);
      }
      if (seenFieldIds.has(field_id)) {
        throw new SigningContextError(
          `Signature at index ${index} duplicates field_id ${field_id}, which was already submitted earlier in this batch`,
          400
        );
      }
      seenFieldIds.add(field_id);

      if (typeof signature_type !== 'string' || !Signature.isValidSignatureType(signature_type)) {
        throw new SigningContextError(`Signature at index ${index} has an invalid signature_type`, 400);
      }
      if (typeof signature_data !== 'string' || signature_data.length === 0) {
        throw new SigningContextError(`Signature at index ${index} must include non-empty signature_data`, 400);
      }
      if (text_value !== undefined && text_value !== null && typeof text_value !== 'string') {
        throw new SigningContextError(`Signature at index ${index} has an invalid text_value`, 400);
      }
      if (typeof text_value === 'string' && text_value.length > 500) {
        throw new SigningContextError(
          `Signature at index ${index} (field ${field_id}) has a text_value longer than 500 characters`,
          400
        );
      }
      if (font_family !== undefined && font_family !== null && typeof font_family !== 'string') {
        throw new SigningContextError(`Signature at index ${index} has an invalid font_family`, 400);
      }
      if (typeof font_family === 'string' && font_family.length > 100) {
        throw new SigningContextError(
          `Signature at index ${index} (field ${field_id}) has a font_family longer than 100 characters`,
          400
        );
      }

      return {
        field_id,
        signature_type,
        signature_data,
        text_value: (text_value as string | null | undefined) ?? null,
        font_family: (font_family as string | null | undefined) ?? null,
      };
    });
  }

  // Helper method to map a database row to Field model data
  private mapRowToFieldData(row: any): any {
    return {
      id: row.id,
      document_id: row.document_id,
      type: row.type,
      page: row.page,
      x: parseFloat(row.x),
      y: parseFloat(row.y),
      width: parseFloat(row.width),
      height: parseFloat(row.height),
      required: row.required,
      signer_email: row.signer_email,
      value: row.value,
      properties: row.properties,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
