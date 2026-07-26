# Registration Gate + Milestone A Wave 1 Security

**Date:** 2026-07-25
**Status:** DRAFT — awaiting approval before any production code
**Parent plan:** `docs/plans/2026-07-05-launch-readiness-assessment.md`
**Supersedes:** `docs/plans/2026-07-08-milestone-a-wave1-implementation.md` (drafted, never implemented)
**Security source:** `.planning/tasks/tasks-0041-launch-security-hardening.md`

---

## Goal

`ezsign.dropkit.sh` is live and publicly reachable with `POST /api/auth/register` ungated, while four criticals and nine highs remain open. Close what can be closed quickly, then land Wave 1.

### What closing registration actually contains — corrected

The first draft claimed closing registration "removes the untrusted actor SEC-C2 requires and reduces C3–C5 to people you deliberately invited." The adversarial panel falsified both halves. The accurate claim:

- **It contains SEC-C2's _write_ half only.** Poisoning `team_branding.logo_path` needs an authenticated team owner. But the **read** half — `GET /api/branding/logo/:teamId` — is on the unauthenticated router (`brandingRoutes.ts:66`). If any row was already poisoned during the open window, an outsider with **no session at all** still reads arbitrary files. Item 3 cannot be deferred behind item 1.
- **It does nothing for SEC-C3/C4/C5.** The threat actor for signature forgery *is* an invited signer — on a signing platform the counterparty is the adversary by construction. Tokens never expire, aren't single-use, and are emailed (so forwardable). The completion JOIN (`signingController.ts:530-534`) has no signer scoping, so a forged row is stamped onto the PDF. Worse, the `UNIQUE(field_id)` constraint means pre-claiming another signer's field permanently DoSes their legitimate submission.
- **It is prospective only.** It never touches `/login` or `/refresh`. Any account created during the open window keeps a rolling session forever. "Only the admin exists" is a claim about the live `users` table that must be **verified and revoked**, not assumed.
- **It does not touch two unauthenticated issues the panel found that are not in tasks-0041 at all** — see Item 1.

So: registration closure is worth shipping today because it stops the bleeding on new principals, but it is not a containment boundary that justifies deferring anything.

Non-goals: Wave 2 highs (H2–H8 except where noted), F1/F2 feature repair, backups, email deliverability, domain/DNS.

---

## Verified starting state (2026-07-25)

Read in the current tree. The Redis removal (`facbdbd`, 2026-07-23) invalidated line numbers in older docs. Every citation below was confirmed by at least two independent readers.

- `authController.register` (`authController.ts:79-191`) — no gate; role correctly hardcoded (SEC-C1 holds). `findByEmail` 409-vs-other differential at `:112-119` is a live enumeration oracle (SEC-M4).
- `app.set('trust proxy', ...)` — **not set anywhere**. `docker-compose.yml:30-31` publishes the backend directly on `3001`, and `frontend/nginx.conf:34-42` has the entire reverse-proxy block **commented out** — so the self-host path has no proxy in front of it.
- All six limiters use raw `req.ip`; `ipKeyGenerator` not imported; express-rate-limit **8.1.0**.
- `authLimiter`, `uploadLimiter`, `signingLimiter` are dead code. `authLimiter` also sets `skipSuccessfulRequests: true` (`rateLimiter.ts:195`) and shares one key across login/register/forgot/reset (`:197`).
- `apiLimiter` is mounted at `server.ts:171`, **before** `authenticate` and **before** CORS (`:174-196`). Two consequences: the `user:<id>` tier (`:67-70,88-92`) is unreachable dead code and every JWT user is bucketed `anon:`; and 429/413 responses reach the browser without CORS headers.
- `shouldSkipRateLimit:119` blanket-skips `/api/signing/`; feeds `apiLimiter` only.
- **Two storage roots.** `FILE_STORAGE_PATH`: `config/storage.ts:46`, `adminSettingsController.ts:14`, `signingController.ts:742`, `pdfService.ts:285`, `healthService.ts:60`. `STORAGE_PATH`: `documentController.ts:36`, `pdfController.ts:23`, `cleanupService.ts:38`, `pdfWorker.ts:42`.
- **`LocalStorageAdapter` is not the chokepoint.** Bypassing it with raw `path.join` + `fs`: `signingController.ts:742-746` (writes the signed PDF, inside a `catch` that swallows and completes anyway), `pdfService.ts:282-287`, `pdfController.ts:75,118,183,248`, `cleanupService.ts:269,300`, `pdfWorker.ts:32,42-51`, `documentController.ts:87`.
- `LocalStorageAdapter` has a **ninth** join site, `getMetadataPath:225-230`, reached from `delete:110`, `saveMetadata:239`, `readMetadata:249`. `exists():129-138` and `delete():103-124` are soft-fail probes that return `false` rather than throwing.
- `submitSignature` (`signingController.ts:380-865`) checks only `signer.status`. The GET path (`:283-374`) checks signer status, doc exists, `status !== 'pending'`, sequential order, and scopes fields by `document_id + signer_email` — but **not** `isExpired()`. `downloadDocumentByToken` (`:871-928`) checks **nothing** — a signing link is a permanent document-read credential.
- Fields associate by **`fields.signer_email`** (nullable, case-sensitive) — migration `1759854413924:59-63`.
- `Signature.validateSignatureData()` (`Signature.ts:108-137`) inspects `signature_data` **only** in the `drawn`/`uploaded` branch; the `typed` branch never looks at it. No size cap anywhere. `signatures` array has no `.max()`.
- `SignaturePad.tsx:100-113` — uploaded signature images get **no size check and no downscale**. Drawn/typed are fixed at 400×200 PNG (tens of KB), so only uploads are at risk.
- One signing session = **~5-6 anonymous requests** (`GET /signing/:token`, `GET /:token/download`, `POST /:token/sign`, plus branding/logo/config). No range requests, no polling.
- `webhookController.isPrivateIp:475-496` is hostname-string-only. `webhookDeliveryService.ts:71-76` uses axios with `maxRedirects: 0`; **`webhookService.ts:170-188` is a second delivery path with default `maxRedirects: 5`** (currently callerless). Response bodies are truncated to 1000 chars, **persisted, and surfaced to the webhook owner** — so this SSRF is a read primitive, not blind.
- `settingsService.set()` with `null` **DELETEs the row** (`:337-338,386-388`), falling through to `envFallback` (`:289-294`). Boolean env coercion is `raw === 'true'` (`:497`) — `1`/`TRUE`/`yes` silently become `false`.
- `middleware/validation.ts` `validate()` has **zero call sites**. The entire `validators/` tree is dead code.
- **`POST /api/util/test-validation`** (`utilityRoutes.ts:70-95`, public, `server.ts:221`) compiles an attacker-supplied regex and runs `.test()` on attacker-supplied input — no timeout, no length cap, 50 MB body. Not in tasks-0041.
- `apiLimiter`'s key generator reads the raw `x-api-key` header (`rateLimiter.ts:58-64`) and grants a 1000-req tier from it (`:84-86`) **before any authentication**. Not in tasks-0041.
- Team-invite accept (`invitations.ts:63`) requires `authenticate` **and** a pre-existing user row whose email matches (`invitationController.ts:281-287,311-319`); `invitationService.accept` never creates a user. `AcceptInvitation.tsx:32-36` sends unauthenticated invitees to `/login`. **With registration closed there is no way to onboard anyone.**

### Three corrections to the inherited plan

1. **`path.join` is not containment.** `path.join('/base','../../etc/passwd')` → `/etc/passwd`.
2. **Wiring `submitSignatureSchema` as-is is a silent no-op** — `validate()` expects `{body, params}`; the schemas are `z.object({params, body})`. Since `validate()` has no call sites anywhere, this is dead code, not a mis-wired route.
3. **Wired correctly it would strip** `text_value`/`font_family`, breaking typed signatures. Confirmed: every non-signature field type (radio, text, date, checkbox, dropdown) submits `signature_type: 'typed'`.

---

## Approach

Seven items. **Item 0 gates everything.** Item 6 is explicitly held back until a runtime fact is confirmed.

### Item 0 — Live-instance audit  *(queries only, no code, run first)*

Containment cannot be asserted without this. Against the live DB:

```sql
SELECT id, email, role, created_at FROM users ORDER BY created_at;          -- any non-admin? incl. admin@ezsign.local squatting
SELECT team_id, logo_path, favicon_path FROM team_branding
  WHERE logo_path  LIKE '%..%' OR favicon_path  LIKE '%..%'
     OR logo_path  LIKE '/%'  OR favicon_path  LIKE '/%';                    -- pre-planted traversal
SELECT count(*) FROM documents WHERE status='pending' AND expires_at < now();-- item 5.5 blast radius
SELECT id, file_path FROM documents UNION ALL SELECT id, file_path FROM templates; -- keys that will meet the guard
SELECT id, url FROM webhooks;                                                -- private URLs that will start failing
```

For every unexpected account: delete it, or `blacklistAllUserTokens(userId)` — a surviving refresh token is a session the 403 never sees. **Outcome decides whether items 3/5 can be sequenced or must ship together.**

### Item 1 — Anyone-on-the-internet fixes  ✅ **COMPLETE — all four gates passed 2026-07-25** (staged, not committed, per repo policy)

**Gate 4 runtime evidence** (host backend against dockerised Postgres, `RATE_LIMIT_MAX_ANONYMOUS` forced low, then torn down):

| Check | Result |
|---|---|
| `POST /api/util/test-validation` with `(a\|a)+$` payload | **404**, returned instantly (previously wedged the process) |
| `POST /api/util/validate-regex` unauthenticated | **401** |
| `GET /api/util/validation-patterns` | **200** — still public, as intended |
| Anonymous bucket at `MAX_ANONYMOUS=5` | 200, 200, then **429** |
| **Rotating spoofed `X-API-Key`** | **429** — no fresh bucket. Bypass closed. |
| 429 response, allowed origin | carries `Access-Control-Allow-Origin`, `Allow-Credentials`, `Vary: Origin` |
| 429 response, disallowed origin | **zero** CORS headers |
| 60 MB body | **413 `PAYLOAD_TOO_LARGE`** (was `INTERNAL_ERROR`) |
| Guard accept/reject, 7 patterns incl. the `currency` preset | **7/7** — presets accepted, `(a+)+$` / `(?:a+)+$` / `([a-z]+)+$` rejected |

Also resolved at runtime: `ERR_ERL_KEY_GEN_IPV6` **is** emitted by express-rate-limit v8 at startup, but is logged and non-fatal — the plan previously recorded this claim as unverified and wrong. Item 6's justification remains the IPv6 /64 bypass regardless.

*(original scope below)*

Three unauthenticated issues, none contained by the gate. Two are new (not in tasks-0041) and are the reason this item exists at all.

1. **ReDoS.** `POST /api/util/test-validation` + `/validate-regex`: require `authenticate`, cap `value` ≤ 512 chars and `customRegex` ≤ 256, reject nested quantifiers. A single crafted request currently wedges the whole Node process, taking signing down with it.
2. **`X-API-Key` rate-limit bypass.** Stop honouring the unvalidated header in `getKeyGenerator`/`getMaxRequests`; key on IP until an authenticated `req.apiKey?.id` exists. Today any client rotates the header for a fresh bucket — a total `apiLimiter` bypass that would silently void item 6.
3. **CORS + 413 correctness.** Move the CORS middleware above `apiLimiter` so 429/413 responses carry `Access-Control-Allow-Origin`; add an `err.type === 'entity.too.large'` → 413 branch to `errorHandler` (currently a bare 500). Without this the Gate-4 runtime checks read the wrong signal.

### Item 2 — Registration gate  ✅ **COMPLETE — all four gates passed 2026-07-25** (staged, not committed)

**Gate 3:** backend 624 unit tests, frontend 193, all revert-verified (each new test confirmed to fail against the pre-fix code, then restored).

**Test-infrastructure finding, fixed:** `npm run test:integration` was `jest --testPathIgnorePatterns='/node_modules/' src/__tests__/integration/`. Jest parsed the positional path as a *second ignore pattern*, so the script silently ran the default unit suite and reported success — **the seven integration files had never executed under either script.** Corrected to `--testPathPatterns`. Running them then exposed two pre-existing defects, invisible until now:

1. `document-upload.test.ts` inserted `role: 'user'`, which the schema's `role IN ('admin','creator','signer')` check rejects — 16 failures. Fixed (test-only, `'user'` → `'creator'`).
2. **Open product bug, not fixed (out of scope):** `documentService.createDocument` accepts a whitespace-only `title` (`'   '`) and persists it; the test correctly expects rejection. This is a document-validation defect unrelated to the registration gate — recorded here so it isn't lost.

Integration suite now: **192/193 passing**, the one failure being defect 2 above.

**Gate 4 runtime evidence** — 24 checks against a live backend over dockerised Postgres, then torn down. Invitation tokens were pulled from the DB, since the API correctly never returns them.

| Check | Result |
|---|---|
| `POST /api/auth/register`, gate closed (default) | **403** |
| `GET /api/branding/default` exposes the flag unauthenticated | `registrationEnabled: false` |
| Admin `PUT registration.enabled=true` → register | **200** then **201** |
| Clear the toggle (`value: null`, deletes the row) → register | **403** — reverts to closed, no env reopen |
| Re-register the same address in a **different case** | **409**, not a second account |
| Login typing UPPERCASE against a lowercase-stored account | **200** |
| Invited email, no token | **403** |
| **Real token, different email** | **403** — no bypass |
| Invited email (UPPERCASE) + real token | **201** |
| Same token reused for the same address | **409** — `SELECT count(*)` confirms exactly **1** account |
| Token reused for a *new* address | **403** |
| Expired token / cancelled token | **403** / **403** |
| Audit endpoint | returns rows; **no** `password_hash`/2FA in the payload |
| revoke-sessions: valid / nonexistent uuid / malformed id / no admin token | **200** / **404** / **400** / **401** |

*(scope below)*

1. **`registration.enabled`** in `SETTINGS_REGISTRY`: `type: 'boolean'`, `isSecret: false`, **no `envFallback`**, `defaultValue: false`. Omitting the env fallback is deliberate — with one, clearing the toggle in the admin UI deletes the row and *reopens registration* via the env var. Fail-open on the one flag whose purpose is to fail closed. (The `smtp.pass` tombstone at `:395-400` exists to solve exactly this; DB→default is simpler.)
2. **Enforce in `register` as the literal first statement** — before body validation, before `findByEmail`. Placing it after the lookup preserves the 409-vs-403 enumeration oracle.
3. **Invitation-scoped exemption.** Allow registration when the request carries a valid, unexpired, unconsumed `team_invitations` token whose email matches the submitted address. Without this the gate makes team invitations — a shipped feature with routes, emails, controller and page — completely inert, and the operator's only recourse is reopening registration globally.
4. Fix boolean env coercion in `coerceFromStorage` to accept `['1','true','yes','on']` case-insensitively and reject anything else loudly (also fixes `smtp.secure`).

> **Design decision — default closed.** Secure-by-default and it means the next deploy closes registration without depending on an env var. Cost: a fresh self-hosted install must open it once from Settings → Instance; admin bootstrap guarantees an admin exists to do so. **Confirm at the approval stop** — flipping to `true` is a one-word change.

**5. Account audit + revoke.** *(Added mid-implementation — see the scope-deviation note below.)* An admin-only endpoint listing non-admin accounts and revoking a user's sessions via `blacklistAllUserTokens`, plus README guidance and the raw SQL. This is the code half of Item 0: the gate is prospective and never touches `/login` or `/refresh`, so an account created during the open window keeps a rolling session that only revocation closes.

**6. Frontend gate and invitation plumbing.** *(Scope addition — see below.)* Admin toggle in `InstanceSettings.tsx`; `registrationEnabled` folded into the existing unauthenticated `GET /api/branding/default` rather than a new `/api/config`; signup links hidden and `Register.tsx` given a closed state; and — the piece three critics flagged as missing — `AcceptInvitation.tsx` → `/register?invitationToken=…` plus `Register.tsx` forwarding the token, without which the invitation exemption is unreachable from any real client and closed-by-default dead-ends onboarding entirely.

> **Scope deviations on Item 2, recorded rather than absorbed.** The plan approved Item 2 as three files (`settingsService.ts`, `authController.ts`, `invitationService.ts`) with four sub-items. Two additions were made during implementation, both at my direction, neither re-approved before the work started:
>
> 1. **Sub-item 5 (admin audit surface)** — a new controller, route, `server.ts` mount, `UserService` method and README section. Justification: the advisor pointed out Item 0's SQL requires live-DB access I don't have, so leaving it as a prerequisite would block the plan indefinitely; converting it to shipped code removes the block. The cost is that the gate which approved Item 2 never reviewed this surface's authz, output shape, or pagination — so it was put through the same Gate 2 panel afterwards, which found the false-success bug in `revoke-sessions`.
> 2. **Sub-item 6 (frontend)** — the plan's frontend row covered gate *display* only and omitted `AcceptInvitation.tsx`, so as scoped the follow-up would never have made the exemption reachable. Shipping closed-by-default with an unreachable exemption is strictly worse than not shipping the gate.
>
> The `architecture-critic` flagged deviation 1 as a process failure under CLAUDE.md's "surface it — don't improvise". That is a fair call: it was surfaced to the user in prose but the plan file was not amended until now.

### Item 3 — SEC-C2: storage path containment  ✅ **COMPLETE — all four gates passed 2026-07-26** (Gate 3 ran alongside Item 4's — see that item for the shared results and the two test-quality defects it found)

**Gate 4 runtime evidence** — a canary file was written *outside* the storage root, `logo_path` poisoned directly in the DB (simulating a row planted during the open-registration window), and the **unauthenticated** `GET /api/branding/logo/:teamId` hit for each shape. Torn down afterwards; canary removed.

| Poisoned `logo_path` | Result |
|---|---|
| Client-supplied `logo_path` in the `PUT` body | **ignored** — column stays `null` (write half closed) |
| `../../SECRET-OUTSIDE-ROOT.txt` / `../../../…` | **404**, canary not in the response body |
| `/etc/passwd` | **404** |
| `C:\Windows\System32\drivers\etc\hosts` | **404** |
| **`documents/someone-elses.pdf`** (in-root, wrong subtree) | **404** — the case root containment alone did *not* stop |
| `temp/whatever.pdf` | **404** |
| Another team's legitimate `branding/<other-uuid>/logo.png` | **404** |
| Prefix lookalike `branding/<teamId>-evil/logo.png` | **404** |
| The team's own `branding/<teamId>/logo.png` | **200 `image/png`** — legitimate serving intact |

12/12. Full backend suite: **41 suites, 668 passing, 1 pre-existing skip.**

> **Gate 3 caveat — now resolved.** This item originally shipped without a dedicated test pass; it received one on 2026-07-26 alongside Item 4, which revert-verified `storagePaths`' drive/UNC and `..`-escape logic, `config/storage`'s precedence, `LocalStorageAdapter`'s `read()` guard / `exists()` soft-fail / canonical `save()` return, `brandingController`'s `getLogo` prefix check and `updateBranding` pick-list, and both `templateService` call sites.

*(scope below)*

The panel killed the "adapter is the chokepoint" premise. Containment has to be a shared utility, and it needs a single root to be defined against.

1. **`config/storage.ts` exports `getStorageRoot()`**; `STORAGE_PATH` accepted as a deprecated alias of `FILE_STORAGE_PATH`. Every module imports it. Prerequisite — a guard anchored on one root doesn't constrain modules resolving a different one.
2. **New `utils/storagePaths.ts` → `resolveWithinStorage(base, key)`.** Order matters: **first reject** any key where `path.isAbsolute(key)` or `/^[a-zA-Z]:/` matches (win32 `C:foo`, UNC and `\\?\` prefixes survive a naive separator strip and `path.resolve` would treat them as rooted); **then** normalize leading separators (`key.replace(/^[\\/]+/, '')`) to preserve `path.join`'s current tolerance; **then** `path.resolve` → `path.relative` → reject if empty, `..`-prefixed, or absolute. **Do not add case-folding or manual `path.sep` logic** — `path.relative` handles both platforms, and a `startsWith` prefix check reintroduces the `/base` vs `/basement` bypass. Tests must cover `C:foo` and `\\?\C:\x` explicitly.
3. Consume it in `LocalStorageAdapter` at **method entry** for all public methods (guarding the fully composed `relativePath` in `save()`, after `options.directory` is joined — not the raw filename) **and inside `getMetadataPath`**.
4. **Semantics split:** `read`/`save`/`copy`/`move`/`getMetadata` throw; **`exists()` and `delete()` return `false`** (log at `warn`). They are soft-fail probes today — `pdfController.ts:64,237` and `signingController.ts:907` depend on the boolean contract, and throwing turns a clean 404 into a 500 on the public download path.
5. Consume it at the eight bypass sites too, or route them through `StorageService`. `signingController.ts:742-746` is the priority — it writes an attacker-influenceable path and swallows the error.
6. `brandingController.updateBranding` — pick-list `req.body`, dropping `logo_path`/`favicon_path`. Confirmed safe: the frontend never sends them, and `uploadLogo` sets them server-side.
7. Tests: traversal rejected (`../../../../etc/passwd`, `..\\..\\secrets`, absolute, `documents/../../etc/passwd`); ordinary nested keys accepted; leading-slash keys still accepted; `exists`/`delete` return `false` rather than throwing.

### Item 4 — SEC-C3/C4/C5: signing integrity  ✅ **COMPLETE — all four gates passed 2026-07-26**

**Gate 3** (shared with Item 3): backend **44 suites / 735 passing**, frontend 201, integration **192/193** (the one failure is the pre-existing whitespace-title defect). A new `signerService.test.ts` (16 tests) closed the file's total absence of coverage despite it receiving the SEC-H3 fix. ~14 production edits were used to revert-verify detection across both surfaces, each restored by editing back — never via git.

Two test-quality defects found and fixed by that pass:
- `signingContextService.test.ts`'s cross-document forgery test **passed with `AND document_id = $2 AND signer_email = $3` stripped from the production SQL** — with a fully mocked `pool.query`, asserting only the return value proves nothing. Now paired with an assertion on the query text itself.
- The four mock `clientQuery` dispatchers in `signingController.test.ts` matched on `startsWith()` of trimmed SQL and threw on any miss, so harmless reformatting broke them. Normalized; the one narrow `.toContain()` on the security predicate was kept, because there the SQL text *is* the thing under test.

**`npm run test:integration` fixed a second time.** Item 2 fixed its argument form; this pass found jest also never loads `.env` (only `server.ts` calls `dotenv.config()`), so `DATABASE_URL` was undefined and every run failed on SASL auth. Added `--setupFiles dotenv/config`; the script now runs correctly from a clean shell.

**Coverage gap, flagged not filled:** four of Item 3's eight bypass sites (`documentController`, `pdfController`, `pdfService`, `pdfWorker`) call the guard, but their unit tests automock `LocalStorageAdapter` and never exercise those call sites with a malicious `file_path`. Their coverage currently rests on the manual Gate-4 checks, not automated tests.

**Gate 4 runtime evidence — the first time item 4's SQL predicates have executed against a real Postgres.** Two documents, two signers each, real upload → fields → send → sign flow; tokens and field ids read from the DB. Torn down afterwards.

| Attack | Result |
|---|---|
| Signer A submits **signer B's** `field_id`, same document | **400** `"One or more fields do not belong to this signer"` |
| Signer A submits a `field_id` from a **different document** | **400** |
| Non-UUID `field_id` | **400** (not a Postgres `22P02` → 500) |
| 51-entry batch | **400** |
| Duplicate `field_id` in one batch | **400** |
| `signatures` table after every rejected attempt | **0 rows** — nothing written |
| Expired document (`SIGNING_ENFORCE_EXPIRY=true`) | **400** |
| **Legitimate typed signature, own field** | **200**, and `text_value`/`font_family` stored verbatim as `Hello|Arial` |
| Submit against a **cancelled** document | **400** |
| **Download** a cancelled document | **400** (previously unrestricted — B6) |
| `PUT`/`GET` another document's signer via this document's route (SEC-H3) | **404**, and the target row is unchanged in the DB |

16/16.

> **Harness caveat worth recording.** An earlier run of this same script reported 5 passes that were **false greens**: field creation had silently failed (page is 0-indexed; signature fields have a 150×50 minimum), so `field_id` was an empty string and the rejections were `"invalid field_id"` rather than the ownership check. The tell was the message text, not the status code. Runtime verification of a *rejection* must assert **why** it was rejected, not just that it was.

*(scope below)*

Three handlers already duplicate token→signer→document resolution. Copying five more checks into a 485-line function deepens the duplication that caused this bug.

1. **Extract `resolveSigningContext(pool, token)`** → `{signer, document, allSigners}`, throwing typed 400/404s, mirroring `documentAccess.ts:12-67`'s resolve-then-authorize pattern. Used by the GET path, `submitSignature`, and `downloadDocumentByToken`.
2. **C4** — reject unless `document.status === 'pending'`; reject if `isExpired()`.
3. **C5** — sequential-order check via `Signer.canSignInSequence`.
4. **C3** — one batch query before any insert: `SELECT id FROM fields WHERE id = ANY($1::uuid[]) AND document_id = $2 AND signer_email = $3`. Cast explicitly — an unparseable `field_id` otherwise raises Postgres `22P02` → 500 instead of 400. De-duplicate the submitted ids first. Reject the whole batch on any miss.
5. **Also fix `downloadDocumentByToken`** — same checks. A signing link is currently a permanent document-read credential surviving cancellation and completion.
6. **Skip the `validate()` middleware.** It has zero call sites; reviving a dead subsystem for one route is inconsistent with the codebase's controller-level convention. Do the `text_value`/`font_family` and array-bound checks as explicit controller checks. Add `.max(50)` on the batch either way.
7. **Known residual, documented not fixed:** two `signers` rows on one document sharing an email both satisfy `signer_email = $3`. Narrowing to `signer_id` is the real fix but is a schema change — out of scope here, recorded in tasks-0041.
8. Tests: cross-document `field_id` rejected; cancelled rejected; expired rejected; out-of-order sequential rejected; download-after-cancel rejected; **positive** test that a typed signature with `text_value`/`font_family` round-trips.

### Item 5 — Payload caps

1. Cap `signature_data` length **unconditionally, before the type switch** — the `typed` branch never inspects it today, so an uncapped blob goes straight to a `notNull text` column.
2. Move the size check **before** `client.query('BEGIN')` and name the offending `field_id` in the 400. Currently a throw at signature *n* rolls back `1..n-1`, losing every field the signer filled.
3. **`SignaturePad.tsx`** — reject oversized uploads with a clear toast and downscale to the 400×200 canvas before `toDataURL()`, matching the drawn/typed path. Without a client-side counterpart the signer hits an unrecoverable dead-end: retry resubmits the identical oversized payload.
4. State the arithmetic so the three numbers can't drift: array ≤ 50, per-signature ≤ 2 MB decoded, body limit = 10 MB.
5. Mount the smaller parser for **both** `express.json` and `express.urlencoded` on `/api/signing` (or reject non-JSON content types). The global 50 MB `urlencoded` at `server.ts:168` otherwise reconstructs the same payload shape via `signatures[0][field_id]=…` and defeats the cap.

### Item 6 — Signing rate limits  *(HELD — do not ship with items 1-5)*

Blocked on a runtime fact, not on code. Removing the `/api/signing/` skip while `req.ip` is wrong puts **every signer on Earth into one 100-req/15-min bucket** — at ~5 requests each, that is ~20 signers per 15 minutes globally before the core flow 429s with no signer-facing recovery.

1. **`trust proxy` is env-gated and defaults OFF**: `TRUST_PROXY` unset → today's behaviour; set to `1` on Drop only. Unconditional is unsafe — docker-compose publishes the backend directly with no proxy, so a spoofed `X-Forwarded-For` would let an attacker pick a fresh bucket per request (strictly worse than today) **and poison `signatures.ip_address`, which is legal evidence in a signing product.**
2. **Record the changeover.** `signatures.ip_address` rows written before the change hold the proxy IP, after hold the client IP, with nothing distinguishing them — while `AuditTrail.tsx:255-258`, the CSV export, and the signing-confirmation email all present them identically as "IP Address". Note the date in the README.
3. Wrap IP fallbacks with `ipKeyGenerator(req.ip, Number(process.env.RATE_LIMIT_IPV6_SUBNET || 64))` — pass the subnet explicitly; the v8 default is /56, which would collapse a whole campus into one bucket. Justification is the IPv6 /64-rotation bypass, **not** a construction-time error (the plan previously asserted `ERR_ERL_KEY_GEN_IPV6` fires at construction; the app is live with six such limiters, so that was wrong).
4. **Verify on Drop that `req.ip` is a real client address** before proceeding.
5. Then: remove the skip behind `RATE_LIMIT_SIGNING_SKIP` (default: still skip, flippable without redeploy), apply `signingLimiter` to `POST /:token/sign` only, and **raise `RATE_LIMIT_MAX_ANONYMOUS` to 300+ in the same commit**. Add a signer-visible 429 message in `Sign.tsx` — a silently broken PDF viewer is the worst failure mode here.

### Item 7 — SEC-H9: webhook SSRF

1. `utils/urlSafety.ts` — `isPrivateAddress` covering IPv4 `0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.168/16, 224/4, 240/4, 255.255.255.255`, **plus `192.0.0.0/24`, `198.18.0.0/15`, `192.88.99.0/24`**, and IPv6 `::`, `::1`, `fc00::/7`, `fe80::/10`, **`2002::/16` (6to4), `64:ff9b::/96` (NAT64)**, and IPv4-mapped re-checked as IPv4.
2. `assertPublicWebhookUrl` at create/update, replacing both `isPrivateIp` sites. Preserve the dev-mode localhost allowance.
3. A `lookup`-hooked agent rejecting private IPs at **connect** time, so validation and connection share one resolution (closes rebinding). Apply to **both** delivery paths, and add `maxRedirects: 0` to `webhookService.ts:182` or delete that dead path.
4. Log (don't delete) existing webhooks whose hostname resolves private, with a distinct DLQ error message — self-hosters with intentional `http://internal-crm:8080/hook` would otherwise see silent failures.

---

## File-level changes

| Item | Files |
|------|-------|
| 0 | none (SQL against live DB) |
| 1 | `routes/utilityRoutes.ts`, `services/validationPatternService.ts`, `middleware/rateLimiter.ts`, `server.ts`, `middleware/errorHandler.ts` |
| 2 | `services/settingsService.ts`, `controllers/authController.ts`, `services/invitationService.ts` (token lookup) |
| 3 | `config/storage.ts`, new `utils/storagePaths.ts`, `adapters/LocalStorageAdapter.ts`, `controllers/brandingController.ts`, `controllers/{pdf,document,signing}Controller.ts`, `services/{pdf,cleanup}Service.ts`, `workers/pdfWorker.ts`, `+ tests` |
| 4 | `controllers/signingController.ts`, new signing-context helper, `+ tests` |
| 5 | `models/Signature.ts`, `controllers/signingController.ts`, `server.ts`, `frontend/src/components/SignaturePad.tsx` |
| 6 | `server.ts`, `middleware/rateLimiter.ts`, `routes/signingRoutes.ts`, `frontend/src/pages/Sign.tsx`, `README.md` |
| 7 | new `utils/urlSafety.ts`, `controllers/webhookController.ts`, `services/webhookDeliveryService.ts`, `services/webhookService.ts`, `+ tests` |
| Frontend gate (after item 2) | `services/instanceSettingsService.ts`, `components/InstanceSettings.tsx`, `pages/{Login,Landing,Register}.tsx`, `components/PublicNavbar.tsx`, `pages/Docs.tsx`, `frontend/e2e/auth.spec.ts`, `README.md`, `backend/README.md` |

**Public config:** fold `registrationEnabled` into the existing unauthenticated `GET /api/branding/default` (already fetched by Login/Landing/PublicNavbar via `useDefaultBranding`, 5-min `staleTime`) rather than adding a third public config surface. `Register.tsx` **fails closed** on fetch error, with a "couldn't check" state distinct from "closed" — the backend 403 is the real gate.

Items 1 and 6 both touch `rateLimiter.ts`/`server.ts`; items 4 and 5 both touch `signingController.ts`. Sequence, don't parallelize.

---

## Risks & open questions

- **Scope grew.** The panel found two unauthenticated issues absent from tasks-0041 (ReDoS, `X-API-Key` bypass). Both are live now and neither is contained by the gate — hence item 1. **Confirm inclusion at the approval stop.**
- **`TRUST_PROXY` hop count on Drop is unverified.** Item 6 is held specifically on this.
- **Default-closed registration** breaks three `auth.spec.ts` e2e cases and the load-test register scenario; both need gating on the flag.
- **Item 4.5's `isExpired()` on the GET path is retroactive.** Nothing currently enforces or cleans up expiry — no job cancels expired-but-pending documents. Every such document becomes a hard 400 the moment this lands, including signers mid-flow. Item 0 counts them; if non-zero, extend the rows or land 4.5 behind a flag, and make the message name the deadline and the recovery path.
- **`signer_email` is case-sensitive**; a mixed-case row would make fields unsignable. Same predicate as the existing GET path, so not a regression — covered by one integration test.

## Agent critiques considered

Panel: `security-critic`, `architecture-critic`, plus two `general-purpose` critics with distinct schemas (regression-risk auditor; containment-boundary skeptic). All four read the repo, not just the plan. **56 findings: 6 critical, 12 high, 20 medium, 18 low.** Every critical and high is listed below with its verbatim severity/confidence.

### Actioned — critical

| ID | Finding (severity · confidence) | Action |
|---|---|---|
| B1 | Gate is prospective only; existing accounts keep rolling sessions (critical · high on code, UNKNOWN on population) | New **Item 0** — audit + revoke, gates the plan |
| B2 | SEC-C2 read half needs no principal; poisoned row stays world-readable (critical · high) | Goal rewritten; item 3 no longer deferrable; item 0 audits `team_branding` |
| B3 / SC1 | "Reduces C3–C5 to invited signers" is rhetorical — counterparty *is* the actor (critical · high) | Claim struck from Goal; item 4 treated as unmitigated blocker |
| R1 | Unconditional `trust proxy` is spoofable on the un-proxied self-host path and poisons `signatures.ip_address` (critical · high) | Item 6.1 — env-gated, default off; 6.2 records the changeover |
| R2 | Removing the signing skip without a verified client IP = global outage of the core flow (critical · high) | Item 6 **held** pending runtime verification; behind a flag; anon max raised |

### Actioned — high

| ID | Finding (severity · confidence) | Action |
|---|---|---|
| SC2 | Unvalidated `X-API-Key` grants unlimited buckets — total `apiLimiter` bypass (high · high) | Item 1.2 |
| SC3 | Unauthenticated ReDoS wedges the process (high · high) | Item 1.1 |
| SC4 | Global 50 MB `urlencoded` bypasses the signing JSON cap (high · medium) | Item 5.5 |
| SC5 | Size cap misses the `typed` branch and the array length (high · high) | Item 5.1, 5.4 |
| AC | `LocalStorageAdapter` is not the chokepoint — 8 bypass sites (high · high) | Item 3.2, 3.5 — shared util |
| AC | No single storage root: `FILE_STORAGE_PATH` vs `STORAGE_PATH` (high · medium) | Item 3.1 — prerequisite |
| AC / B4 / SC10 | Default-closed dead-ends team invitations (high · high) | Item 2.3 — invitation-scoped exemption |
| AC | Item 4 hand-copies five checks into a second 485-line handler (high · high) | Item 4.1 — extract `resolveSigningContext` |
| AC | Item 1 spanned 13 files / five concerns — unrevertable blob (high · high) | Re-cut into items 0-7; frontend split out |
| R3 | Guard on `exists()`/`delete()` turns soft-fail probes into 500s (high · high) | Item 3.4 — semantics split |
| R4 | No client-side size cap; an uploaded image dead-ends the whole batch (high · high) | Item 5.2, 5.3 |

### Recorded, not actioned in this plan

- **SC12 · low · medium** — `trust proxy` also trusts `X-Forwarded-Proto`/`Host`; five branding sites build URLs from them. Reflected-only, not persisted; the fix (use `settingsService.getAppUrl()`) is a clean separate change. Deferred.
- **SC17 / AC · low · high** — `apiLimiter` runs before `authenticate`, so the authenticated tier is dead code and JWT users bucket as `anon`. Item 1.2 removes the exploitable half; moving the limiter after auth is a behavioural change deserving its own plan. Flagged for Gate 4 observation.
- **SC18 / AC · low-medium · high** — `authLimiter`'s `skipSuccessfulRequests: true` means it would not limit successful registration. **Item 1h from the draft is dropped entirely** rather than half-wired — wiring it would read as "registration is rate-limited" when it isn't. SEC-M7 stays open in tasks-0041.
- **B5 · medium · high** — unauthenticated 2FA verify enables lockout DoS against the sole admin. Already tracked as SEC-H4 (Wave 2). Deferred, but note it now targets a single point of failure.
- **AC · low · high** — `cleanupService.ts:290` queries a non-existent `signatures.document_id`, so the orphan cleanup has never run; "fixing" it would create an unlink primitive from client-supplied `signature_data`. Out of scope — **do not fix without constraining that column first.**
- **R11 · low · high** — `templateService.ts:43-47` writes an `UploadedFile` object into `templates.file_path` (`[object Object]`). Pre-existing; excluded from item 3's coverage claim so a green test isn't read as "template path verified".
- **B7 · low · high** — `ADMIN_EMAIL` defaults to squattable `admin@ezsign.local`; a pre-gate registrant permanently wedges bootstrap. Folded into item 0's query.
- **20 medium / 18 low findings dropped without individual reasons** — duplicates across critics, style points, and items already covered by the re-cut.

### Disagreement resolved

`security-critic` (#6, medium) counted **two** adapter-bypass sites; `architecture-critic` counted **eight** plus a ninth join inside `getMetadataPath`, and graded it high. Sided with the architecture critic — its enumeration is specific and independently verified (`pdfWorker`, `cleanupService`, `pdfController` all confirmed). Deciding factor: severity should track the *containment guarantee the plan claims*, and that claim fails at one bypass site as surely as at eight.

## Agent critiques considered — diff stage

### Item 1 · pass 1

Panel: `security-critic`, `architecture-critic`, and a `general-purpose` correctness auditor, all on the real working-tree diff. **28 findings: 1 critical, 2 high, 12 medium, 13 low.**

**Critical — actioned, and it changed the fix.**

`security-critic` (critical · high) demonstrated the ReDoS was **not closed**. `hasNestedQuantifier` matched only `\(<paren-free body><quantifier>\)[+*]`, so `(a|a)+$` (985 ms at 22 chars, ~37 s at 26), `((a+))+$` (707 ms), and `^(a{1,100}){1,100}$` (>100 s) all sailed through. With the 512-char value cap that is 2^512 steps — one request permanently wedges the process.

Its recommendation was accepted over the plan as written: **a sound static ReDoS detector for JS regex is not achievable**, so do not extend the pattern list. `validateValue` is the only path that executes an attacker regex against an attacker string, reached solely from `POST /api/util/test-validation`, whose only client (`useTestValidation`) has **zero call sites** — verified independently. **The endpoint was deleted.** `POST /validate-regex` is retained: it only compiles, never executes, and `PatternSelector` needs it. The heuristic stays as defence in depth with an honest docstring naming its known gaps.

*This is a deliberate deviation from the approved plan (which said "guard the endpoint"), surfaced to the user before implementing.*

**High — actioned.**

| ID | Finding (severity · confidence) | Action |
|---|---|---|
| AC-F1 | Guard added on the dead egress path (`getValidationRegex`, zero callers) while the live ingress path (`Field.validateValidationConfig`, reachable via `fieldService.createField`/`updateField`) still accepted any pattern (high · high) | Guard moved to the write path; read path now fails **closed** |
| CO-C1 | The guard rejected EzSign's own `currency` preset `^-?\$?\d{1,3}(,\d{3})*(\.\d{2})?$`, plus `(\d{3})+`, `^([A-Z]{2}\d{4})+$`, `^\d+(\.\d+)*$` (high · high) | `NESTED_QUANTIFIER_RE` rewritten to require the group's *entire* content be a single quantified atom; test asserts all 15 presets pass |

**Medium — actioned:** `customRegex` array-coercion bypass of the length cap (moot — route deleted); write-path fail-open persisting bad patterns; the unguarded frontend copy that actually executes during signing; `patternId: 'constructor'` reaching `Object.prototype` and fail-opening via `new RegExp(undefined)` → `/(?:)/`; multer `LIMIT_FILE_SIZE` still returning 500 rather than 413; `PatternSelector` committing server-rejected patterns and never clearing stale errors; three url regression tests with **zero** regression detection (the old regex returns identical booleans, and Jest's `}, 1000)` cannot interrupt synchronous backtracking — proven by a probe test that ran 18.7 s and passed).

**Low — actioned:** `Field.validateValue` value-length cap (the fixed `url` preset is O(n²): 50 000 chars = 3.7 s); `Access-Control-Allow-Credentials` emitted for disallowed origins; stale `// (public)` comment on the utility router; missing `regexGuard.test.ts`; dead `validateFieldValue` deleted.

**Recorded, not actioned:**
- **AC-F4 (medium · medium)** — the heuristic is the security boundary for two modules and is neither an upper nor a lower bound. The structurally correct fixes (execution timeout in a worker, or `re2`) are deferred: deleting the only endpoint that executes attacker regex against attacker input removes the live vector, and the remaining compile-only path cannot backtrack. Docstring now states the limitation plainly.
- **AC-F10 (low · high)** — three copies of the preset table (two backend, one frontend) each needed the same `url` fix. Consolidation touches an API contract; deferred. A drift tripwire test was added instead.
- **AC-F11 (low · medium)** — a pre-existing bad `customRegex` will now block *unrelated* edits to that field, because `fieldService.updateField` re-validates properties wholesale. Confirmed **not** send-blocking (`validateAllFieldsForDocument` is wired only to an endpoint with zero frontend callers). Needs the Item 0 audit query over `fields.properties->'validation'->>'customRegex'` before it is treated as urgent.
- **AC-F7 (low · high)** — the `apiKey` rate-limit tier is now doubly unreachable (`apiKeyAuth` is mounted on no route, and `apiLimiter` runs before auth). Branches kept so they work correctly if the limiter later moves after auth, per the plan's deferral of SC17.
- **13 low findings dropped** as duplicates across critics or cosmetic.

**Defect introduced by the fix pass and caught in verification:** the rewritten `NESTED_QUANTIFIER_RE` silently **stopped detecting non-capturing groups** — `(?:a+)+`, `(?:\d*)*`, `(?:[a-z]*)*` were all missed, though the prior version caught them. Found by running the corpus by hand rather than trusting the agent's report. Fixed by adding an optional `(?:` prefix; verified against the full corpus with zero false positives, and a regression test now covers it. The frontend copy had also drifted from the backend during the same pass and was re-synced; a byte-identical tripwire test now guards that.

### Item 3 · pass 1

Two critics reviewed the Item 3 working-tree diff. One critical (SEC-C2 not yet fully closed) and one deployment hazard, both actioned; one behavioral note recorded rather than fixed.

**Critical — actioned.**

`getLogo` (`brandingController.ts`, unauthenticated router) read whatever `logo_path` held after only a root-containment check — sufficient to stop a *new* traversal write, but not to stop an *already-poisoned* row (planted before item 2 closed registration, or via any other write path) from being served to anyone who knows a `teamId`. **Fix:** `getLogo` now requires `logo_path` to start with `branding/${teamId}/` before reading, 404 otherwise; `uploadLogo` (the only writer) always composes exactly that prefix, so nothing legitimate false-rejects. Regression tests added (`brandingController.test.ts`): serves a same-team logo, 404s a poisoned cross-directory path, 404s a sibling team's own logo, and 404s a `team-1` vs `team-10` prefix lookalike.

A second, related gap in the same containment class: `templateService.ts` builds upload filenames by interpolating `template.name` (presence-checked only) and `document.original_filename` into a string passed to `storageService.uploadFile()` with `{ directory }` alone — root containment accepts any in-root key, so a crafted name (`x/../../temp/evil`) still lands wherever the name points within the root, not necessarily under `documents/`/`templates/`. **Fix:** both call sites now also pass `generateUniqueName: true`, which basenames + sanitizes the interpolated string before composing, so it can never reach path composition raw. Verified end-to-end (real `LocalStorageAdapter` against a temp directory, not a mock) in the new `templateService.test.ts`.

Also closed in the same pass: `LocalStorageAdapter.save()` returned the raw, pre-resolution `relativePath` rather than the canonical resolved-and-relativized form, so DB-persisted keys could disagree with what `path.relative`-based consumers (`cleanupService`'s orphan matching) compare against. Now returns `path.relative(path.resolve(basePath), fullPath)`.

**Deployment hazard — actioned.**

Unifying `FILE_STORAGE_PATH`/`STORAGE_PATH` behind one `getStorageRoot()` is a real storage-root *relocation* for any self-hoster who had `STORAGE_PATH` set, because before this existed the main document/template/logo/signed-PDF adapter read only `FILE_STORAGE_PATH` (defaulting to `<cwd>/storage`) while four other modules (`documentController`, `pdfController`, `cleanupService`, `pdfWorker`) read `STORAGE_PATH` directly. No shipped config sets `STORAGE_PATH` today, so this doesn't bite out of the box, but it must not be silent for anyone who set it themselves. **Fix:** `getStorageRoot()` now logs at `error` (was `warn`, and in one permutation didn't fire at all) naming both the previous and new root plus a `mv` migration command, covering both divergence shapes — `STORAGE_PATH` set alone, and both set to different values (the second previously returned on the `FILE_STORAGE_PATH` branch before ever reaching the log statement, so it fired for neither case). Table-driven tests added (`config/storage.test.ts`) over all four env permutations plus the log-once behavior, using `jest.resetModules()` between cases since the "already logged" flag is module-level.

**Recorded, not fixed — behavior change, not a defect.** Wherever an instance's effective storage root moves per the above, the daily 3 AM orphan-file cleanup sweep (`cleanupWorker.ts`) goes from scanning an empty/wrong directory (a no-op, since it also resolves `getStorageRoot()`) to actually deleting orphaned files it can now see. The matching logic itself is sound — both separator forms checked, `.meta.json` skipped, 1-hour mtime grace — and no shipped config is affected today. Not changed; called out in the README's `FILE_STORAGE_PATH`/`STORAGE_PATH` entry so it isn't a surprise on first restart after a self-hoster sets either var.

**Smaller findings, also actioned:**
- `storagePaths.ts` — `relative.startsWith('..')` false-rejected legitimate root-level keys like `..foo.pdf` / `...pdf` (never actually escape, they just happen to `path.relative`-stringify starting with `..`). Narrowed to `relative === '..' || relative.startsWith('..' + path.sep)` (both separator forms). Was unreachable in practice; regression tests added either way.
- `storagePaths.ts` — the thrown message interpolated the rejected key, and `errorHandler` returns `err.message` to the client for unhandled 500s. The key is now logged (`logger.warn`, server-side only) instead of embedded in the message; tests assert the message no longer contains the key.
- `config/storage.ts` — `getStorageRoot()` had no tests at all, despite being the highest-risk change in the diff. Added (see above).
- `LocalStorageAdapter.test.ts` — two tests ("read() rejects an absolute path", "exists() returns false for a Windows drive-absolute key") passed against the pre-guard `path.join` adapter too, coincidentally (a garbled joined path simply doesn't exist, independent of any guard). Now assert the specific failure reason: `rejects.toThrow(/Storage key rejected/)` for the former, a `logger.warn` spy for the latter.

## Run stats

_(to be filled at the end of Phase 2)_
