<p align="center">
  <img src="frontend/public/logo.png" alt="EzSign" width="360" />
</p>

# EzSign - Open-Source Document Signing Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

EzSign is a self-hosted, open-source document signing platform that enables individuals and businesses to collect legally-binding electronic signatures. Built with modern technologies and designed for easy deployment, EzSign provides a complete e-signature solution without vendor lock-in.

## 🎯 Features

- **Document Preparation**: Drag-and-drop interface for placing signature fields, date fields, initials, text inputs, and checkboxes
- **Flexible Workflows**: Support for single-signer, sequential multi-signer, and parallel multi-signer workflows
- **Multiple Signature Methods**: Drawn signatures (mouse/touch), typed signatures, and uploaded signature images
- **Template System**: Create and reuse document templates for common workflows
- **Email Notifications**: Automated signing requests, reminders, and completion notifications
- **Audit Trail**: Complete history of all document events with timestamps and IP addresses
- **REST API**: Comprehensive API for programmatic document management and automation
- **Webhooks**: Real-time notifications for document events
- **Team Management**: Role-based access control for teams and organizations
- **Self-Hosted**: Full control over your data and infrastructure
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices

## 🏗️ Architecture

EzSign is built as a monorepo with separate backend and frontend applications:

- **Backend**: Node.js + NestJS + TypeScript + PostgreSQL
- **Frontend**: React + TypeScript + Vite
- **PDF Processing**: pdf-lib (manipulation) + PDF.js (rendering)
- **Job Queue**: pg-boss (PostgreSQL-backed) for background processing

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 22.x or higher (required by pg-boss and other dependencies)
- **npm** or **yarn**
- **PostgreSQL** 15.x or higher
- **Docker** and **Docker Compose** (optional, for containerized deployment)
- **Python** 3.x (required for building native modules like canvas)

## 🚀 Quick Start

### Using Docker Compose (Recommended)

#### Development Setup

1. **Clone the repository:**
```bash
git clone https://github.com/JulesNsenda/ezsign.git
cd ezsign
```

2. **Start all services:**
```bash
# Start all services in development mode
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

This will start:
- PostgreSQL database (port 5432)
- Backend API (port 3001)
- Frontend app (port 3002)
- Adminer database UI (port 8080)
- MailHog email testing tool (SMTP: 1025, Web UI: 8025)

3. **Wait for services to be healthy:**
```bash
# Check status of all containers
docker-compose -f docker-compose.yml -f docker-compose.dev.yml ps
```

Wait until backend shows as "healthy" (may take 30-60 seconds).

4. **Run database migrations:**
```bash
# Run migrations to create database tables
docker exec ezsign-backend-dev npm run migrate
```

**Expected output:**
- First time: You should see all 11 migrations running successfully
- Already run: "No migrations to run! Migrations complete!" (this is correct)

To verify tables were created:
```bash
docker exec ezsign-postgres psql -U ezsign_dev -d ezsign_dev -c "\dt"
```

You should see 14 tables including users, documents, signers, templates, etc.

5. **Access the application:**
- **Frontend**: http://localhost:3002
- **Backend API**: http://localhost:3001
- **API Health Check**: http://localhost:3001/health
- **API Documentation**: http://localhost:3001/api/docs
- **Adminer (Database UI)**: http://localhost:8080
  - System: PostgreSQL
  - Server: postgres
  - Username: ezsign_dev
  - Password: dev_password
  - Database: ezsign_dev
- **MailHog (Email Testing)**: http://localhost:8025
  - View all emails sent by the application during development
  - No authentication required
  - All emails are captured automatically

6. **Create your first user:**

Visit http://localhost:3002 and register a new account. The first registered user will be able to create and sign documents.

#### Useful Development Commands

```bash
# View logs from all services
docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

# View logs from specific service
docker logs ezsign-backend-dev -f
docker logs ezsign-frontend-dev -f

# Restart a service
docker-compose -f docker-compose.yml -f docker-compose.dev.yml restart backend
docker-compose -f docker-compose.yml -f docker-compose.dev.yml restart frontend

# Stop all services
docker-compose -f docker-compose.yml -f docker-compose.dev.yml down

# Stop all services and remove volumes (⚠️ deletes all data)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml down -v

# Rebuild a service after code changes
docker-compose -f docker-compose.yml -f docker-compose.dev.yml build backend
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d backend

# Execute commands inside containers
docker exec -it ezsign-backend-dev sh
docker exec -it ezsign-frontend-dev sh

# Run backend migrations
docker exec ezsign-backend-dev npm run migrate

# Rollback last migration
docker exec ezsign-backend-dev npm run migrate:down
```

#### Production Setup

1. **Build production images:**
```bash
docker-compose -f docker-compose.yml build
```

2. **Start production services:**
```bash
docker-compose up -d
```

3. **Run migrations:**
```bash
docker exec ezsign-backend npm run migrate
```

4. **Access the application:**
- Frontend: http://localhost:3000
- API: http://localhost:3001

#### Windows-Specific Setup

**Prerequisites:**
1. Install Docker Desktop for Windows
2. Enable WSL 2 backend (Settings → General → "Use the WSL 2 based engine")
3. Enable file sharing for your project directory (Settings → Resources → File Sharing)
4. Allocate sufficient resources (recommended: 4GB RAM, 2 CPUs minimum)

**Setup Steps:**

1. **Configure Git line endings:**
```bash
# Prevent Git from converting line endings
git config --global core.autocrlf input
```

2. **Clone and start the application:**
```bash
git clone https://github.com/JulesNsenda/ezsign.git
cd ezsign

# Start all services
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Wait for backend to be healthy (30-60 seconds)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml ps

# Run database migrations
docker exec ezsign-backend-dev npm run migrate
```

3. **Access the application:**
- Frontend: http://localhost:3002
- Backend API: http://localhost:3001

**Performance Tips:**
- For better performance, clone the repository inside WSL 2 instead of Windows filesystem
- Access WSL 2 filesystem from Windows Explorer via `\\wsl$\<distro>\home\<user>\ezsign`

**Common Issues:**

- **Port already in use**: Stop conflicting services or change ports in docker-compose.dev.yml
- **Container keeps restarting**: Check logs with `docker logs ezsign-backend-dev`
- **Database connection errors**: Ensure PostgreSQL container is healthy before running migrations
- **Migration warning about MODULE_TYPELESS_PACKAGE_JSON**: This is just a Node.js warning and can be safely ignored. Migrations will still work correctly.

### Manual Installation

For development without Docker, follow these steps:

#### 1. Prerequisites

Ensure you have installed:
- Node.js 22.x or higher
- PostgreSQL 15.x or higher
- Python 3.x (for building native modules)

#### 2. Database Setup

```bash
# Start PostgreSQL (method varies by OS)
# Linux: sudo systemctl start postgresql
# macOS: brew services start postgresql
# Windows: Start PostgreSQL service

# Create a database
createdb ezsign_dev
```

#### 3. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your configuration
# Required variables:
# - DATABASE_URL=postgresql://username:password@localhost:5432/ezsign_dev
# - JWT_SECRET=your-secret-key-here
# - JWT_REFRESH_SECRET=your-refresh-secret-here
# - API_KEY_SECRET=your-api-key-secret-here
# - WEBHOOK_SECRET=your-webhook-secret-here

# Run database migrations
npm run migrate

# You should see all 11 migrations complete successfully

# Start the backend development server
npm run dev
```

The backend API will be available at http://localhost:3001

#### 4. Frontend Setup

Open a new terminal:

```bash
cd frontend

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env - set VITE_API_URL to your backend URL
# VITE_API_URL=http://localhost:3001

# Start the frontend development server
npm run dev
```

The frontend will be available at http://localhost:5173

#### 5. Verify Installation

1. Check backend health: http://localhost:3001/health
2. Access frontend: http://localhost:5173
3. Create your first user account through the registration page

#### Troubleshooting Manual Installation

**Migration errors:**
```bash
# Check DATABASE_URL is correct in backend/.env
# Verify PostgreSQL is running:
psql -U postgres -c "SELECT version();"

# Try running migrations with verbose output
cd backend
npm run migrate
```

**Backend won't start:**
```bash
# Check all required environment variables are set
# Verify Node.js version
node --version  # Should be 22.x or higher

# Check for port conflicts
netstat -ano | findstr :3001  # Windows
lsof -i :3001                  # macOS/Linux
```

**Frontend build errors:**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Verify VITE_API_URL in .env
cat .env
```

## 🛠️ Development Tools

The development environment includes several tools to help with testing and debugging:

### MailHog - Email Testing

**Access**: http://localhost:8025

MailHog captures all emails sent by the application during development, allowing you to test email functionality without sending real emails.

**Features:**
- View all sent emails in a clean web interface
- Inspect email headers, HTML, and plain text content
- Search and filter emails
- No configuration required - works automatically in Docker development environment

**Testing Email Workflows:**
1. Send a document for signing from the application
2. Open MailHog at http://localhost:8025
3. View the signing invitation email
4. Click the signing link to test the signing workflow

### Adminer - Database Management

**Access**: http://localhost:8080

A lightweight database management tool for PostgreSQL.

**Login Credentials:**
- System: PostgreSQL
- Server: `postgres`
- Username: `ezsign_dev`
- Password: `dev_password`
- Database: `ezsign_dev`

## 🔧 Configuration

### Database Migrations

EzSign uses `node-pg-migrate` for database schema management. Migrations are located in `backend/migrations/`.

**Available migration commands:**

```bash
# Docker (development)
docker exec ezsign-backend-dev npm run migrate        # Run all pending migrations
docker exec ezsign-backend-dev npm run migrate:down   # Rollback last migration
docker exec ezsign-backend-dev npm run migrate:create migration-name  # Create new migration

# Manual installation
cd backend
npm run migrate           # Run all pending migrations
npm run migrate:down      # Rollback last migration
npm run migrate:create migration-name  # Create new migration
```

**Current database schema includes:**
- `users` - User accounts and authentication
- `teams` - Team/organization management
- `team_members` - Team membership and roles
- `api_keys` - API key management
- `documents` - Document metadata and workflow
- `fields` - Document field definitions
- `signers` - Document signers and access tokens
- `templates` & `template_fields` - Reusable templates
- `signatures` - Signature data
- `audit_events` - Complete audit trail
- `webhooks` & `webhook_events` - Webhook configuration

### First-Run Admin Bootstrap

On startup, if no admin account exists, EzSign creates one automatically:

- Email: `ADMIN_EMAIL` env var (default `admin@ezsign.local`)
- Password: `ADMIN_PASSWORD` env var if set; otherwise a one-time password is **generated and printed once to the backend logs** in a prominent box
- The admin must change this password at first login before anything else works — until then all other API calls return `403 PASSWORD_CHANGE_REQUIRED`

Because the generated password is printed to stdout, treat backend logs/console output as sensitive and access-control them accordingly; set `ADMIN_PASSWORD` explicitly to skip generation and avoid the password ever being printed.

After logging in, the admin configures SMTP, the sender address, and the application URL from **Settings → Instance** — no env vars required. Values set in the UI are stored in the database (secrets encrypted with AES-256-GCM) and take precedence over env vars; unset values fall back to env, then to defaults. A minimal deployment therefore needs only `JWT_SECRET` and `DATABASE_URL`.

### Registration Gate & Account Audit

Public self-registration (`POST /api/auth/register`) is gated by the **`registration.enabled`** instance setting, configurable from **Settings → Instance** and defaulting to **closed** (`false`). Unlike every other instance setting, `registration.enabled` has **no environment-variable fallback** — there is no `PUBLIC_REGISTRATION_ENABLED` (or similarly named) env var, and there never will be: clearing the toggle in the UI reverts to the closed default, not to an env var, because this is the one setting whose entire job is to fail closed. A fresh self-hosted install needs the bootstrap admin to open registration once from the UI (or invite teammates directly — see below).

One exception stays open even while the toggle is off: a registration request carrying a valid (unexpired) team-invitation token whose invited email matches the submitted email is still allowed through, so closing registration never blocks an invited teammate from accepting a team invite. Submitted emails are normalized (trimmed, lowercased) before every check, so the invitation's email match and the duplicate-account check can't be bypassed with a case variant of the same address. The exemption does not mark the invitation consumed — it stays usable for its normal lifetime, so the invited user's browser can still complete the separate, authenticated "accept invitation" step to actually join the team right after registering — but it can still only ever produce one account for that address at a time, since every registration (this one included) stores the same normalized email and a second attempt is rejected as a duplicate. If that one account is later deleted, the still-valid invitation can register a replacement account for the same address; cancel the invitation from the team's settings if that's not wanted.

Closing the gate is **prospective only** — it does not affect `/login` or `/refresh`, so any account created while registration was open keeps a valid session (and can keep refreshing its access token) until its refresh token expires or is explicitly revoked. After closing registration (or at any time), audit existing accounts and revoke stale sessions:

- `GET /api/admin/users/audit?page=1&pageSize=20` (admin-only) lists every account's `id, email, role, created_at`, paginated (`pageSize` capped at 100). This deliberately includes admin accounts too — an account created during an open window and later promoted to admin is the case most worth catching.
- `POST /api/admin/users/:userId/revoke-sessions` (admin-only) forces that user to re-authenticate everywhere, via the same token-revocation path used by change-password. This does **not** disable the account or change its password — pair it with deleting the account (or forcing a password reset) if the account itself is unwanted, not just its current session. Returns `500 REVOCATION_FAILED` rather than a false `success: true` if the revocation write itself fails.
- Equivalently, run directly against the database: `SELECT id, email, role, created_at FROM users ORDER BY created_at;` — this returns the same rows as the endpoint (unpaginated); while reviewing, also check that nobody has registered `admin@ezsign.local` (the default `ADMIN_EMAIL`), which would permanently block the first-run admin bootstrap from ever creating the real admin account.

### Signing Submission Integrity

The three signing-token routes (`GET /api/signing/:token`, `POST /api/signing/:token/sign`, `GET /api/signing/:token/download`) now re-check, on every request, that the document is still in a state that route is allowed to act on, and — for `POST /:token/sign` — that every submitted `field_id` actually belongs to that signer on that document. Previously only the signer's own status was checked before accepting a submission, so a direct API call (bypassing the UI) could forge a signature onto another signer's field, sign a cancelled document, or sign out of turn in a sequential workflow; all three are now rejected with `400`.

The document-expiry check is new and **opt-in, defaulting to off**: nothing in the app automatically cancels or cleans up an expired-but-still-pending document today, and the live count of `documents WHERE status='pending' AND expires_at < now()` has not been measured, so enforcing a check that has never applied could make an unknown number of in-flight documents suddenly unsignable for a signer mid-flow. Set `SIGNING_ENFORCE_EXPIRY=true` to turn it on once that count is confirmed zero. When enabled, a `pending` document past its `expires_at` deadline can no longer be signed **or read for `pending` documents**; the download route stays reachable regardless only for `completed` documents, since a signer's link is also how they retrieve their finished copy. The cancelled/completed status checks always apply regardless of this flag.

Known residual, not fixed here: fields are matched to a signer by `signer_email`, not `signer_id` — if a document has two signer rows sharing the same email, both satisfy the field-ownership check. Narrowing this to `signer_id` needs a schema change and is tracked separately (see `.planning/tasks/tasks-0041-launch-security-hardening.md`).

### Environment Variables

Key environment variables to configure:

**Backend (`backend/.env`):**
- `DATABASE_URL`: PostgreSQL connection string (takes precedence over the discrete `DATABASE_HOST`/`DATABASE_PORT`/... vars; `DATABASE_SSL=true` enables SSL)
- `JWT_SECRET`: Secret key for JWT tokens
- `API_KEY_SECRET`: Secret key for API key hashing
- `ADMIN_EMAIL`: Email for the first-run admin account (default `admin@ezsign.local`)
- `ADMIN_PASSWORD`: Optional fixed password for the first-run admin (if unset, one is generated and printed to logs once)
- `SETTINGS_ENCRYPTION_KEY`: Key for encrypting instance settings secrets at rest (falls back to `JWT_SECRET`; set a dedicated value in production)
- `EMAIL_SMTP_HOST`: SMTP server hostname (use `localhost` for MailHog in development) — *configurable in Settings → Instance*
- `EMAIL_SMTP_PORT`: SMTP server port (use `1025` for MailHog in development) — *configurable in Settings → Instance*
- `EMAIL_SMTP_USER`: SMTP username (leave empty for MailHog) — *configurable in Settings → Instance*
- `EMAIL_SMTP_PASS`: SMTP password (leave empty for MailHog) — *configurable in Settings → Instance*
- `EMAIL_SMTP_SECURE`: Use TLS/SSL (set to `false` for MailHog) — *configurable in Settings → Instance*. Accepts `1/true/yes/on` and `0/false/no/off`, case-insensitively; anything else is ignored (logged and treated as unset, falling back to the default `false`) rather than sent to the mail server. **Behavior change:** this setting (and every other instance-setting boolean) used to treat any value other than the exact string `true` as `false` — so `EMAIL_SMTP_SECURE=1` silently meant "off". It now means "on", matching the documented accepted spellings above; update `1` to `true`/`false` explicitly if your deployment relied on the old behavior.
- `EMAIL_FROM`: Sender address for outgoing email (legacy aliases `EMAIL_FROM_ADDRESS` and `EMAIL_SMTP_FROM` still honored) — *configurable in Settings → Instance*
- `FILE_STORAGE_PATH`: Path for document storage. `STORAGE_PATH` is accepted as a deprecated alias and is now honored consistently by every storage-backed module (documents, templates, branding logos, signed PDFs, and the daily cleanup sweep). **Behavior change:** before, only a handful of modules read `STORAGE_PATH` directly while the main storage adapter read only `FILE_STORAGE_PATH` (defaulting to `<cwd>/storage` if unset) — so setting `STORAGE_PATH` alone silently split your install across two roots. Now the whole install uses one root: if you have `STORAGE_PATH` set and `FILE_STORAGE_PATH` unset, every file (not just some) moves to `$STORAGE_PATH`, and existing documents/templates/logos under `<cwd>/storage` will 404 until moved (`mv <cwd>/storage/* $STORAGE_PATH/`); if both are set to different values, `FILE_STORAGE_PATH` now wins everywhere, including the modules that used to read `STORAGE_PATH`. A startup log at `error` level names both roots and the migration command whenever this divergence is detected. Prefer setting `FILE_STORAGE_PATH` alone going forward. Related: because the daily orphan-file cleanup job resolves this same root, an instance where it previously ran against an empty/wrong directory (a no-op) will start actually deleting orphaned files on first restart after this change, if its effective root changes.
- `APP_URL`: Application base URL — *configurable in Settings → Instance*
- `WEBHOOK_SECRET`: Secret for webhook signatures
- `SIGNING_ENFORCE_EXPIRY`: Whether an expired (`expires_at` in the past) `pending` document can still be signed. Defaults to **off** (opt-in — set to exactly `true` to enable); switch it on once a live count of `documents WHERE status='pending' AND expires_at < now()` is confirmed zero — see [Signing Submission Integrity](#signing-submission-integrity) above.

Database migrations run automatically before the server starts in the production Docker image (`npm run start:prod`).

**Email Testing in Development:**
- MailHog is automatically configured in Docker development environment
- Access MailHog web UI at http://localhost:8025 to view all sent emails
- No real emails are sent during development - all are captured by MailHog

**Frontend (`frontend/.env`):**
- `VITE_API_URL`: Backend API URL

See `.env.example` files for complete configuration options.

## 📚 Documentation

- [API Documentation](http://localhost:3001/api/docs) - Interactive OpenAPI/Swagger documentation
- [Embedded Signing Guide](docs/EMBED_INTEGRATION.md) - iFrame integration for partners
- [Contributing Guidelines](CONTRIBUTING.md) - How to contribute to the project
- [Deployment Guide](docs/deployment.md) - Production deployment instructions
- [User Guide](docs/user-guide.md) - End-user documentation
- [Webhook Integration](docs/webhooks.md) - Webhook setup and usage

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm test
```

### Frontend Tests
```bash
cd frontend
npm test
```

### End-to-End Tests
```bash
npm run test:e2e
```

## 🚢 Deployment

### Docker Deployment

```bash
# Build images
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

# Start services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Traditional Server Deployment

See [Deployment Guide](docs/deployment.md) for detailed instructions on deploying to:
- Traditional Linux/Windows servers
- Cloud platforms (AWS, GCP, Azure)
- Kubernetes clusters

## 🔐 Security

- All passwords are hashed using bcrypt
- API keys are hashed before storage
- Signing links use cryptographically secure tokens
- **Token revocation system** - Postgres-backed blacklist for proper logout and session management
- **Tiered rate limiting** - In-memory, per-process rate limits (100/500/1000 requests per 15min for anonymous/authenticated/API key; single-instance deployments only)
- CORS protection
- Input validation and sanitization
- Webhook payload signatures (HMAC-SHA256)
- **Graceful shutdown** - Proper cleanup with timeout protection for background jobs
- **Embedded signing security** - CSP frame-ancestors and origin validation for iframe embedding

## 🐛 Known Issues

We've identified several issues that need attention. **Your contributions are welcome!**

### Critical Priority

1. **Frontend: Undefined Variable Bug** (`frontend/src/pages/PrepareDocument.tsx:236`)
   - Bug causes crash when deleting fields
   - Fix: Remove `setShowFieldProperties(false)` line

2. **Backend: PDF Worker Not Initialized** (`backend/src/server.ts`)
   - Background PDF processing jobs won't execute
   - Fix: Import and initialize `createPdfWorker()`

3. **Frontend: Token Refresh Race Condition** (`frontend/src/api/client.ts:43-84`)
   - Multiple concurrent 401 responses can cause auth failures
   - Fix: Implement mutex/queue for token refresh

### High Priority

4. **Frontend: Missing Routes**
   - AuditTrail component exists but not routed in `App.tsx`
   - TemplateEditor component exists but not routed in `App.tsx`

5. **Backend: Debug Logging in Production**
   - Sensitive data (tokens, request bodies) logged via `console.log`
   - Fix: Replace with proper logging library (winston, pino)

6. **Backend: Missing Access Control**
   - Document update/delete routes missing `checkDocumentAccess` middleware
   - File: `backend/src/routes/documentRoutes.ts:76,79`

7. **Frontend: XSS Vulnerability** (`frontend/src/pages/Templates.tsx:159`)
   - Uses `innerHTML` to inject SVG, potential XSS risk
   - Fix: Use React createElement or JSX

8. **Frontend: No Error Boundaries**
   - Unhandled errors crash entire app
   - Fix: Implement ErrorBoundary components

9. **Backend: Type Safety Issues**
   - Extensive use of `any` types in controllers
   - Multiple instances of unsafe type assertions

### Medium Priority

10. **Backend: N+1 Query Problem** (`backend/src/controllers/teamController.ts:33-42`)
    - Queries team_members once per team
    - Fix: Use JOIN in single query

11. **Backend: Missing Coordinate Validation**
    - No validation that PDF fields are within page bounds
    - Can cause rendering issues

12. **Backend: Stub Implementation** (`backend/src/controllers/templateController.ts:250`)
    - `getUserTeamIds` returns empty array
    - May affect template access control

13. **Frontend: Missing Loading States**
    - Dashboard, Templates, and other pages lack loading indicators
    - Poor UX during data fetching

14. **Frontend: Unsafe localStorage Access**
    - Direct localStorage access without try-catch
    - App crashes in private browsing mode

15. **Frontend: Missing Accessibility Attributes**
    - No `aria-label` on icon-only buttons
    - Missing focus management in modals
    - No keyboard navigation hints

See our [GitHub Issues](https://github.com/JulesNsenda/ezsign/issues) for complete list and details.

## 🚧 Missing Features & Roadmap

The following features are planned or partially implemented. **Contributions welcome!**

### Authentication & Security
- [x] **Two-Factor Authentication (2FA)** - TOTP-based 2FA with backup codes (v1.1.0)
- [ ] **Email Verification Flow** - Backend endpoint exists, frontend page needed
- [ ] **SSO Integration** (SAML, OAuth2)
- [ ] **Advanced password policies**
- [x] **Session management improvements** - Logout-all endpoint, token revocation on password change (v1.2.0)
- [x] **Token blacklisting for logout** - Postgres-based token revocation system (v1.2.0)

### Document Management
- [ ] **Bulk Document Operations** - Send, delete, download multiple documents
- [ ] **Document Versioning** - Track document revisions
- [ ] **Document Expiration** - Auto-expire signing requests
- [ ] **Document Search** - Full-text search across document content
- [ ] **Advanced Filtering** - Filter by date range, signer, status
- [ ] **Document Folders/Organization**
- [ ] **Document Workflow Type Selection** - Let users choose single/sequential/parallel in UI

### PDF Features
- [ ] **PDF Form Field Detection** - Auto-detect existing form fields
- [ ] **PDF Annotations** - Comments, highlights, sticky notes
- [ ] **PDF Redaction** - Permanently remove sensitive information
- [ ] **Custom Fonts** - Support for additional fonts in typed signatures
- [ ] **Coordinate Validation** - Ensure fields are within page bounds

### Team Collaboration
- [ ] **Team Management UI** - Full team admin interface (backend exists)
- [ ] **Document Sharing** - Share documents within teams
- [ ] **Team Templates** - Shared template library
- [ ] **Team Analytics** - Usage statistics per team
- [ ] **Permission Levels** - Granular role-based access control

### Webhooks & Integrations
- [ ] **Webhook UI** - Frontend interface ready but disabled, needs testing
- [ ] **Webhook Retry Configuration** - Customizable retry policies
- [ ] **Webhook Logs Viewer** - Debug webhook deliveries
- [ ] **Pre-built Integrations** - Zapier, Make, n8n
- [ ] **Cloud Storage** - S3, Google Drive, Dropbox, OneDrive
- [ ] **CRM Integrations** - Salesforce, HubSpot

### API & Developer Experience
- [ ] **Interactive API Documentation** - Replace placeholder with Swagger UI
- [x] **API Rate Limit Feedback** - Rate limit headers in responses (v1.2.0)
- [x] **Tiered Rate Limits** - Different limits for anonymous/authenticated/API key users (v1.2.0)
- [ ] **API Versioning** - Implement `/api/v1/` prefix
- [ ] **GraphQL API** - Alternative to REST
- [ ] **SDK Libraries** - JavaScript, Python, Go, PHP clients
- [ ] **Webhook Testing Tools** - Test webhook endpoints

### User Experience
- [ ] **Multi-language Support (i18n)** - Internationalization
- [ ] **Dark Mode** - Theme toggle
- [ ] **Email Customization** - Branded email templates
- [ ] **Custom Branding** - Logo, colors, domain
- [ ] **Mobile Native Apps** - iOS and Android
- [ ] **Keyboard Shortcuts** - Power user features
- [ ] **Drag-and-drop Document Upload** - Anywhere on page
- [ ] **Bulk Field Operations** - Copy, paste, duplicate fields
- [ ] **Field Templates** - Reusable field sets

### Analytics & Reporting
- [ ] **Document Analytics** - Views, completion time, drop-off rates
- [ ] **Signer Analytics** - Time to sign, device info
- [ ] **Export Reports** - CSV, PDF reports
- [ ] **Dashboard Widgets** - Customizable dashboard
- [ ] **Audit Log Export** - Download complete audit trails

### Enterprise Features
- [ ] **Custom Domains** - white-label deployment
- [ ] **LDAP/Active Directory Integration**
- [ ] **Advanced Audit Logging** - Tamper-proof logs
- [ ] **E-signature Compliance** - ESIGN, UETA, eIDAS certifications
- [ ] **Legal Hold** - Prevent document deletion
- [ ] **Data Retention Policies**
- [ ] **Backup and Restore** - Automated backups

### Performance & Scalability
- [ ] **Query Result Caching** - Redis cache layer
- [ ] **CDN Integration** - Static asset delivery
- [ ] **Database Query Optimization** - Address N+1 queries
- [ ] **Background Job Monitoring** - Job queue dashboard
- [ ] **Horizontal Scaling** - Multi-instance support

### Testing & Quality
- [ ] **E2E Test Suite** - Playwright or Cypress tests
- [ ] **Visual Regression Testing**
- [ ] **API Integration Tests**
- [ ] **Load Testing** - Performance benchmarks
- [ ] **Security Audit** - Third-party security review

## 🤝 Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding features, improving documentation, or helping with design, your help is appreciated.

### Quick Start for Contributors

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ezsign.git
   cd ezsign
   ```
3. **Set up development environment** (see Quick Start section above)
4. **Create a branch** for your feature:
   ```bash
   git checkout -b feature/your-feature-name
   ```
5. **Make your changes** and test thoroughly
6. **Commit** following [Conventional Commits](https://www.conventionalcommits.org/):
   ```bash
   git commit -m "feat(scope): add new feature"
   git commit -m "fix(scope): fix bug in component"
   ```
7. **Push** to your fork and **create a Pull Request**

### Coding Standards

**Backend (TypeScript + Node.js):**
- Use TypeScript strict mode, avoid `any` types
- Follow existing patterns: Services → Controllers → Routes
- Use parameterized SQL queries (never string interpolation)
- Add JSDoc comments for public functions
- Write unit tests for services (target: 70%+ coverage)
- Use path aliases: `@services/`, `@controllers/`, etc.
- Run linting: `npm run lint` before committing

**Frontend (React + TypeScript):**
- Use functional components with hooks
- Implement proper error boundaries
- Add loading states for all async operations
- Use Tailwind CSS (avoid inline styles)
- Add accessibility attributes (aria-labels, roles)
- Use React Hook Form + Zod for forms
- Use TanStack Query for data fetching
- Write tests with Vitest + React Testing Library

**General:**
- No `console.log` in production code (use proper logging)
- Add error handling for all async operations
- Follow existing code structure and patterns
- Update tests for any changed functionality
- Update documentation if adding new features

### 🎯 Good First Issues

Perfect for first-time contributors:

#### Easy (< 2 hours)
- **Add missing routes** - `frontend/src/App.tsx` (AuditTrail, TemplateEditor)
- **Fix undefined variable bug** - `frontend/src/pages/PrepareDocument.tsx:236`
- **Add aria-labels** - Add accessibility attributes to icon buttons
- **Fix XSS vulnerability** - `frontend/src/pages/Templates.tsx:159`
- **Add JSDoc comments** - Document service functions in backend
- **Add loading skeletons** - Replace "Loading..." text with skeleton components

#### Medium (2-8 hours)
- **Initialize PDF Worker** - `backend/src/server.ts` (import and setup)
- **Replace console.log** - Implement winston/pino logger throughout backend
- **Add error boundaries** - Create and apply ErrorBoundary components
- **Add template edit button** - `frontend/src/pages/Templates.tsx`
- **Convert inline styles to Tailwind** - `frontend/src/pages/AuditTrail.tsx`, `TemplateEditor.tsx`
- **Add email verification page** - New frontend page for email verification flow
- **Implement debounced search** - Create useDebounce hook for search inputs
- **Add loading states** - Dashboard, Documents, Templates pages
- **Fix N+1 query** - `backend/src/controllers/teamController.ts:33-42`

#### Advanced (8+ hours)
- **Implement token refresh queue** - Fix race condition in `frontend/src/api/client.ts`
- **Add interactive Swagger UI** - Replace placeholder in `backend/src/server.ts:120`
- **Implement 2FA** - Backend + frontend for two-factor authentication
- **Add webhook UI** - Enable and test webhook management interface
- **Add document coordinate validation** - Ensure PDF fields are within bounds
- **Implement repository pattern** - Refactor data access layer
- **Add comprehensive test coverage** - Write tests for untested services/components
- **Implement event system** - Decouple webhook triggers with event emitter

### Pull Request Guidelines

- **Keep PRs focused** - One feature or bug fix per PR
- **Write clear descriptions** - Explain what and why
- **Reference issues** - Link to relevant issue numbers
- **Add tests** - Include tests for new features
- **Update documentation** - Update README, CLAUDE.md, or docs/ if needed
- **Ensure CI passes** - All tests and linting must pass
- **Request review** - Tag maintainers for review

### Development Workflow

1. **Check existing issues** before starting work
2. **Comment on issue** to claim it (avoid duplicate work)
3. **Ask questions** if anything is unclear
4. **Keep commits atomic** and well-described
5. **Test locally** before pushing
6. **Respond to feedback** promptly during review

### Need Help?

- **Questions?** Ask in [GitHub Discussions](https://github.com/JulesNsenda/ezsign/discussions)
- **Stuck?** Comment on the issue you're working on
- **Found a bug?** Open a [GitHub Issue](https://github.com/JulesNsenda/ezsign/issues)
- **Want to chat?** Join our community chat (link coming soon)

### Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please:
- Be respectful and considerate
- Use welcoming and inclusive language
- Accept constructive criticism gracefully
- Focus on what's best for the community
- Show empathy towards others

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for full details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: Report bugs or request features via [GitHub Issues](https://github.com/JulesNsenda/ezsign/issues)
- **Discussions**: Join the community discussion on [GitHub Discussions](https://github.com/JulesNsenda/ezsign/discussions)
- **Documentation**: Check our [documentation](docs/) for guides and tutorials
- **Security**: Report security vulnerabilities privately to security@ezsign.example.com

## 🙏 Acknowledgments

Built with these amazing open-source projects:
- [NestJS](https://nestjs.com/)
- [React](https://react.dev/)
- [PostgreSQL](https://www.postgresql.org/)
- [pdf-lib](https://pdf-lib.js.org/)
- [PDF.js](https://mozilla.github.io/pdf.js/)
- [pg-boss](https://github.com/timgit/pg-boss)

---

Made with ❤️ by the EzSign community
