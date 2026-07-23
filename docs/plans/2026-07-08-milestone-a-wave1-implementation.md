# Milestone A — Wave 1 Implementation Plan

**Date:** 2026-07-08
**Status:** DRAFT — pending adversarial critique reconciliation
**Parent plan:** `docs/plans/2026-07-05-launch-readiness-assessment.md`
**Security source:** `.planning/tasks/tasks-0041-launch-security-hardening.md`

---

## Goal

Land the first launch-blocking wave before public registration opens: the four Wave-1 security criticals/highs (SEC-C2, SEC-C3/C4/C5, SEC-H1(+M15), SEC-H9) plus the two visible feature breakages (F1 Audit Trail, F2 Webhooks UI). All items verified still-present by recon on 2026-07-08 (no code commits since the 2026-07-05 audit; only the SEC-C1 fix sits uncommitted in the working tree).

## Review verdict (the "check plans / security / feature / looks" pass)

- **Plans** — Plan-of-record and tasks-0041 are accurate and current; status-correction notes are in `.planning/TASKS.md` / `SAAS_ROADMAP.md`. Two corrections discovered by recon, folded in below: (a) the drafted `submitSignatureSchema` does not match the real submit payload (missing `text_value`/`font_family`) — wiring it verbatim would break typed signatures and text/radio/checkbox/date fields because zod `z.object` strips unknown keys; (b) F1 is worse than documented — `AuditTrail.tsx` is not even routed in `App.tsx`, so the fix needs frontend route + nav link, not just a backend endpoint.
- **Security** — unchanged since audit; Wave 1 below. One positive found: webhook delivery already sets `maxRedirects: 0`, so redirect-based SSRF is already closed; the DNS/rebinding hole remains.
- **Feature** — F1/F2 confirmed broken/gated exactly as documented; the webhooks frontend already contains working mutations + modal, so F2 is mostly un-gating + a list UI + a `Webhook` type. Frontend's event list (6) must be aligned with the backend's valid set (8: + `template.created`, `signer.declined`).
- **Looks** — L1 (12 hardcoded dark-mode colors) and L2 (PublicNavbar missing on Privacy/Terms/Contact/VerifyEmail) remain Milestone-B fast-follows; not in this wave. Advice recorded in parent plan.

## Approach

Seven independent units, implemented by parallel agents, each with regression tests where the fix closes an exploit. No schema/migration changes anywhere in this wave.

### U1 — SEC-C2: storage path containment + branding input hardening

1. `backend/src/adapters/LocalStorageAdapter.ts` — add a private `resolveSafe(filePath: string): string`: `const resolved = path.resolve(this.basePath, filePath)`; reject (throw) unless `resolved` equals or is contained in `path.resolve(this.basePath)` (compare via `path.relative` — reject if it starts with `..` or is absolute; on win32 compare case-insensitively). Use it in **all** methods: `save`, `read`, `delete`, `exists`, `getMetadata`, `copy` (both paths), `move` (both paths) — lines 66, 88, 104, 130, 144, 175/176, 200/201.
2. `backend/src/controllers/brandingController.ts` (`updateBranding`, ~88-166) — strip `logo_path` and `favicon_path` from `req.body` before passing to the service. **Strip in the controller, not the service**, because `uploadLogo` legitimately sets these via the service with a server-generated key (implementer: confirm `uploadLogo`'s persistence path before editing; do not break it).
3. Regression tests: `LocalStorageAdapter` rejects `../../../../etc/passwd`, `..\\..\\secrets`, absolute paths; accepts normal nested keys (`documents/x/y.pdf`).

### U2 — SEC-C3/C4/C5: signing submission integrity (one edit to `submitSignature`)

`backend/src/controllers/signingController.ts` (`submitSignature`, line 376+), after the existing signer-status check and **before** the insert loop:

1. **C4** — fetch the document (`signer.document_id`); reject 400 unless `status === 'pending'`; reject 400 if `isExpired()` (mirror the GET path's messaging at line 319).
2. **C5** — if `document.workflow_type === 'sequential'`, run the same `Signer.canSignInSequence(signer, signersList)` block as the GET path (lines 328-344).
3. **C3** — validate the whole batch's field ownership in one query: `SELECT id FROM fields WHERE id = ANY($1) AND document_id = $2 AND signer_email = $3`; if the returned id-set doesn't cover every submitted `field_id`, reject 400 (whole batch, before any insert). Match how the GET path scopes fields to the signer (lines 347-350) — use the same column semantics it uses.
4. Wire `validate(submitSignatureSchema)` (existing `middleware/validation.ts`) on `POST /:token/sign` in `signingRoutes.ts` — **but first extend the schema** in `validators/signingSchemas.ts` to the real payload: add optional `text_value` and `font_family`; verify against the frontend Sign page's actual payload construction (grep `frontend/src/pages/Sign*` for the POST body) — if non-signature field types send other `signature_type` values or extra keys, align the schema so nothing legitimate is stripped or rejected. If the real payload can't be pinned down confidently, wire only params validation and leave body enforcement to the controller checks.
5. Regression tests: cross-document `field_id` rejected; cancelled document rejected; expired document rejected; out-of-order sequential signer rejected.

### U3 — SEC-H1 + SEC-M15: rate-limit public signing + payload caps

1. `backend/src/middleware/rateLimiter.ts` — remove the blanket `/api/signing/` skip (lines 176-178) so the general `apiLimiter` covers signing GETs (view/download). Implementer: check `shouldSkipRateLimit` isn't shared by other limiters in a way that changes their behavior unexpectedly.
2. `backend/src/routes/signingRoutes.ts` — import `signingLimiter` and apply to `POST /:token/sign` (the tight 50/hr/IP limiter; GETs stay on the general limiter to avoid locking out offices behind NAT mid-signing).
3. `backend/src/models/Signature.ts` (`validateSignatureData`) — cap `signature_data` length (7_000_000 chars ≈ 5 MB decoded) for drawn/uploaded.
4. `backend/src/server.ts` — mount `app.use('/api/signing', express.json({ limit: '10mb' }))` **before** the global 50 MB `express.json` (line 147) so signing bodies parse under the smaller cap and the global parser skips already-parsed bodies (M15).

### U4 — SEC-H9: webhook SSRF — validate the resolved IP, both ends

1. New `backend/src/utils/urlSafety.ts`:
   - `isPrivateAddress(ip: string): boolean` — IPv4: 0.0.0.0/8, 10/8, 100.64/10 (CGNAT), 127/8, 169.254/16, 172.16/12, 192.168/16, 224/4, 240/4, 255.255.255.255; IPv6: `::`, `::1`, fc00::/7, fe80::/10, and IPv4-mapped (`::ffff:a.b.c.d` → recheck as IPv4).
   - `assertPublicWebhookUrl(url: string): Promise<void>` — parse; require http(s) (keep the existing HTTPS-in-prod rule); `dns.promises.lookup(hostname, { all: true, verbatim: true })`; reject if **any** resolved address is private. Preserve the existing dev-mode localhost allowance (`NODE_ENV === 'development'`).
2. `backend/src/controllers/webhookController.ts` — replace the string-only `isPrivateIp` checks at create (~71) and update (~332) with `assertPublicWebhookUrl`.
3. `backend/src/services/webhookDeliveryService.ts` — at delivery, don't trust the stored URL: build the axios request with `httpAgent`/`httpsAgent` whose `lookup` wrapper resolves then **rejects private IPs at connect time** (closes DNS-rebinding: validation and connection use the same resolution). Keep `maxRedirects: 0`.
4. Unit tests for `isPrivateAddress` ranges (v4 + v6 + mapped).

### U5 — F1: Audit Trail, end to end

1. Backend: add `getAuditTrail` handler (in `documentController` — no new controller file) calling `auditService.getAuditTrail(documentId, { limit, offset })` (service exists, `auditService.ts:62-103`); route `router.get('/:id/audit', checkDocumentAccess, ...)` in `documentRoutes.ts` (same middleware chain as other `/:id` routes).
2. Response shape: **match what `AuditTrail.tsx` actually parses** (it expects `AuditEvent[]` — implementer reads its axios handling and mirrors the repo's `{ success, data }` convention only if the page unwraps it; otherwise adapt the page's parsing, not the API convention).
3. Frontend: route the orphaned page in `App.tsx` (e.g. `/documents/:id/audit`) inside the authenticated layout, and add a nav entry point ("Audit Trail" button/link) on the document view/detail page.

### U6 — F2: enable the Webhooks Settings UI

`frontend/src/pages/Settings.tsx` + `frontend/src/types/index.ts`:

1. Add a `Webhook` interface to `types/index.ts` mirroring `toPublicJSON()` (id, url, events, active, created_at, updated_at, secret_preview).
2. Replace the stub `queryFn` with a real `GET /webhooks` call; remove `enabled: false`; unwrap the backend's `{ success, data }` envelope.
3. Un-disable the "Create Webhook" button; delete the "Coming Soon" card; render the webhook list (url, events badges, active state, created date, delete button; active toggle via existing `PUT /webhooks/:id` if cheap).
4. Align `availableEvents` with the backend's 8 valid events (+ `template.created`, `signer.declined`).
5. Surface the one-time secret from the create response if the backend returns it (check `createWebhook` response; secret is otherwise only previewed).

### U7 — chore/docs

- `.gitignore`: add `frontend/playwright-report/` (and Playwright `test-results/` if not covered).
- Tick completed items in `.planning/tasks/tasks-0041-launch-security-hardening.md`; update parent plan status; README notes for audit-trail endpoint + webhooks UI; suggest CHANGELOG entries.

## File-level change list (summary)

| Unit | Files touched |
|------|---------------|
| U1 | `adapters/LocalStorageAdapter.ts`, `controllers/brandingController.ts`, `+ LocalStorageAdapter.test.ts` |
| U2 | `controllers/signingController.ts`, `routes/signingRoutes.ts`, `validators/signingSchemas.ts`, `+ tests` |
| U3 | `middleware/rateLimiter.ts`, `routes/signingRoutes.ts`, `models/Signature.ts`, `server.ts` |
| U4 | `+ utils/urlSafety.ts`, `controllers/webhookController.ts`, `services/webhookDeliveryService.ts`, `+ urlSafety.test.ts` |
| U5 | `controllers/documentController.ts`, `routes/documentRoutes.ts`, `frontend/src/App.tsx`, document view page (nav link) |
| U6 | `frontend/src/pages/Settings.tsx`, `frontend/src/types/index.ts` |
| U7 | `.gitignore`, `.planning/tasks/tasks-0041-*.md`, `README.md`, plan docs |

U2 and U3 both touch `signingRoutes.ts` — implement U2+U3 in the same agent to avoid conflicts. Everything else is disjoint.

## Risks & open questions

- **Zod stripping** (found in recon): wiring the submit schema without extending it would corrupt non-signature field submissions. Mitigation is explicit in U2.4; fallback is params-only validation.
- **Rate limits on shared IPs**: `apiLimiter` now applies to signing GETs; offices behind NAT could throttle. Accepted for launch (limits are env-tunable: `RATE_LIMIT_SIGNING_MAX`).
- **`resolveSafe` and legit keys**: storage keys are generated server-side (`documents/…`); containment should be invisible. Copy/move also guarded. Watch Windows `path.sep` handling in tests.
- **Webhook DNS-lookup latency** on create/update (~one lookup) — negligible; delivery lookup already happened implicitly in axios.
- **Frontend response-shape mismatches** (U5/U6): both units explicitly instructed to read the actual parsing code first.
- **Docker/dev**: dev-mode localhost webhooks must keep working (`NODE_ENV === 'development'` allowance preserved).

## Agent critiques considered

_(to be filled after the adversarial pass)_

## Verification gate (after implementation)

1. `cd backend && npm run build` and `cd frontend && npm run build` — clean.
2. Targeted tests: new regression tests + existing suites for touched services (`signing`, `storage`, `webhook`).
3. Item-by-item diff walk against this plan (Opus-tier verification per workflow).
4. Commit in logical units (Conventional Commits), push `develop` (explicitly authorized by the user's /goal directive — overrides the repo's default no-commit policy for this session).
