# EzSign — Public Launch Readiness Assessment & Plan

**Date:** 2026-07-05
**Author:** Claude (orchestrated review)
**Status:** DRAFT — awaiting approval before any implementation

---

## Goal

EzSign is code-complete through v1.3 (tags `v1.1.0`, `v1.2.0`, `v1.3.0`) and SaaS "Phase 1 — Go Live" is marked done. The next step is opening **public registration** and running it as a multi-tenant SaaS. This document reconciles a four-dimension review — **security, features/correctness, looks/UX, and the plans themselves** — into a single prioritized, sequenced roadmap so we fix the right things *before* going public.

## Where we are (verified facts)

- Releases tagged: `v0.1.0`, `v1.1.0`, `v1.2.0`, `v1.3.0`. Branches: `develop` (active), `main`.
- Production deploy scaffolding exists: `docker-compose.prod.yml` (DB/Redis/backend/frontend ports reset — not publicly exposed), `Caddyfile` (auto-HTTPS + some security headers), `DEPLOYMENT.md`.
- Auth stack: JWT + refresh, Redis token blacklist + session revocation, 2FA (TOTP), API keys with scopes, tiered rate limiting (Redis w/ in-memory fallback).
- SaaS Phase 1 (`.planning/tasks/tasks-0040-saas-phase1.md`) done: public register, email verify, personal-team auto-create, support link, deploy config.
- SaaS Phases 2–4 (usage limits, admin dashboard, monitoring, backups, Stripe) are **outlines only** — no PRDs, no task files.

## Method & confidence caveat

Four adversarial reviews were launched. **Two produced results** before an account session limit terminated the rest:
- ✅ **Broken/half-wired flows** — completed (full report).
- ◐ **Security** — one confirmed finding before termination; the rest below are **verified by my own direct code reads** (files cited).
- ✗ **Full competitive-feature pass** and ✗ **deep UI/UX pass** — cut off. The looks section below is grounded in targeted greps, not an exhaustive page-by-page audit; a follow-up pass is recommended (non-blocking).

Every finding below cites a file. Items I could not fully confirm are marked **[VERIFY]**.

---

## Findings

> **UPDATE 2026-07-05 — full security audit complete.** The cut-off audits were re-run and verified. Verdict: **not safe to open public registration yet** — **5 Criticals** (1 fixed), **9 Highs**, ~15 Mediums. The complete, ordered, actionable fix list is **`.planning/tasks/tasks-0041-launch-security-hardening.md`** (this is now Milestone A). Highlights: (C1) registration `role` mass-assignment → anyone becomes admin — **FIXED**; (C2) branding `logo_path` path traversal → unauthenticated arbitrary file read of `.env` via public `getLogo`; (C3-C5) `submitSignature` skips field-ownership, document-status/expiry, and sequential-order checks → **signature forgery** on the core signing path. The table below is the earlier first-pass; defer to tasks-0041 for the authoritative set.

### 1. Security (this is the launch gate)

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| S1 | **High** | **Webhook SSRF.** `isPrivateIp()` only inspects the literal hostname string (checks `localhost`/`127.0.0.1`/`::1` and dotted-octet private ranges). A DNS hostname that resolves to an internal IP, an IPv6 address, or integer/hex-encoded IP bypasses it, and delivery never re-validates the resolved IP (DNS-rebinding). A public user can point a webhook at `169.254.169.254` (cloud metadata) or internal services. | `backend/src/controllers/webhookController.ts:71,332,475-492`; delivery in `webhookDeliveryService.ts` |
| S2 | **High** [VERIFY] | **`ORDER BY` built by string interpolation.** `ORDER BY ${sortBy} ...` interpolates `sortBy` directly. It's typed as a union (`'created_at'\|'updated_at'\|'title'`) but **TS types are erased at runtime** — safety depends entirely on the controller runtime-validating `req.query.sortBy`. If it doesn't, this is SQL injection. Same pattern in `buildKeysetConditions` (`pagination.ts:103`). Fix is cheap and correct either way: enforce a runtime allowlist. | `backend/src/services/documentService.ts:215,287`; `backend/src/utils/pagination.ts:82-108`; confirm callers in `documentController`, `auditService` |
| S3 | **Medium** | **JWT accepted via `?token=` query param on all routes**, and Caddy logs full request URLs to `/data/access.log`. Tokens then land in access logs, browser history, and `Referer` headers. Intended only for PDF loading. | `backend/src/middleware/auth.ts:42-45`; `Caddyfile:36-41` |
| S4 | **Medium** | **Caddy sets `X-Frame-Options DENY` globally**, including `/sign/*`. This **breaks the embedded-signing feature** (iframe), which relies on backend CSP `frame-ancestors`. Also missing: HSTS (`Strict-Transport-Security`) and a Content-Security-Policy. | `Caddyfile:28-33` vs `backend/src/middleware/embedSecurity.ts` |
| S5 | **Medium** | **Weak default secrets reachable in code + placeholder `.env.example`.** `DATABASE_PASSWORD` falls back to `'ezsign_password'` in code; `.env.example` ships `JWT_SECRET=your-jwt-secret-here-change-me`, `DATABASE_PASSWORD=password`. If a deployer copies `.env.example` without regenerating, prod runs on known secrets. (Good: JWT/API-key/webhook secrets *throw* if unset — no silent fallback there.) | `backend/src/server.ts:56`; `.env.example:28,45-54` |
| S6 | **Medium** | **Super-admin bootstrap undocumented.** Admin routes are gated by `requireAdmin` (`role === 'admin'`), but there is no documented/seeded way to mint the first admin. The Phase-2 admin dashboard is blocked on this, and manual DB edits are error-prone. | `backend/src/middleware/authorize.ts:33`; `routes/health.ts:57`, `emailLogRoutes.ts` |
| S7 | **Low** | Redis has no password by default (`REDIS_PASSWORD:-` empty). Not publicly exposed in prod compose, so defense-in-depth only. | `docker-compose.prod.yml:19,33` |

**Not yet audited (agents cut off) — schedule before launch:** file-upload MIME-vs-magic-byte validation & SVG-logo XSS, path traversal in storage keys/download, email-template HTML injection via user-controlled titles/signer-names/branding, public signing-token entropy/single-use/expiry, 2FA login-step bypass & backup-code hashing, registration user-enumeration/timing, team-invitation privilege escalation.

**Security positives (keep):** secrets required (no silent JWT fallback), token blacklist + session revocation enforced in `authenticate`, tiered rate limiters, widespread team-ownership checks, prod compose keeps DB/Redis/backend off public ports.

### 2. Features / correctness (half-wired & untracked)

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| F1 | **High** | **Audit Trail page is broken.** Frontend calls `GET /api/documents/:id/audit`; **no such route exists** (no `auditController`, PRD 0006 never got an HTTP surface). The page errors every open. | `frontend/src/pages/AuditTrail.tsx:19`; no match in `backend/src/routes/*` |
| F2 | **High** | **Webhooks Settings tab is a dead placeholder** despite a *fully built* backend (CRUD mounted at `/api/webhooks`, HMAC, retries). Query hardcoded `enabled:false` with a stale "not yet implemented" comment; "Create Webhook" button `disabled`; a "Coming Soon" card always shows. Working mutations are unreachable. | `frontend/src/pages/Settings.tsx:167-174,900,915`; backend `routes/webhooks.ts`, `server.ts:193` |
| F3 | **Medium** | **PRDs 0024–0029 (~90h) are untracked** — webhook mgmt UI, retry config, logs viewer, interactive API docs, rate-limit feedback, API versioning. They exist as PRDs but appear nowhere in `TASKS.md`, not even as pending. | `.planning/prd/0024–0029`, absent from `TASKS.md` |
| F4 | **Medium** | **No live Swagger/OpenAPI** despite CLAUDE.md advertising `/api/docs`. `Docs.tsx` is a static hand-written page, not a spec-backed explorer. | zero `swagger`/`openapi` hits in `backend/src` |
| F5 | **Low-Med** | **No 429 handling in the frontend.** The axios interceptor only handles 401; a rate-limited user gets a silent failure. | `frontend/src/api/client.ts:21-85` |
| F6 | **Low** | **Dead backend endpoints** (unshipped investment): entire `pdfRoutes.ts` (`/api/pdf` optimize/preview/regenerate/metrics — the UI thumbnail uses a *different* simpler endpoint), `POST .../assign-fields`, and the two `/validate` endpoints have zero frontend callers. | `documentRoutes.ts:93,105,148,155`; `pdfRoutes.ts`, `server.ts:195` |

**Claimed-complete but actually deferred (tracked nowhere):** conditional-visibility frontend (VisibilityBuilder + signing-view evaluation), pre-fill frontend display/editor, frontend cursor pagination, field-group & field-table unit tests. Backend for these exists; UI/tests do not.

### 3. Looks / UX (partial — deeper pass recommended, non-blocking)

| # | Impact | Finding | Evidence |
|---|--------|---------|----------|
| L1 | **Low** | **Dark mode is in good shape.** Only **12 hardcoded-color occurrences across 7 files** remain (`GroupPanel`, `FieldProperties`, `TableProperties`, `Docs`, `FieldPalette`, `TwoFactorSetup`, `GroupEditor`). A small cleanup, not a rewrite. | grep `bg-white\|text-gray-900\|…` |
| L2 | **Medium** | **`PublicNavbar` is missing on Privacy, Terms, Contact, VerifyEmail** — only on Landing/Login/Register/Docs. Inconsistent public shell; these are trust pages. | `PublicNavbar` referenced in 5 files only |
| L3 | **[VERIFY]** | Not audited (agent cut off): signing-page mobile ergonomics (touch targets, PDF pinch-zoom, signature pad on small screens), empty/loading states, per-route `document.title` and landing OG/meta tags, 404 page. These are the highest-leverage "does it feel professional" items for a public launch and should get a dedicated pass. | — |

### 4. SaaS launch gaps (beyond current roadmap)

Present in `SAAS_ROADMAP.md` Phase 2–4 but unscoped, plus topics the roadmap omits entirely:

- **Abuse/cost control:** free-tier usage limits + quota enforcement, upload size caps, **CAPTCHA on registration**, disposable-email blocking. *(Opening registration without these invites abuse.)*
- **Ops:** automated PostgreSQL backups + tested restore, uptime monitoring, error tracking (Sentry), log persistence. *(Backups are non-negotiable for a signing product.)*
- **Trust/legal (missing from roadmap):** ESIGN/UETA/eIDAS e-signature disclosure & consent capture, **POPIA/GDPR** data-export + account-deletion + retention policy, downloadable completion certificate/audit report, vulnerability-disclosure policy, incident-response note.
- **Email deliverability (missing):** SPF/DKIM/DMARC setup tasks + a real transactional provider (Resend/Postmark) — without these, verification/signing emails hit spam and the product silently fails.
- **Uploads:** virus scanning (ClamAV) of user-uploaded PDFs/images before storage/serving.
- **Monetization (Phase 3):** Stripe — defer until traction.

---

## Prioritized, sequenced roadmap

### Milestone A — Launch-blocking (must land before public registration opens)

Rationale: these are either exploitable by an anonymous/low-trust public user, cause visible breakage, or make the service unsafe/unrecoverable to run.

**The security portion of Milestone A is now fully enumerated in `.planning/tasks/tasks-0041-launch-security-hardening.md`** (5 Criticals inc. 1 fixed, 9 Highs, ~15 Mediums — SSRF/S1, the `ORDER BY`/S2 downgrade, secret hygiene/S5, Caddy/S4, query-token/S3 are all folded in there as SEC-* items). Do those first. The remaining non-security launch-blockers:

1. **tasks-0041 Criticals + Highs** — the security-hardening set (SEC-C2..C5, SEC-H1..H9). *(largest chunk; fan out per the task file's waves)*
2. **F1** Audit Trail: build the missing `auditController` + `GET /api/documents/:id/audit` route (backend service exists) — or hide the page. Signing products need an audit trail. *(~4h)*
3. **F2** Wire up the Webhooks Settings UI to the existing backend (remove the `enabled:false`/disabled/"coming soon" gating). *(~3h)*
4. **Backups** Automated daily `pg_dump` + documented, *tested* restore. *(~3h)*
5. **Email deliverability** Transactional provider + SPF/DKIM/DMARC (also unblocks SEC-H2's real-world impact). *(~3h)*
6. **Abuse basics** CAPTCHA on registration + confirm registration/upload rate limits (SEC-M7). *(~4h)*

### Milestone B — Launch-week (first days live, fast follow)

- **S6** Super-admin bootstrap (seed script/CLI) → then a minimal **admin dashboard** (users, docs, storage, ban abusive accounts).
- **Usage limits / free-tier quotas** with clear error messages + dashboard usage display.
- **Monitoring**: Sentry + uptime monitor + alerts (server down, disk full, error spikes).
- **F5** Frontend 429 handling with a friendly "slow down" toast.
- **L2** Add `PublicNavbar` to Privacy/Terms/Contact/VerifyEmail; **L1** finish the 12 dark-mode color fixes.
- **L3** Dedicated signing-page mobile/polish pass + per-route titles + landing OG/meta + 404 page.
- **Legal/trust**: e-signature disclosure + consent capture, downloadable completion certificate, POPIA/GDPR export+delete, vuln-disclosure policy.

### Milestone C — Post-launch / grow (only with traction)

- **F3/F4** Track & build PRDs 0024–0029 (webhook UI already covered by F2; retry config, logs viewer, live OpenAPI, API versioning).
- Deferred UI: conditional-visibility builder, pre-fill display/editor, frontend cursor pagination.
- **F6** Either surface `pdfRoutes` capabilities in the UI or delete the dead endpoints.
- Cloud storage (R2/S3 — PRD 0032 already built, just switch), virus scanning at scale.
- **Stripe monetization** (SaaS Phase 3): plans, checkout, webhooks, billing UI, dunning, VAT/tax.

---

## Blocking decisions (need your input — plan cannot fully sequence without these)

The 5 open questions at the end of `SAAS_ROADMAP.md` are still unresolved and gate real work:

1. **Hosting provider** — Hetzner (cheapest) / DigitalOcean (easiest) / Railway (zero-ops)?
2. **Domain name** — needed for Caddy, DNS, email SPF/DKIM/DMARC, CORS.
3. **Free-tier limits** — documents/month, signers/doc, storage cap (drives quota code).
4. **Open source?** — affects secret handling, CONTRIBUTING, and how public the repo/issues are.
5. **Email provider** — Resend vs Postmark vs SES (drives deliverability tasks).

Plus one I'm adding: **soft-launch vs open-launch** — a private beta (invite-only) lets us skip some Milestone-A abuse controls initially and de-risk; a fully open launch requires all of Milestone A up front.

---

## Plan-hygiene actions (also part of "update the plans")

- `.planning/TASKS.md` and `.planning/SAAS_ROADMAP.md` get a dated **status-correction** note pointing here and flagging the false "complete" claims (F1 audit trail, F2 webhooks UI, the deferred-but-claimed UI items).
- This file becomes the **active plan of record** for the launch push; per-milestone PRDs/task files get created as each milestone is approved to start.

## Risks & open questions

- **S2** exploitability is unconfirmed — must read the document/audit controllers to see if `sortBy` is runtime-validated. Fix regardless; it's cheap.
- The **cut-off security audit** (uploads, signing token, 2FA, invitations, email injection) could surface Critical items that reorder Milestone A. Do not open registration until it completes.
- Effort estimates are rough; Milestone A is ~1–1.5 focused weeks of work before it's safe to open the doors.
