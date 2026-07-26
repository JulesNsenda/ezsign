import { Pool, PoolClient } from 'pg';
import { Document, DocumentData } from '@/models/Document';
import { Signer, SignerData } from '@/models/Signer';
import logger from '@/services/loggerService';

/**
 * Shared token -> signer -> document resolution and authorization checks for
 * the three public, unauthenticated signing-token routes
 * (`getDocumentBySigningToken`, `submitSignature`, `downloadDocumentByToken`
 * in `signingController.ts`). Extracted because those three handlers each
 * duplicated this lookup, and `submitSignature` had drifted to skip most of
 * the checks the GET path already did (SEC-C3/C4/C5) - copying five more
 * checks into a second 485-line handler would only deepen that drift.
 *
 * Mirrors the resolve-then-authorize shape of
 * `middleware/documentAccess.ts::createDocumentAccessMiddleware`:
 * `resolveSigningContext` only resolves (404 if nothing exists for the
 * token); callers remain responsible for their own authorization, since the
 * exact checks differ per endpoint (e.g. `downloadDocumentByToken` must keep
 * working after completion, unlike the signing routes - see
 * `assertDocumentReadable`).
 */

/** UUID v1-v5 shape check (case-insensitive). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Whether SEC-C4's expiry rejection is enforced. Defaults to **off**.
 * Nothing in the app currently cancels or cleans up expired-but-still-
 * pending documents (`expires_at` is only read by `reminderWorker`), and the
 * live count of `documents WHERE status='pending' AND expires_at < now()`
 * (item 0 of the launch-security plan) has never been run - enforcing a
 * check that has never applied, with an unmeasured blast radius, on a
 * signing product is the wrong default. Set `SIGNING_ENFORCE_EXPIRY=true`
 * once that count is confirmed zero - see the README.
 */
export function isExpiryEnforced(): boolean {
  return process.env.SIGNING_ENFORCE_EXPIRY === 'true';
}

/**
 * Thrown for any problem resolving or authorizing a signing token. Callers
 * catch this specifically and respond with `error.statusCode` (400 or 404),
 * falling back to a generic 400 for anything else - mirrors each handler's
 * existing catch-all shape.
 */
export class SigningContextError extends Error {
  statusCode: 400 | 404;

  constructor(message: string, statusCode: 400 | 404) {
    super(message);
    this.name = 'SigningContextError';
    this.statusCode = statusCode;
  }
}

export interface SigningContext {
  signer: Signer;
  document: Document;
  /** All signers on the document, ordered by `signing_order`. */
  allSigners: Signer[];
}

export function mapRowToSignerData(row: any): SignerData {
  return {
    id: row.id,
    document_id: row.document_id,
    email: row.email,
    name: row.name,
    signing_order: row.signing_order,
    status: row.status,
    access_token: row.access_token,
    signed_at: row.signed_at,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    last_reminder_sent_at: row.last_reminder_sent_at,
    reminder_count: row.reminder_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function mapRowToDocumentData(row: any): DocumentData {
  return {
    id: row.id,
    user_id: row.user_id,
    team_id: row.team_id,
    title: row.title,
    original_filename: row.original_filename,
    file_path: row.file_path,
    file_size: parseInt(row.file_size, 10),
    mime_type: row.mime_type,
    page_count: row.page_count,
    status: row.status,
    workflow_type: row.workflow_type,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    thumbnail_path: row.thumbnail_path,
    thumbnail_generated_at: row.thumbnail_generated_at,
    is_optimized: row.is_optimized,
    original_file_size: row.original_file_size,
    optimized_at: row.optimized_at,
    expires_at: row.expires_at,
    reminder_settings: row.reminder_settings,
  };
}

/**
 * Resolves a signing access token to its signer, document, and the full
 * signer list for the document (ordered by `signing_order`). Throws
 * `SigningContextError(404)` if the token or its document don't exist.
 */
export async function resolveSigningContext(pool: Pool, token: string): Promise<SigningContext> {
  const signerResult = await pool.query('SELECT * FROM signers WHERE access_token = $1', [token]);
  if (signerResult.rows.length === 0) {
    throw new SigningContextError('Invalid signing link', 404);
  }
  const signer = new Signer(mapRowToSignerData(signerResult.rows[0]));

  const docResult = await pool.query('SELECT * FROM documents WHERE id = $1', [signer.document_id]);
  if (docResult.rows.length === 0) {
    throw new SigningContextError('Document not found', 404);
  }
  const document = new Document(mapRowToDocumentData(docResult.rows[0]));

  const allSignersResult = await pool.query(
    'SELECT * FROM signers WHERE document_id = $1 ORDER BY signing_order',
    [signer.document_id]
  );
  const allSigners = allSignersResult.rows.map((row) => new Signer(mapRowToSignerData(row)));

  return { signer, document, allSigners };
}

/**
 * SEC-C4 (write path): rejects unless the document is still `pending`, and
 * (unless `SIGNING_ENFORCE_EXPIRY=false`) unless it has not passed its
 * signing deadline. Shared by the GET signing-session route and
 * `submitSignature` so a cancelled/completed document, or one whose window
 * has closed, can't be acted on via a direct API call regardless of what the
 * UI would have shown.
 */
export function assertDocumentSignable(document: Document): void {
  if (document.status !== 'pending') {
    throw new SigningContextError(`Document is ${document.status} and cannot be signed`, 400);
  }
  if (isExpiryEnforced() && document.isExpired()) {
    throw new SigningContextError(
      `This document's signing deadline (${new Date(document.expires_at as Date).toISOString()}) has passed. Please contact the document sender for a new signing link.`,
      400
    );
  }
}

/**
 * SEC-C4 (read path): deliberately weaker than `assertDocumentSignable`. A
 * signing link is a signer's only path to their own copy of the document -
 * they have no account, so the authenticated `GET /api/documents/:id/download`
 * is unreachable for them - and `Sign.tsx` reuses this same token both to
 * preview the PDF while signing (still `pending`) and for the "Download
 * Signed Document" button immediately after this signer's own submission,
 * which may or may not have completed the whole document depending on
 * whether other signers are still pending. So `pending` and `completed` must
 * both stay readable. What must not survive is the sender cancelling the
 * document (the actual problem this route had: a signing link as a
 * permanent read credential), plus `draft`/`scheduled` defensively. Expiry
 * only matters before completion - once every signer has finished, the
 * signing deadline is moot for reading the result.
 */
export function assertDocumentReadable(document: Document): void {
  if (document.status !== 'pending' && document.status !== 'completed') {
    throw new SigningContextError(`Document is ${document.status} and cannot be accessed`, 400);
  }
  if (document.status === 'pending' && isExpiryEnforced() && document.isExpired()) {
    throw new SigningContextError(
      `This document's signing deadline (${new Date(document.expires_at as Date).toISOString()}) has passed. Please contact the document sender for a new signing link.`,
      400
    );
  }
}

/**
 * SEC-C3: validates that every submitted `field_id` belongs to this document
 * and is assigned to this signer's email, in a single batched query run
 * before any signature row is written. De-duplicates the id list first, and
 * validates UUID shape before the query so an unparseable id 400s here
 * instead of raising Postgres `22P02` (invalid input syntax for type uuid),
 * which would otherwise surface as a 500. Rejects the whole batch on any
 * miss - nothing is written if even one id doesn't check out.
 *
 * Known residual (not fixed here - schema change, tracked in
 * tasks-0041-launch-security-hardening.md): two `signers` rows on the same
 * document sharing an email both satisfy `signer_email = $3`, since fields
 * associate to a signer by email, not `signer_id`. This batch rejection does
 * close the pre-claim DoS this predicate previously enabled (an attacker
 * claiming another signer's field, which - combined with `signatures`'
 * `UNIQUE(field_id)` constraint - permanently blocked that signer's
 * legitimate submission with a 500): the ownership check now runs and
 * rejects before any insert, so a field can never be claimed by the wrong
 * signer in the first place.
 */
export async function assertFieldsOwnedBySigner(
  pool: Pool | PoolClient,
  fieldIds: string[],
  documentId: string,
  signerEmail: string
): Promise<void> {
  const uniqueIds = Array.from(new Set(fieldIds));

  for (const id of uniqueIds) {
    if (!isValidUuid(id)) {
      throw new SigningContextError(`Invalid field_id: ${id}`, 400);
    }
  }

  if (uniqueIds.length === 0) {
    return;
  }

  const result = await pool.query<{ id: string }>(
    'SELECT id FROM fields WHERE id = ANY($1::uuid[]) AND document_id = $2 AND signer_email = $3',
    [uniqueIds, documentId, signerEmail]
  );

  const ownedIds = new Set(result.rows.map((row) => row.id));
  const missing = uniqueIds.filter((id) => !ownedIds.has(id));

  if (missing.length > 0) {
    logger.warn('Rejected signature submission referencing fields outside signer scope', {
      documentId,
      signerEmail,
      submittedCount: uniqueIds.length,
      missingCount: missing.length,
    });
    throw new SigningContextError('One or more fields do not belong to this signer', 400);
  }
}
