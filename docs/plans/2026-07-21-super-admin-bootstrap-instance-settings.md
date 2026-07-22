# Super admin bootstrap + instance settings page

**Date:** 2026-07-21 · **Status:** implemented, all gates passed 2026-07-22 · **Resolves:** SEC-C6 (`.planning/tasks/tasks-0041-launch-security-hardening.md`)

## Goal

1. **First-boot admin bootstrap.** When no `role='admin'` user exists, create one with a generated one-time password printed once to stdout. The admin must change that password at first login before doing anything else — enforced server-side, not just in the UI.
2. **Instance settings page.** An admin-only Settings tab + API to configure operational settings (SMTP, from-address, app URL) stored in Postgres with secrets encrypted at rest, resolution order **DB → env → default**, so a fresh Drop deploy needs only `JWT_SECRET` + `DATABASE_URL` and everything else is configured from the UI.
3. **Deploy enablers** (prerequisites surfaced by review): the backend must accept Drop's injected `DATABASE_URL` (today it only reads discrete `DATABASE_HOST/PORT/...` vars) and run migrations at container start (Drop never runs them).

## Key decisions

- **Reuse the existing `admin` role** as the super admin. The DB constraint (`role IN ('admin','creator','signer')`), `requireAdmin` middleware, and admin routes already exist; instance-wide `admin` is already distinct from per-team roles. No new role.
- **Forced-change enforced via JWT claim** (`mustChangePassword`) checked in `authenticate` — free (claims-only middleware, no DB hit). The claim is stamped at **all three** token-minting sites that matter (login, verify-2fa, **refresh**) — refresh re-derives from DB, closing the bypass all three critics flagged.
- **`settingsService` is stateless** — queries per call, like `BrandingService`. No cache, no version counter (a per-send DB read is noise next to `sendMail`; per-instance caches would go stale in workers).
- **Email config resolved per send** via an injected async config provider — not a rebuilt-transporter singleton. URL building moves to pure helpers so nothing captures `baseUrl` at construction.
- **`app.url` stays UI-configurable** (the point of the feature) despite the security critic preferring env-only — mitigations below in Critiques.
- **Bootstrap password**: printed to stdout only when generated; `ADMIN_PASSWORD` env overrides generation (nothing printed). `ADMIN_EMAIL` env sets the address (default `admin@ezsign.local`).

## File-level changes (checklist = commit units)

### Item 1 — Deploy enablers
- [x] `backend/src/server.ts` (~51-60): pool config prefers `DATABASE_URL` (`connectionString` + SSL opt) over discrete vars.
- [x] `backend/package.json` + `backend/Dockerfile` CMD: production start runs `npm run migrate` before `node dist/server.js`.
- [x] `.env.example`: document `DATABASE_URL` alternative.

### Item 2 — Schema + user plumbing
- [x] New migration: `users.must_change_password boolean NOT NULL DEFAULT false`; new `instance_settings` table (`key varchar(100) PK`, `value text NOT NULL`, `is_secret boolean NOT NULL DEFAULT false`, `updated_by uuid REFERENCES users(id) ON DELETE SET NULL`, `updated_at timestamp DEFAULT CURRENT_TIMESTAMP`). Both `up` and `down`.
- [x] `backend/src/models/User.ts`: `UserData` interface, constructor, `toJSON()` gain `must_change_password`.
- [x] `backend/src/services/userService.ts`: add the column to **all four** hardcoded column lists (createUser RETURNING :21-24, findById :42-45, findByEmail :64-67, updateUser RETURNING :114-117); new `clearMustChangePassword(userId)`; `createUser` accepts the flag.

### Item 3 — Admin bootstrap
- [x] New `backend/src/services/adminBootstrapService.ts` — `ensureAdminExists(pool)`:
  - Advisory lock (`pg_advisory_xact_lock`) inside a transaction; count `role='admin'`; if 0 → check target email is free; if taken by a non-admin, **refuse with a clear log line** (no crash loop).
  - Password: `ADMIN_PASSWORD` env if set, else 20-char `crypto.randomBytes`-based; hash via `User.hashPassword` (argon2); insert with `email_verified=true`, `must_change_password=true`.
  - Print boxed credentials to stdout **only when generated**, via `console.log` (bypasses file transports).
  - Tolerant of missing table/column (Postgres `42P01`/`42703` → log "run migrations" warning, skip) so old DBs don't crash the boot.
- [x] `backend/src/server.ts`: fire-and-forget call after the DB-connect test with a mandatory `.catch()` (boot is sync top-level; idempotent lock makes ordering irrelevant — no async-main restructure).

### Item 4 — Auth: claim, enforcement, change-password
- [x] `backend/src/services/tokenService.ts`: `JwtPayload` gains optional `mustChangePassword`.
- [x] `backend/src/controllers/authController.ts`:
  - login (:296) and verify2fa (:384): stamp claim from DB flag; response gains top-level `mustChangePassword`.
  - **refresh (:629-683)**: re-load user (already does `findById`), stamp claim from DB into the new access token; **add `isBlacklisted`/`isUserSessionRevoked` checks on the presented refresh token** (closes the standing revocation gap the security critic found).
  - changePassword (:731-833): clear `must_change_password` **before** minting the fresh pair; mint with claim explicitly false (not from the stale in-memory user); wrap `blacklistAllUserTokens` in try/catch so Redis-down no longer 500s after the password already changed. (It already returns fresh tokens — no shape change.)
- [x] `backend/src/middleware/auth.ts` (`authenticate`): if claim set and `req.baseUrl + req.path` (exact match, query stripped) not in `['/api/auth/change-password', '/api/auth/me']` → `403 { code: 'PASSWORD_CHANGE_REQUIRED' }`. (No `/logout` — it's unauthenticated.) Also: ignore `?token=` query auth for paths starting `/api/admin/`.
- [x] `backend/src/middleware/apiKeyAuth.ts`: `createApiKeyAuth`/`createDualAuth` reject users with `must_change_password` (future-proofing; unwired in prod today).

### Item 5 — Settings service + crypto + admin API
- [x] New `backend/src/utils/secretsCrypto.ts`: AES-256-GCM; fresh random 12-byte IV per encryption; storage format `iv:authTag:ciphertext` (base64); key = HKDF-SHA256 over `SETTINGS_ENCRYPTION_KEY` (fallback `JWT_SECRET`, coupling documented) with fixed salt/info → 32 bytes.
- [x] New `backend/src/services/settingsService.ts` (stateless, takes Pool): `getAll()` (secrets → `{ isSet }`, per-key source `db|env|default`), `set(entries, updatedBy)`, `getEmailConfig()`, `getAppUrl()`. Env fallback chains: `email.from` ← `EMAIL_FROM || EMAIL_FROM_ADDRESS || EMAIL_SMTP_FROM` (consolidates the three divergent names); smtp keys ← `EMAIL_SMTP_*`; `app.url` ← `APP_URL || BASE_URL`. Zod-validated typed coercion per key (KV stays stringly only at the storage layer). **Changing `smtp.host`/`port`/`secure` clears the stored `smtp.pass`** (forces re-entry — blocks the host-swap credential-exfiltration attack). `app.url` must be `https://` (plain `http` allowed only for localhost). Every write → `auditService` event (key, source IP, updated_by; never values of secrets).
- [x] New `backend/src/routes/adminSettingsRoutes.ts` + controller: `GET /api/admin/settings`, `PUT /api/admin/settings`, `POST /api/admin/settings/test-email` (sends to the calling admin's own address; returns sanitized errors only — no raw SMTP connection text). All behind `authenticate` + `requireAdmin`. Zod schemas in `backend/src/validators/`. Secret update semantics: omitted/empty = unchanged, explicit `null` = clear. Mount in `server.ts`.

### Item 6 — Email refactor (per-send config)
- [x] `backend/src/services/emailService.ts`: accept an async config provider (`() => Promise<EmailConfig & { baseUrl }>`); resolve config + build transporter per send; keep the legacy constructor for tests. New public method replacing `invitationController.ts:610-611`'s `(this.emailService as any).transporter` reach.
- [x] New `backend/src/utils/urlBuilder.ts`: pure `buildSigningUrl(baseUrl, token)` / `buildDownloadUrl(...)`; `generateSigningUrl`/`generateDownloadUrl` callers (signingController :215/:228/:776/:831, signerController :421, reminderWorker :153) fetch `baseUrl` via `settingsService.getAppUrl()` and use the builders.
- [x] Replace the **7** env-construction sites with the provider-backed instance: `routes/documentRoutes.ts:56`, `routes/signingRoutes.ts:39,:81`, `routes/auth.ts:27`, `routes/invitations.ts:41`, `workers/reminderWorker.ts:60`, `workers/scheduledSendWorker.ts:38`. All sites now pass `emailLogService` (flattens the current inconsistency — intentional behavior change: all email gets logged).
- [x] Replace remaining direct `APP_URL` reads: `controllers/signerController.ts:61`, `controllers/signingController.ts:69`, `controllers/invitationController.ts:137,:475`.

### Item 7 — Frontend: forced password change
- [x] `frontend/src/types/index.ts`: `role: 'admin' | 'creator' | 'signer'` (fixes real drift), `must_change_password` on User, `mustChangePassword` on AuthResponse.
- [x] `frontend/src/contexts/AuthContext.tsx`: `verify2fa` returns the response (currently `void`); expose a `refreshUser()`.
- [x] `frontend/src/pages/Login.tsx`: all three success handlers (:76/:95/:115) branch to `/change-password-required` when flagged.
- [x] New `frontend/src/pages/ForcePasswordChange.tsx`: current + new password; on success **store the returned token pair**, refresh user state, then navigate `/`. Route registered in `App.tsx` inside ProtectedRoute.
- [x] `frontend/src/components/ProtectedRoute.tsx`: while `user.must_change_password`, redirect to `/change-password-required` — **except when already on it** (loop guard).
- [x] `frontend/src/pages/Settings.tsx` change-password mutation (:221-236): store the returned fresh tokens instead of discarding them.

### Item 8 — Frontend: Instance settings tab
- [x] `frontend/src/pages/Settings.tsx`: 8th tab "Instance", rendered only when `user.role === 'admin'`; content = new component.
- [x] New `frontend/src/components/InstanceSettings.tsx` (BrandingSettings pattern: plain state, toasts): SMTP host/port/secure/user, password write-only ("•••• set" placeholder; cleared automatically when host/port/secure change, with explanatory note), from-address, app URL; per-field source badge (DB/env/default); "Send test email" button; read-only info card (storage path, Redis/DB status from health).
- [x] New `frontend/src/services/instanceSettingsService.ts` + `frontend/src/hooks/useInstanceSettings.ts`.

### Item 9 — Docs + closure
- [x] `README.md` + `.env.example`: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SETTINGS_ENCRYPTION_KEY`, settings precedence, bootstrap-password-in-logs note, from-address env consolidation, migrations-at-start.
- [x] Tick SEC-C6 in `.planning/tasks/tasks-0041-launch-security-hardening.md` with a note on the decision taken.

## Tests (Gate 3 surface)

- Bootstrap: creates admin when none; no-op when one exists; refuses on email collision with non-admin; missing-table tolerance; `ADMIN_PASSWORD` path prints nothing; password never stored/logged in plaintext.
- Auth: claim present in login/verify2fa/refresh tokens; **flagged refresh token cannot mint a claim-free access token**; revoked/blacklisted refresh token rejected; 403 on a normal route + allowed on `/api/auth/change-password` (exact-path tests); change-password clears flag, returns non-flagged tokens, survives Redis-down.
- Settings: DB→env→default per key incl. the 3-name `from` chain; encrypt/decrypt roundtrip; GET never contains secret values; host/port/secure change clears stored pass; `app.url` scheme validation; requireAdmin on all three endpoints; audit event on write.
- Email: provider-mode send uses current DB config (change setting → next send uses it, no restart); workers pick up changes; invitation path no longer touches private fields.
- Frontend: forced-change redirect + loop guard + post-change recovery; Instance tab hidden for non-admin; password-field clearing UX.

## Risks & open questions

- **Redis absent in prod (Drop)**: token blacklist remains best-effort; enforcement holds anyway because it's claim-based and refresh re-derives from DB. Old *access* tokens post-change stay valid ≤15m. Accepted; documented.
- **`app.url` is a sensitive knob** (see Critiques): compromise of an admin session can redirect signing links. Mitigations: https-only validation, audit trail, password-change does not auto-clear it (visible in UI). Residual risk accepted for self-hosted v1.
- **JWT_SECRET-derived fallback encryption key** couples two secrets; production should set `SETTINGS_ENCRYPTION_KEY`. Rotating the effective key orphans stored secrets → UI shows them unset; re-enter.
- **Multi-instance deploys**: statelessness removes cache staleness entirely; the advisory lock handles concurrent bootstrap.
- **Migration sequencing on existing deploys**: new code names the new column, so the migrate-then-start ordering in Item 1 is what makes upgrades safe — Item 1 lands first.

## Agent critiques considered

- **Security critic** (10 findings): CRITICAL refresh bypass → adopted (Item 4, + refresh revocation checks). HIGH SMTP host-swap exfiltration → adopted (Item 5 auto-clear). HIGH `app.url` env-only recommendation → **partially rejected**: UI-configurability is the feature's purpose; adopted its fallback mitigations (https-only, audit) instead. MEDIUMs (path allowlist, API-key path, crypto spec, bootstrap collisions, password-in-logs) → all adopted (`ADMIN_PASSWORD` override chosen over TTY detection — Drop has no TTY). LOWs (stale-user token mint, test-email SSRF error leakage, query-token on admin routes) → adopted.
- **Architecture critic** (8 findings): refresh bypass (dup) → adopted. Stateless settingsService copying the BrandingService precedent → adopted, cache machinery dropped. Email seam re-cut (provider + pure URL builders + public method for invitationController + emailLogService flattening) → adopted. server.ts fire-and-forget with `.catch()` over async-main restructure → adopted (smaller diff, idempotency makes ordering moot). From-name consolidation, allowlist path matching → adopted. KV table kept with typed zod validation layer. Instance tab stays in Settings.tsx (matches existing structure; growth concern noted, not blocking).
- **Correctness auditor** (10 findings, 7 requiring adjustment): all adopted — site count fixed (signingRoutes ×2), change-password delta corrected (already returns tokens; real fixes are flag-clear ordering + Redis try/catch + frontend storing tokens), userService 4 column lists + interface plumbing added, `verify2fa` signature change, redirect loop guard + post-change user refresh, boot-order reality, migrations-at-boot + `DATABASE_URL` mismatch promoted to Item 1 (prerequisite).

## Implementation record (2026-07-22)

All items implemented; four gates passed (conformance, adversarial diff review, full test pass, runtime verification against a scratch stack — 18/18 API checks, 5/5 UI checks, bootstrap idempotency observed).

Deviations from the plan as written, all reviewed and accepted:
- `node-pg-migrate` moved from devDependencies to dependencies (production image prunes dev deps; migrate-at-start would otherwise fail).
- Settings audit: `audit_events.event_type` CHECK extended with `'settings.updated'` (document_id nullable) — written in-transaction with keys-only metadata + source IP; `auditService` itself is dead code and was not used.
- Gate 2 additions beyond the plan: `scripts/start-prod.js` derives DATABASE_URL from discrete vars (compose deploys); smtp.pass transport-change clear writes an encrypted-empty tombstone (blocks env-fallback resurrection); `/api/admin` query-token guard made case-insensitive; DB TLS verifies by default (`DATABASE_CA`/`DATABASE_SSL_REJECT_UNAUTHORIZED`); unused `tokenService.refreshAccessToken` deleted (latent claim-stripping bypass); sockets reject flagged users; `getEmailConfig` batched to one query.
- Gate 3 found + fixed: `decryptSecret` rejected zero-length ciphertext, breaking the tombstone roundtrip (`secretsCrypto.ts`).
- Test coverage gaps consciously left: verify2fa claim-stamping (same code path as login), apiKeyAuth rejection branch, socket rejection, start-prod.js.
