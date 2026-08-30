# Envelope activity log + editable email content

**Status:** Items 0–2 merged (PR #46). Item 3 implemented and green (874 unit + 207 integration tests). Items 4–6 not started.
**Date:** 2026-08-23

## Goal

From the request — *"we should have a way to see logs about an envelope … when an
issue happens with sending an email for signature we have no place to see why it
failed. Also, would be great to modify the emails we send"*:

1. **Envelope Activity view** — for any document, whoever has access sees one
   time-ordered timeline of lifecycle events **and** every email we tried to send
   for it, with the failure reason on the ones that failed, and a way to act on it.
2. **Editable email content** — an instance admin edits the subject and body copy
   of the three recipient-facing emails, with a preview and a test send, and with
   no way to break the signing link.

Scope decisions confirmed by the user on 2026-08-23: activity visible to
**document owner + team + instance admin**; **subject + body copy over a
code-owned HTML shell**; the audit trail is **revived**, not deleted; templates
are **instance-wide**.

## What the panel changed about this plan

The draft assumed the job was mostly exposure — build a UI over data that is
already being captured. Four reviewers reading the actual code found that the
feature sits on top of several live defects, and that two of the draft's own
items cancelled each other out. The plan below is reordered so that **the fixes
for things that are broken today ship before the new surface that would display
them**, and it is larger than the draft as a result. Items 0–2 alone resolve the
user's stated pain; Item 6 is the second ask; Items 3–5 are the timeline itself.

## Current state (verified against the code, not assumed)

- `email_logs` + `emailLogService` + `EmailLogController` exist, and
  `GET /api/documents/:id/emails` is **already mounted behind `checkDocumentAccess`**
  (`documentRoutes.ts:150`). `errorMessage` is already captured and already
  returned. There is no UI for any of it.
- Only `reminderWorker.ts:161-163` passes `documentId`/`signerId`. Six other send
  call sites omit it, so their rows land with `document_id = NULL` and are
  unreachable from the per-document endpoint that already exists.
- `audit_events` has three writers, all raw INSERTs. `AuditService` has **zero**
  callers. No document lifecycle event is ever recorded.
- `frontend/src/pages/AuditTrail.tsx` is dead code, and would not work if wired:
  it expects `AuditEvent[]` where the service returns `{ events, total }`, and its
  icon map keys (`document_created`, `field_added`) are values the backend never
  emits.
- Email HTML interpolates every value unescaped, in all six generators.

## Live defects found while planning

| # | Severity | Defect |
|---|---|---|
| **BUG-1** | high | `signerController.resendSigningEmail` INSERTs `event_type='signer_reminder_sent'`, which the CHECK constraint rejects. Its own outer `catch` (not `errorHandler`, as the draft said) returns **500 after the email was already sent and the reminder counter already burned**. `signerController.test.ts:459-467` asserts the violating value against a mocked pool, so the suite is green and stays green. |
| **BUG-2** | low | Same violation for `user.sessions_revoked` (`adminUsersController.ts:110`), caught and warned — those audit rows have never been written. |
| **BUG-3** | high | `sendForSignature` flips the document to `pending` (`signingController.ts:213-217`) and **then** awaits each send with no per-signer try/catch (`:248-269`). One bad address → **400 to the caller, remaining signers never emailed, document stuck `pending`** (`canSend()` requires `draft`), reminder scheduling skipped. Recovery is per-signer resend — which is BUG-1. |
| **BUG-4** | critical | `submitSignature` awaits `sendCompletionNotification` (`:838-845`) and the next-signer `sendSigningRequest` (`:889-896`) **inside** its `BEGIN`/`COMMIT` span (`:417`–`:906`). An SMTP failure hits the `catch` at `:915-917` and **rolls back a signature that was already emailed about.** The email-log row is written on the pool, so it survives — meaning that after this feature ships, the Activity view would show "completion email failed" beside a document that silently reverted to unsigned. |
| **BUG-5** | medium | Any **team owner** can put arbitrary HTML into `logo_url`, `support_url`, `privacy_url`, `terms_url` or `email_footer_text` — `Branding.validate` (`models/Branding.ts:181-211`) checks only hex colours, an email regex and a name length — and it is interpolated raw into every email sent to every external signer of that team's documents. Sender-supplied `message` (`emailService.ts:435`) is the same vector from a lower-privileged path. Mail clients strip `<script>`, so the practical payload is link/structure spoofing: a working phishing relay sent from the instance's own address, under its branding, carrying a legitimate signing link. |
| **BUG-6** | medium | `POST /api/webhooks/email-status` is mounted (`server.ts:270`) with **no authentication and no signature check** — the handler's own comment says it should have one. A recipient knows their own `Message-ID`, so they can flip their `email_logs` row to `bounced`/`failed` with an attacker-chosen error string, or to `delivered`/`opened` to fake receipt. Nothing sends to this endpoint: the app uses direct SMTP, not a provider with callbacks. |

## Approach

Seven items. Dependency edges are stated; the order is the ship order.

### Item 0 — Stop the email HTML injection *(standalone, no dependencies)*

Hoisted to first by both the security and architecture critics: it is a live
hole, it is one file plus a validator, and it is a prerequisite for Item 6.

- New `backend/src/utils/emailTemplate.ts`: `escapeHtml()`, `safeUrl()`
  (http/https only), `safeMailto()` (separate, because `generateFooterLinks:767`
  emits `mailto:` — a uniform http/https allowlist would silently drop every
  tenant's support link).
- Apply across **all six** `generateXxxHtml` methods and `generateFooterLinks` —
  including `generatePasswordChangeHtml` and `generateEmailVerificationHtml`,
  which the draft wrongly exempted as "code-owned". They interpolate
  `recipientName`, `req.ip` and the reset/verify URLs with the same zero escaping,
  and they are the highest-trust emails in the system.
- Fix **BUG-5 at the write side too**: scheme allowlist on the four `*_url`
  branding fields and a length cap on `email_footer_text` in `Branding.validate`,
  so the value never reaches storage. Defence in depth — branding is also served
  by the public branding endpoints.

### Item 1 — Unbreak the failure paths *(depends on nothing)*

- **BUG-1/BUG-2:** migration extending the `audit_events.event_type` CHECK. The
  `down` must `DELETE FROM audit_events WHERE event_type IN (…)` **before**
  re-adding the narrower constraint — otherwise the rollback is bricked the moment
  the `up` has been useful, and the precedent at `1784667405266:60-65` does not
  show this because its own values could not pre-date it.
- Split `AuditEventType` into `DocumentEventType | SystemEventType` and update
  `isValidEventType` and the `getDescription` map **in the same commit**. Without
  this the migration compiles but every new row renders as "Unknown event" in the
  timeline Item 5 builds. Export one constant and have the frontend label map
  derive from it, so the vocabulary stops living in four places.
- Wrap the resend audit INSERT in its own try/catch (the
  `adminUsersController.ts:108-125` precedent), so the next unlisted event type
  cannot 500 a successful send again.
- **BUG-3:** per-signer try/catch in `sendForSignature`; collect failures,
  continue the loop, return the per-signer outcome using the `signers_notified`
  field already in the response payload.
- **BUG-4:** move both in-transaction sends (and the reminder cancellation) to
  **after `COMMIT`**. This is the same seam Item 3 needs for post-commit audit
  emission, so the two are one restructuring, done once, here.

### Item 2 — Make every send leave evidence *(depends on Item 1's seam)*

- **Restructure `sendWithLogging`:** create the log row first, resolve config
  inside the try that calls `markAsFailed`, and **remove the `resolved?` bypass**
  so `sendEmailVerification` is covered too — otherwise five email types get a
  failed row and `verification` silently gets nothing, which looks like a bug in
  the new feature. Guard `markAsFailed` in its own try/catch so a DB failure
  cannot mask the original SMTP error.
  *Corrected justification:* the draft claimed this catches a bad SMTP **host**.
  It does not — `nodemailer.createTransport` does not connect, so a bad host
  already throws inside the existing try and is already logged. What genuinely
  throws during resolution is `decryptSecret(smtp.pass)` and `coerceFromStorage`
  on `smtp.port`/`smtp.secure`, plus (after Item 6) template resolution.
- Pass `documentId`/`signerId`/`userId` at all six call sites
  (`signingController.ts:248, 261, 839, 894`, `signerController.ts:442`,
  `scheduledSendWorker.ts:238`). Pure argument-filling — the plumbing exists.
- Clamp pagination on the email-log controller with the existing
  `backend/src/utils/pagination.ts` helper: `pageSize` is currently unbounded
  (`?pageSize=10000000` pulls the table into memory) and `page=0` produces
  `OFFSET -20`, which Postgres rejects as an unhandled 500.
- Parameterise `deleteOlderThan`'s `INTERVAL '${days} days'`. No caller today, so
  no live SQLi — but Item 6 opens exactly the door (a retention setting) that
  would make it admin-reachable.
- **Close BUG-6 — user's choice of two options**, because one is irreversible and
  I cannot see from here whether an operator has wired an external provider to it:
  - **(a) HMAC-gate it** with the existing `WEBHOOK_SECRET` and coerce `error` to
    `String(...).slice(0, 1000)`. Closes the forgery hole, keeps any existing
    integration working, reversible.
  - **(b) Delete the route.** Nothing in this codebase posts to it and the app
    uses direct SMTP, so it is dead surface — but removal is not reversible for an
    operator who wired something up.

  Defaulting to **(a)** unless told otherwise.
- Delete the unmounted `createSignerEmailRouter`/`getSignerEmails` (applies
  `authenticate` but **no** document-access check — mounting it would let any
  authenticated user enumerate another tenant's recipients). This one is unmounted,
  so there is no integration to break.
- Explicit column projection for email logs — `SELECT *` currently returns the
  whole `metadata` JSONB to any team member. Route both `/emails` and the new
  `/activity` through one mapper.
- **Raw SMTP errors are admin-only.** `adminSettingsController.ts:20-46` already
  has `categorizeSmtpError`, built precisely because raw errors leak host, port
  and credential-adjacent text, and it guards an admin-only route. Non-admins get
  the categorised string; owner/instance-admin get the raw one.

### Item 3 — Lifecycle audit events *(depends on Item 1's post-commit seam)*

- Emit **after `COMMIT`**, never inside the transaction. `AuditService.logEvent`
  holds its own `Pool`, so an in-transaction call commits on a different
  connection: a rollback would leave permanent `signed`/`completed` rows for a
  signature that does not exist. Passing the `PoolClient` instead is not the
  answer either — a failed statement poisons the transaction, so the "best-effort,
  swallow and warn" wrapper would make the subsequent `COMMIT` fail. Collect
  intended events during the transaction, emit them after it commits.
- Events: `created`, `sent`, `viewed`, `signed`, `completed`, `cancelled`,
  `downloaded` — all seven already permitted by the CHECK.
- **`viewed` is recorded once per signer.** The only handler is the public,
  unauthenticated `getDocumentBySigningToken`, hit on every page load, refresh and
  link-preview bot. Add `signers.viewed_at` and emit only on the `NULL → now()`
  transition; record `signer_id` in metadata, since `user_id` cannot be populated
  on a token route.
- Every write is best-effort: a failure warns and never fails the user's
  operation. That is the direct lesson of BUG-1.
- `ip_address` is truncated to the column's 45 chars and labelled "reported IP"
  in the UI — `trust proxy` is pinned to one hop and the deployment may have two,
  so the value is client-influenceable and should not be shown as attested fact.

### Item 4 — Activity API *(depends on 2 and 3)*

- New `backend/src/services/activityService.ts` — **not** in `auditService`,
  which owns one table and must stay narrowly correct.
- One `UNION ALL` over `audit_events` and `email_logs` for the document, each row
  tagged `kind`, `ORDER BY created_at DESC, kind DESC, id DESC` (a total order —
  without the tiebreaker, rows sharing a timestamp can appear on two pages or
  none), `COUNT(*)` over an explicit subquery (the `SELECT *` → `SELECT COUNT(*)`
  string-replace trick used elsewhere silently breaks on a UNION).
  `WHERE document_id = $1` is load-bearing: `NULL = uuid` is never TRUE, so the
  settings/admin rows with a NULL document are excluded automatically.
- `LEFT JOIN users` projecting `actor_email` only, and signer name/email via
  `metadata->>'signer_id'`. Without this the timeline renders "signed by
  3f9a…-…", which is useless for the support workflow the feature exists for.
- Response shape `{ items, pagination: { total, page, limit, total_pages } }`,
  matching the dominant document-route convention; `/emails` stays as it is.
- Access: `checkDocumentAccess` plus an **explicit instance-admin bypass on this
  route only** (not widened globally). `checkDocumentAccess` has no admin path, so
  without this the Goal's "+ admin" is false and an admin investigating a delivery
  failure gets a 403 on a document they do not own.
- **No `/documents/:id/audit` route.** The draft justified it as "what
  `AuditTrail.tsx` always expected" — that page's expected shape and vocabulary
  both mismatch, and Item 5 deletes it. An endpoint with no consumer is a
  permanent compatibility obligation.

### Item 5 — Activity UI *(depends on 4)*

- `frontend/src/pages/DocumentActivity.tsx` at `/documents/:id/activity` inside
  `ProtectedRoute`. Timeline layout salvaged from `AuditTrail.tsx`, rewritten in
  Tailwind/DaisyUI; **delete `AuditTrail.tsx`**.
- `failed`/`bounced` rows surface the error prominently — the entire point.
- **A Resend button on failed rows**, calling the already-written
  `signerService.resend` → `POST /:id/signers/:signerId/resend`. Someone looking
  at a failed email wants to fix it, not just read about it; Item 1 is what
  unbreaks that endpoint. Highest value-per-risk item in the plan.
- If the CSV export is carried over from the dead page, its cells must be escaped
  (`"` → `""`) and formula-neutralised (`= + - @` prefixed with `'`) —
  `user_agent` is set verbatim from an unauthenticated signing request.

### Item 6 — Editable email content *(depends on Item 0)*

- **Own table, not `SETTINGS_REGISTRY`:** `email_templates(id, type UNIQUE,
  subject, body, updated_by, updated_at)` plus revision rows. The registry is a
  scalar key/value store: it has no history (the audit row records changed *key
  names*, never values, so "what did it say before I broke it?" is unanswerable),
  its `getAll()` ships every value in the admin payload, per-team later would need
  a composite key it cannot express, and on the frontend `InstanceSettings` owns a
  single dirty-state form and a single PUT — a separate `EmailTemplateSettings`
  component would either duplicate that machinery or not actually be separate.
- **Body is not raw HTML.** Admin content is escaped and rendered through a tiny
  allowlisted vocabulary (blank-line paragraphs, `**bold**`, `[text](url)` via
  `safeUrl`). The draft's "reject `<script` and `javascript:`" is a blocklist and
  stops nothing — `<img src=x onerror=…>`, `<svg onload=…>`, `<style>` with a
  tracking `url()`, and entity-encoded `javascript:` all pass it. Escaped text
  plus a small vocabulary is a control; a blocklist is not.
- **Placeholder substitution** is separate from, and composes with, that markup
  vocabulary — escaping the body does not remove the variables, which are the
  point of the feature. Dumb `{{key}}` replacement only: **no expression
  evaluation, no templating engine** on admin-authored content. Valid set per type:

  | Type | Placeholders |
  |---|---|
  | `signing_request` | `{{recipientName}}`, `{{senderName}}`, `{{documentTitle}}`, `{{companyName}}`, `{{signingUrl}}` |
  | `reminder` | the above plus `{{daysWaiting}}` |
  | `completion` | `{{recipientName}}`, `{{documentTitle}}`, `{{companyName}}`, `{{completedAt}}`, `{{downloadUrl}}` |

  Substituted values are HTML-escaped in the HTML variant and inserted raw in the
  plaintext one. An unknown `{{placeholder}}` is **rejected on save**, with the
  error naming the valid ones for that type.
- **No placeholder is *required*** — because the shell owns the CTA button and
  link box, an admin who deletes `{{signingUrl}}` from the body still sends a
  working signing link. That is the whole safety argument for the fixed layout the
  user chose, and it is why save-time validation can be an allowlist check rather
  than a "did you keep the important bits" heuristic.
- **Plaintext variant:** `sendWithLogging` takes both `html` and `text`, so each
  template renders twice — the markup vocabulary degrades to plaintext
  (paragraphs stay blank-line separated, `**bold**` unwraps to bare text,
  `[text](url)` becomes `text: url`) with unescaped substitution.
- Strip `[\r\n]` from anything substituted into a subject line.
- **The shell stays code-owned** — header, CTA button, link box, branding footer.
  The admin cannot delete the signing link because they never had it. This is what
  makes editing safe and is why the user's "fixed layout" choice matters.
- **Wiring:** a separate injected `templateProvider` on
  `EmailService.withProvider(configProvider, emailLogService, templateProvider?)`.
  Do **not** fold templates into `getEmailConfig`: `settingsService` already
  imports a type from `emailService`, so making that a value import creates a
  runtime cycle, and widening `EmailConfig` would make `verifyConnection` fetch
  template bodies to check an SMTP connection.
- **Resolves the draft's critical self-contradiction.** Item 2 creates the log row
  before config resolution, but `email_logs.subject` is `NOT NULL` and a templated
  subject cannot exist until templates resolve. With a separate provider, the
  template read happens **before** `createLog`, inside the same try that calls
  `markAsFailed` — so a template failure still leaves a visible failed row, and
  Item 2's guarantee survives Item 6 instead of being silently reverted.
- Preview: `POST /api/admin/settings/email-preview` returning
  `{ success, data: { html } }` as **JSON, never `text/html`** (a navigable HTML
  response on the API origin is its own reflected-XSS surface), rendered in
  `<iframe srcdoc sandbox="" referrerPolicy="no-referrer">` — empty sandbox;
  `allow-scripts` together with `allow-same-origin` is a documented no-op.
- Reset to default = delete the row, falling through to the code default.
- Drive-by while in the file: `SettingSource` on the frontend is missing
  `'invalid'`, so a broken setting today renders `className="badge badge-sm
  undefined"` — the exact case the backend went to trouble to surface.

## File-level checklist

**Item 0 — injection fix**
- [x] 0.1 `backend/src/utils/emailTemplate.ts` — `escapeHtml`, `safeUrl`, `safeMailto` + unit tests
- [x] 0.2 Apply across all six `generateXxxHtml` + `generateFooterLinks`; test each with a `<script>`-bearing input
- [x] 0.3 `models/Branding.ts` — URL scheme allowlist + `email_footer_text` cap (BUG-5 write side)

**Item 1 — unbreak failure paths**
- [x] 1.1 Migration: extend `audit_events` CHECK; `down` deletes offending rows first (BUG-1/2)
- [x] 1.2 Split `AuditEventType`; update `isValidEventType` + `getDescription`; single exported constant
- [x] 1.3 Guard the resend audit INSERT in its own try/catch
- [x] 1.4 Per-signer try/catch + partial-outcome response in `sendForSignature` (BUG-3)
- [x] 1.5 Move the two email sends out of `submitSignature`'s transaction (BUG-4)
- [x] 1.6 Integration test under `backend/src/__tests__/integration/` asserting the resend audit row actually persists — `signerController.test.ts:46-48` mocks the pool with a bare `jest.fn()` and `:459-467` asserts the *violating* value, so the unit suite is structurally blind to constraint violations and would be equally blind to this fix

**Item 2 — evidence on every send**
- [x] 2.1 `sendWithLogging`: log first, resolve inside the try, drop the `resolved?` bypass, guard `markAsFailed`
- [x] 2.2 Pass `documentId`/`signerId`/`userId` at the six call sites
- [x] 2.3 Clamp pagination via `utils/pagination.ts`; parameterise `deleteOlderThan`
- [x] 2.4 Close BUG-6 — HMAC-gate the email-status webhook (default) or delete it, per the user's call; delete the unmounted `createSignerEmailRouter`/`getSignerEmails` regardless
- [x] 2.5 Explicit column projection; raw `error_message` gated to owner/instance-admin, categorised otherwise

**Item 3 — lifecycle events**
- [x] 3.1 Post-commit `recordEvent` helper (best-effort, pool-based, never in-transaction)
- [x] 3.2 Emit **six** of the seven lifecycle events; `signers.viewed_at` migration so `viewed` fires once per signer
  - `downloaded` is **deferred** - see "Item 3 deviation" below

**Item 4 — activity API**
- [ ] 4.1 `services/activityService.ts` — UNION, total order, subquery count, actor join, explicit projection
- [ ] 4.2 `GET /api/documents/:id/activity` — `checkDocumentAccess` + route-local instance-admin bypass

**Item 5 — activity UI**
- [ ] 5.1 `EmailLog`/`ActivityItem` types, service, hook
- [ ] 5.2 `DocumentActivity.tsx` — failures prominent, Resend on failed rows
- [ ] 5.3 Route + entry points in `Documents.tsx`; delete `AuditTrail.tsx`

**Item 6 — editable email content**
- [ ] 6.1 `email_templates` + revisions migration
- [ ] 6.2 `templateService` + safe-markup renderer (escape + allowlisted vocabulary, subject CRLF strip)
- [ ] 6.3 `templateProvider` injection at the five construction sites; template read before `createLog`
- [ ] 6.4 Admin CRUD + preview endpoint (JSON envelope)
- [ ] 6.5 `EmailTemplateSettings.tsx` in the Instance tab; preview in `sandbox=""` iframe; reset to default
- [ ] 6.6 Frontend `SettingSource` gains `'invalid'`

## Item 3 deviation — `downloaded` is not emitted

The plan names seven lifecycle events. Six ship: `created`, `sent`, `viewed`,
`signed`, `completed`, `cancelled`. **`downloaded` does not**, because there is
no server-side signal that separates a download from a page render:

- `documentController.download` sets `Content-Disposition: inline` *deliberately*
  ("to allow PDF viewing in browser (e.g., for react-pdf)") plus
  `Accept-Ranges: bytes`, and `PrepareDocument.tsx` uses it as the viewer's
  `pdfUrl`. Emitting there writes a row on every render, several with range
  requests.
- `downloadDocumentByToken` is the same shape — its own doc comment says
  `Sign.tsx` reuses the route for the signing-time preview *and* the
  post-submit download button.

Dedup (the `viewed` treatment) is not a remedy: it would fire on the first PDF
*render* and mislabel a view as a download.

**Path forward, for Item 5** (where the frontend is already in scope): the two
real download callers (`useDocuments.ts`'s blob download and Sign.tsx's
"Download Signed Document") pass an explicit `?download=1`, and the backend
emits only on that. Note the consequence and label it as the plan already
labels "reported IP": the event becomes **client-attested** — omit the flag and
the download leaves no row. Until then, `downloaded` is a verb permitted by both
the CHECK constraint and `DOCUMENT_EVENT_TYPES` with no writer; Item 5's label
map should not assume it appears.

## Risks & open questions

- **Item 0 changes every outgoing email's HTML.** A document titled `Q3 <Draft>`
  renders broken today and literally afterwards. Correct, but visible — needs a
  real observed send at Gate 4, not just unit tests.
- **Item 1.5 and 2.1 sit on the path every email takes.** Regression risk is
  concentrated there; both need tests for the throw paths specifically.
- **Populating `document_id` changes retention.** Both FKs are `ON DELETE
  CASCADE`, so once the columns are filled, deleting a document erases its email
  failure history — currently retained by accident because the columns are NULL.
  Stating it as a decision rather than discovering it later.
- **No retention policy exists** for `email_logs` (recipient addresses +
  metadata, indefinitely), and Item 2 raises the write rate. Not solving it here;
  recording that it is unsolved.
- **Existing orphaned rows stay orphaned.** No backfill is possible — the context
  was never captured.
- `team_members.role` is never consulted by `canAccessDocument`, so a viewer-role
  member has an owner's reach. Pre-existing, out of scope, but the plan should
  stop citing that boundary as if it were deliberate.
- **Deleting the email-status webhook is an API removal.** Nothing in this
  codebase sends to it and the app uses direct SMTP, but if an operator has wired
  an external provider to it, that integration stops. Flagging for the decision.

## Agent critiques considered

Panel: `security-critic`, `architecture-critic`, plus two `general-purpose`
critics with distinct objectives and schemas — a correctness/edge-case auditor
and a scope/simplicity critic. All four ran read-only against the real repo.
**3 critical, 14 high, 31 medium, 24 low.** Every critical and high is actioned
or rejected with a reason below, quoting the critic's own severity/confidence.

### Critical — all actioned

- **`correctness` F1 (critical/high) — Items 1.1 and 5.4 are mutually exclusive.**
  `email_logs.subject` is `NOT NULL` and `sendSigningRequest` renders the subject
  before `sendWithLogging`; routing templates through `getEmailConfig` forces
  resolution *before* the log row, silently reverting 1.1's only benefit on the
  three highest-volume email types — with the checklist box ticked. **Actioned:**
  Item 6 uses a separate `templateProvider` read that happens before `createLog`
  inside the same try. This finding alone justified the panel.
- **`architecture` (critical/high) — audit writes inside `submitSignature`'s
  transaction.** `AuditService` holds its own pool, so a rollback leaves permanent
  `signed`/`completed` rows for a signature that does not exist; passing the
  client instead makes best-effort unsafe, because a failed statement poisons the
  transaction. **Actioned:** post-commit emission (Item 3.1).
- **`architecture` (critical/high) — emails awaited inside that same transaction
  (BUG-4).** An SMTP failure rolls back a signature that was already emailed
  about, and this plan would render that contradiction in the UI. **Actioned:**
  Item 1.5.

### High — actioned

- **`security` #1 + `architecture` (high/high) — ship the escaping fix first.**
  The draft buried a live injection at position 12 of 16 while items 1–4 made the
  traffic more visible but not safer. **Actioned:** hoisted to Item 0.
- **`security` #2 + `architecture` (high/high) — branding is a team-owner
  escalation (BUG-5), not a footnote.** **Actioned:** Item 0.2 + 0.3, including
  write-side validation.
- **`correctness` F2 (high/high) — 1.1's stated motivation is wrong.**
  `createTransport` does not connect, so a bad SMTP host already produces a failed
  row; and three callers resolve up the chain, so the reorder cannot help them.
  **Actioned:** justification corrected in Item 2, and the `resolved?` bypass
  removed so the coverage gap closes.
- **`correctness` F3 (high/high) — identical timestamps inside a transaction.**
  `CURRENT_TIMESTAMP` is transaction-start time, so `signed` and `completed` would
  sort randomly. **Actioned:** post-commit emission plus the `(created_at, kind,
  id)` total order in 4.1.
- **`correctness` F5 (high/high) — BUG-1's mechanism was a local catch, not
  `errorHandler`.** **Actioned:** description corrected; outcome unchanged.
- **`correctness` F7 (high/high) — all six call sites confirmed, plus the CASCADE
  retention consequence.** **Actioned:** added to Risks.
- **`scope` F4 + F5, `architecture` (high/high) — the resend path and
  `sendForSignature` are the user's literal complaint and the draft touched
  neither.** **Actioned:** BUG-3 fix (1.4) and the Resend button (5.2).
- **`scope` F1 (high/high) — the MVP is ~5 of 16 items.** **Partially actioned:**
  the ship order now front-loads exactly those, and the summary offers the cut.
  The rest is kept because the user explicitly asked for the audit trail and for
  editable emails.
- **`architecture` (high/high) — `viewed` floods from a public endpoint.**
  **Actioned:** `signers.viewed_at`, once per signer (Item 3.2).
- **`architecture` (high/medium) — `SETTINGS_REGISTRY` is the wrong home for
  templates.** **Actioned:** dedicated `email_templates` table (Item 6.1). The
  frontend argument decided it: `InstanceSettings` owns one dirty-state form and
  one PUT, so the "separate component" the draft promised could not have been
  separate.
- **`architecture` (high/medium) — new PII collection *and* new disclosure in one
  plan.** **Partially actioned:** explicit projection + `toPublicJSON`, raw errors
  gated to owner/admin. Noting that signer emails/IPs are *already* exposed to team
  members via `Signer.toPublicJSON`, so the genuinely new disclosure is the raw
  SMTP error text — which is now gated.
- **`architecture` (medium/high) — sequencing claim was false.** **Actioned:**
  dependency edges stated; ship order inverted.

### High — rejected

None. Every `critical` and `high` finding is actioned above.

### Notable medium/low decisions

- **Disagreement — merged endpoint.** `scope` F3 (medium/high) says DROP the
  UNION and merge two queries client-side; `architecture` (medium/high) says
  merged wins but belongs in its own service. **Merged wins.** Deciding factor:
  two independently offset-paginated lists cannot be interleaved past page 1 —
  a correctness argument beats a line-count one. Adopting the architecture
  critic's `activityService.ts` rather than putting a two-table UNION inside
  `auditService`.
- **Disagreement — preview endpoint.** `scope` F8 (low/medium) says DEFER, since
  test-send already shows the real thing. **Kept**, because Item 6's body is now
  escaped markup rather than raw HTML, which removes most of the risk that made it
  expensive, and an admin otherwise cannot see the code-owned shell at all.
- **Disagreement — event vocabulary.** `architecture` offered "record the resend
  as the existing `sent` verb with metadata, and never extend the CHECK".
  **Rejected:** `user.sessions_revoked` is not a document verb under any reading,
  and `settings.updated` already broke that purity. Extending the CHECK **and**
  splitting the TS union is the honest fix.
- **Disagreement — route shape.** `architecture` (medium/medium) wants
  `/documents/:id` as a tabbed detail page with View navigating there.
  **Rejected for now:** converting the existing View modal to a page is
  unrequested UX churn, and `/documents/:id/activity` is exactly the URL a nested
  tab route would use later, so nothing is stranded.
- **Dropped as answered:** the draft's open question about exposing recipient
  addresses to team members — `/emails` already serves them to exactly that
  audience today (`scope` F10), so the UI moves no boundary.
- Also actioned: `security` #3 (`mailto:`), #4 (all generators), #5 (categorised
  errors), #6 (projection), #7 (BUG-6), #8 (TS union), #9 (bricked `down`),
  #11 (sandbox), #12 (blocklist→allowlist), #14 (pagination clamp), #15
  (`deleteOlderThan`), #17 (unmounted router), #19 (subject CRLF), #20 (IP
  labelling); `correctness` F4, F6, F8, F9, F10, F11, F13; `architecture` on
  actor identity, envelope shape, import cycle, `markAsFailed` masking,
  `getAuditEventsKeyset`'s always-zero total, the wrong file path in the draft,
  and the `SettingSource` drift.
- **Dropped without individual reasons:** 14 medium, 11 low — chiefly style
  observations, restatements across critics, and items already covered by another
  finding's fix.

### Not findings (checked, clean)

SSRF via logo URL (nothing server-side dereferences it); CSS injection via
branding colours (hex-regex validated); signers reaching the activity endpoints
(no code path — `authenticate` has no signing-token branch);
`documentController.update` lacking `checkDocumentAccess` (the service scopes
`WHERE id = $n AND user_id = $n+1`).

## Agent critiques considered — diff stage

### Item 3 · pass 1

Panel: `security-critic`, `architecture-critic`, both read-only against the real
diff. **4 high, 6 medium, 11 low.** Actioned unless recorded below.

**High — actioned**

- **`architecture` (high/high) — `scheduledSendWorker` is the other
  draft→pending seam and emitted no `sent`.** Every scheduled send would leave a
  permanently gapped timeline, no backfill possible, on exactly the "did we ever
  send this?" question the feature exists to answer. **Actioned:** the worker now
  emits `sent` with `metadata.scheduled = true`.

**High — recorded, out of this item's scope**

- **`security` (high/high) — `updateDocument` has no state-transition
  validation.** It does a blind `SET status = $n`; the controller checks enum
  membership only. So `completed → draft` is accepted and re-opens `canEdit()` on
  a fully-signed document, and `→ pending` is accepted directly, bypassing
  `sendForSignature` entirely (signable, no emails, no `sent` event). **Partially
  actioned:** the `cancelled` emit now keys off a pre-read transition rather than
  the echoed request value, so it cannot emit duplicates — and the code comment
  claiming the service validates transitions was wrong and has been corrected.
  **The underlying flaw is a separate security fix**, not Item 3's: it predates
  this plan, and folding a state-machine change into an audit item would hide it.
  Raised to the user as its own decision.
- **`security` (high/high) — `audit_events.document_id` is `ON DELETE CASCADE`
  and `deleteDocument` is a hard delete.** Deleting a document destroys its
  entire audit trail, and no `deleted` event is emitted, so the most
  audit-worthy action leaves zero trace. **Recorded, not actioned:** the fix
  (FK → `SET NULL`, snapshot `document_id`/`title` into metadata, emit `deleted`
  before the delete, or soft-delete) is a schema and lifecycle decision beyond
  this item, and it is the same CASCADE shape already accepted for `email_logs`
  in Item 2. Raised to the user.

**Medium — actioned**

- **`architecture` (medium/high) — none of the six emissions were asserted.**
  `documentController.test.ts` used `mockPool = {} as Pool`, so both its
  emissions died inside `recordEvent`'s catch, and the four
  `signingController.test.ts` edits were positional mock-chain filler that
  asserted nothing. **Actioned:** `auditService` is now an optional injected
  constructor parameter on both controllers, tests inject a spy and assert
  `event_type` + `metadata` per site, and the filler rows are deleted.
- **`architecture` (medium/high) + `security` (high/high) — the `cancelled`
  guard confirmed the write rather than detecting a transition.** **Actioned:**
  pre-read status; emit only on `previous !== 'cancelled'`.
- **`security` (medium/high) — the `viewed_at` gate could be consumed while the
  audit row was lost.** The UPDATE autocommits before `recordEvent`, which
  swallows failures — BUG-1's shape with the 500 removed. **Actioned:**
  `recordEvent` returns a boolean and the caller resets `viewed_at` to NULL on
  failure, so a later open retries.
- **`architecture` (medium/medium) — four writers, invariants on only the new
  ones.** **Partially actioned:** `signerController`'s hand-rolled try/catch (an
  exact duplicate of `recordEvent`, written days earlier in Item 1.3) now routes
  through it. The two remaining raw writers (`settingsService`,
  `adminUsersController`) write `document_id = NULL` rows, which Item 4's
  `WHERE document_id = $1` excludes by construction — so converging them buys
  the timeline nothing and is left alone deliberately.

**Medium — rejected, with reason**

- **`architecture` (medium/medium) — move the `viewed` emit before the
  signability gates**, so post-deadline and out-of-turn opens are visible.
  **Rejected.** `viewed_at` is a one-shot gate: an out-of-turn signer who opens
  early would burn it, and the genuine later view — the one that matters as
  evidence — would then never be recorded. In a signing product's trail `viewed`
  means "was served the document", not "hit the URL". The critic's own concern is
  real but the proposed fix makes the primary case strictly worse.
- **`security` (low/high) — move the `sent` emit below the "no signer could be
  notified" 500 branch.** **Rejected.** The status UPDATE has already committed
  at that point and `canSend()` forbids re-sending from `pending`, so the
  document *is* pending. Suppressing `sent` would produce the exact gap the
  architecture critic's high finding is about. The event records the state
  transition; the send outcome is what `email_logs` is for.

**Medium — accepted as inherent**

- **`security` (medium/high) — the trail is lossy by construction** (swallowed
  failures; a crash between COMMIT and the post-commit emit loses
  `signed`/`completed`). True, and the price of never failing a user operation
  for an audit write. Closing it needs a transactional outbox, which is a
  different design. **Item 5 must label the timeline best-effort and reconcile
  against `signers.signed_at` / `documents.completed_at` rather than presenting
  `audit_events` as complete.**
- **`security` (medium/high) — mail security scanners burn the `viewed` gate.**
  Defender Safe Links and Proofpoint fetch every link and pass every gate, so the
  recorded IP/user-agent will routinely be a datacenter scanner and the real
  signer's first view is then never recorded. Real, and it makes `viewed` the
  least trustworthy row in a trail where it is the most likely to be relied on.
  Not fixable without recording every view (which is what the once-per-signer
  gate exists to avoid). **Item 5 must not present `viewed` as attested.**

**Low — actioned:** IP validated with `net.isIP` and stored NULL rather than
truncating fabricated `X-Forwarded-For` text (the original truncation comment was
factually wrong and is corrected); `user_agent` capped at 512 chars; `actor_email`
snapshotted into metadata so attribution survives user deletion; `workflow_type`
added to `sent` metadata so a sequential send does not read as "sent to 3" beside
one email; `viewed_at` added to `SignerData` and both row mappers, and the
per-request UPDATE skipped when the model already shows it set; `ip`/`get` added
to the `documentController` test doubles.

**Low — recorded, no action:** the `signed`/`completed` ordering tiebreaker
(each is its own autocommit separated by a round trip, and `timestamp` has
microsecond resolution, so the tie the tiebreaker cannot break does not occur);
the `allSigned` READ COMMITTED race on concurrent final submissions
(pre-existing, needs `SELECT … FOR UPDATE`, out of scope); **and for Item 4:
project `activityService`'s columns explicitly and omit `ip_address`/`user_agent`
— the planned `UNION ALL` bypasses `AuditEvent.toPublicJSON()`, which is what
strips them today.**

## Run stats

*(filled in at the end of Phase 2)*
