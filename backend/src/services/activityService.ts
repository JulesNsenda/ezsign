import { Pool } from 'pg';

/**
 * One document's activity: its lifecycle audit events and every email we
 * tried to send for it, in a single time-ordered stream.
 *
 * Deliberately *not* part of `auditService`. That service owns one table and
 * has to stay narrowly correct about it; this one reads across two and exists
 * only to render a timeline. Keeping them apart means a change to the read
 * shape here can never alter how audit rows are written.
 *
 * Two things this file will not do, both learned from review:
 *
 * - **It never selects `ip_address`, `user_agent`, or `email_logs.metadata`.**
 *   For audit rows the first two are stripped today by
 *   `AuditEvent.toPublicJSON()`, which a raw UNION bypasses entirely; the
 *   third is stripped by `mapRowToPublicEmailLog`, whose whole reason for
 *   existing is that `/documents/:id/emails` is reachable by any team member
 *   with document access. This endpoint has exactly the same audience, so the
 *   projection below has to make exactly the same decision - it is the only
 *   thing standing between those columns and the API response.
 * - **It never presents the trail as complete.** Audit writes are
 *   best-effort by design (`AuditService.recordEvent` swallows failures so an
 *   audit write can never fail a user's operation), and a crash between a
 *   COMMIT and its post-commit emit loses that row. Callers should present
 *   this as a record of what we observed, not as an attested log.
 */

/** Which table a row came from. Also an ordering tiebreaker - see `ORDER BY`. */
export type ActivityKind = 'audit' | 'email';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  createdAt: Date;
  /** `event_type` for audit rows, `email_type` for email rows. */
  type: string;
  /** Email delivery status; null on audit rows. */
  status: string | null;
  /** Why an email failed. Null on audit rows and on successful sends. */
  errorMessage: string | null;
  /** Email subject line; null on audit rows. */
  subject: string | null;
  /** Who the email went to; null on audit rows. */
  recipientEmail: string | null;
  /**
   * The user behind the action, as an email.
   *
   * Live identity first (joined from `users`), falling back to the address
   * recorded in the row's own metadata at the time. Those are two different
   * answers - a renamed or re-emailed user shows their current address, while
   * a *deleted* user is nulled out of the join by `ON DELETE SET NULL` and
   * survives only in the snapshot.
   *
   * A support timeline wants the live value (you want to contact the person
   * who exists now), so it wins; the snapshot exists so a deleted actor still
   * resolves to something instead of vanishing. Item 5 should render this
   * field and not also render `metadata.actor_email` beside it.
   */
  actorEmail: string | null;
  /**
   * The signer this row concerns. Projected as a real uuid column rather than
   * left in `metadata` so the UI has a typed path to
   * `POST /:id/signers/:signerId/resend` - matching on `recipientEmail`
   * instead would be wrong, since the schema permits two signers to share an
   * address. Null when no signer resolved.
   */
  signerId: string | null;
  signerEmail: string | null;
  signerName: string | null;
  /** Audit metadata only. Always null on email rows - see the file header. */
  metadata: Record<string, unknown> | null;
}

/** Domain shape. The HTTP `pagination` envelope is the controller's job. */
export interface ActivityPage {
  items: ActivityItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * The two halves of the union.
 *
 * **This fragment owns `$1` (the document id). Any wrapper must start its own
 * parameters at `$2`** - the page query below binds `$2`/`$3` for LIMIT and
 * OFFSET. A future filter added *inside* the fragment would otherwise take
 * `$2` and silently collide with LIMIT, producing a query that parses fine
 * and returns the wrong rows.
 *
 * `WHERE document_id = $1` is load-bearing beyond the obvious filter:
 * instance-level audit rows (`settings.updated`, `user.sessions_revoked`)
 * carry a NULL `document_id`, and `NULL = uuid` is never TRUE, so they are
 * excluded by construction rather than by an event-type blocklist that would
 * need updating every time a system event is added.
 *
 * Both signer joins are scoped by `document_id`. That is containment, not
 * just performance: `metadata` is a free-form blob written by several call
 * sites, and without the scope a row whose `signer_id` named another
 * document's signer would render that signer's name and email into this
 * document's timeline. It also lets Postgres use the `signers(document_id)`
 * index, which the `::text` cast on the primary key alone would not.
 *
 * The cast direction matters: `metadata->>'signer_id'` is arbitrary JSON
 * text, so `(metadata->>'signer_id')::uuid` would throw for the *entire
 * query* on one bad row - taking the endpoint down rather than degrading that
 * row to a null signer.
 */
const ACTIVITY_UNION = `
  SELECT
    a.id,
    'audit'                       AS kind,
    a.created_at,
    a.event_type                  AS type,
    NULL::varchar                 AS status,
    NULL::text                    AS error_message,
    NULL::text                    AS subject,
    NULL::varchar                 AS recipient_email,
    COALESCE(u.email, a.metadata->>'actor_email') AS actor_email,
    s.id                          AS signer_id,
    s.email                       AS signer_email,
    s.name                        AS signer_name,
    a.metadata
  FROM audit_events a
  LEFT JOIN users u ON u.id = a.user_id
  LEFT JOIN signers s
    ON s.document_id = a.document_id
   AND s.id::text = a.metadata->>'signer_id'
  WHERE a.document_id = $1

  UNION ALL

  SELECT
    e.id,
    'email'                       AS kind,
    e.created_at,
    e.email_type                  AS type,
    e.status,
    e.error_message,
    e.subject,
    e.recipient_email,
    u.email                       AS actor_email,
    s.id                          AS signer_id,
    s.email                       AS signer_email,
    s.name                        AS signer_name,
    NULL::jsonb                   AS metadata
  FROM email_logs e
  LEFT JOIN users u ON u.id = e.user_id
  LEFT JOIN signers s
    ON s.document_id = e.document_id
   AND s.id = e.signer_id
  WHERE e.document_id = $1
`;

export const createActivityService = (pool: Pool) => {
  /**
   * One page of a document's activity, newest first.
   *
   * Offset pagination rather than the keyset helpers in `utils/pagination.ts`,
   * deliberately: `document_id` is indexed on both tables, per-document row
   * count is bounded by a single envelope's lifecycle, and the sibling
   * `/emails` endpoint already uses offset. `getAuditEventsKeyset` exists for
   * the unbounded instance-wide feed, which is a different problem - and a
   * keyset cursor over a UNION would need a synthetic composite cursor across
   * two id spaces for no gain here.
   */
  const getByDocumentId = async (
    documentId: string,
    page: number,
    limit: number
  ): Promise<ActivityPage> => {
    const offset = (page - 1) * limit;

    // Counted with two index-only subqueries rather than by wrapping the
    // union. Counting over the fragment would drag both LEFT JOINs along -
    // work whose result a count cannot use - doubling the cost of every
    // request. (The `SELECT *` -> `SELECT COUNT(*)` string replacement used
    // elsewhere in this codebase is not an option either: against a UNION it
    // silently produces invalid SQL.)
    const countResult = await pool.query(
      `SELECT (SELECT COUNT(*) FROM audit_events WHERE document_id = $1)
            + (SELECT COUNT(*) FROM email_logs   WHERE document_id = $1) AS total`,
      [documentId]
    );
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    // `created_at` alone is not a total order: two rows sharing a timestamp
    // (an email logged in the same instant as the event that triggered it -
    // the common case, not a rare one) can sort differently between one page
    // query and the next, so a row appears on two pages or on neither.
    //
    // `kind ASC` breaks that tie with 'audit' before 'email'. In a newest-first
    // list that puts the event above the email it triggered, which is the
    // order they actually happened in; `kind DESC` would render the email as
    // though it preceded its own cause.
    const result = await pool.query(
      `SELECT * FROM (${ACTIVITY_UNION}) AS activity
       ORDER BY created_at DESC, kind ASC, id DESC
       LIMIT $2 OFFSET $3`,
      [documentId, limit, offset]
    );

    return {
      items: result.rows.map(mapRowToActivityItem),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  };

  return { getByDocumentId };
};

function mapRowToActivityItem(row: Record<string, any>): ActivityItem {
  return {
    id: row.id,
    kind: row.kind,
    createdAt: row.created_at,
    type: row.type,
    status: row.status ?? null,
    errorMessage: row.error_message ?? null,
    subject: row.subject ?? null,
    recipientEmail: row.recipient_email ?? null,
    actorEmail: row.actor_email ?? null,
    signerId: row.signer_id ?? null,
    signerEmail: row.signer_email ?? null,
    signerName: row.signer_name ?? null,
    metadata: row.metadata ?? null,
  };
}
