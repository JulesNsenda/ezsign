# EzSign Backend API

Self-hosted document signing platform API built with Node.js, Express, TypeScript, and PostgreSQL.

## Features

- 🔐 **Authentication**: JWT tokens & API keys
- 📄 **PDF Processing**: Upload, process, and sign PDF documents
- ✍️ **Signatures**: Drawn, typed, and uploaded signature support
- 🔄 **Workflows**: Sequential and parallel signing workflows
- 📧 **Notifications**: Email notifications with customizable templates
- 📋 **Templates**: Reusable document templates
- 🔍 **Audit Trail**: Complete audit log of all document actions
- 🪝 **Webhooks**: Event notifications with HMAC verification
- 🛡️ **Security**: Rate limiting, CORS, Helmet headers
- 👥 **Teams**: Multi-user team management

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- SMTP server (for emails)

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp ../.env.example ../.env

# Configure .env file with your settings

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

Server will start on `http://localhost:3001`

## Environment Variables

Create a `.env` file in the project root with:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ezsign

# JWT Authentication
JWT_SECRET=your-secret-key-minimum-32-characters
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_EXPIRES_IN=30d

# API Keys
API_KEY_SECRET=your-api-key-secret

# File Storage
FILE_STORAGE_PATH=./storage
MAX_FILE_SIZE=10485760

# Email (SMTP)
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_USER=your-email@gmail.com
EMAIL_SMTP_PASS=your-app-password
EMAIL_FROM=noreply@ezsign.com

# Application
NODE_ENV=development
PORT=3001
BASE_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/forgot-password` - Request password reset

### Documents
- `POST /api/documents` - Upload document
- `GET /api/documents` - List documents (with pagination)
- `GET /api/documents/:id` - Get document details
- `PUT /api/documents/:id` - Update document
- `DELETE /api/documents/:id` - Delete document
- `GET /api/documents/:id/download` - Download signed PDF
- `POST /api/documents/:id/send` - Send for signature
- `GET /api/documents/:id/status` - Get signing status

### Fields & Signers
- `POST /api/documents/:id/fields` - Add signature field
- `GET /api/documents/:id/fields` - List fields
- `POST /api/documents/:id/signers` - Add signer
- `GET /api/documents/:id/signers` - List signers

### Signing (Public - No Auth)
- `GET /api/signing/:token` - Access document via signing link
- `POST /api/signing/:token/sign` - Submit signature

### Templates
- `POST /api/templates` - Create template from document
- `GET /api/templates` - List templates
- `POST /api/templates/:id/documents` - Create document from template

### Webhooks
- `POST /api/webhooks` - Create webhook
- `GET /api/webhooks` - List webhooks
- `GET /api/webhooks/:id/events` - Get webhook delivery log

## Webhook Integration

### Webhook Events
- `document.created` - Document uploaded
- `document.sent` - Sent for signature
- `document.viewed` - Viewed by signer
- `document.signed` - Signed by signer
- `document.completed` - All signatures complete
- `document.declined` - Declined by signer

### Webhook Payload Example
```json
{
  "event": "document.signed",
  "timestamp": "2025-01-15T10:30:00Z",
  "data": {
    "document_id": "uuid-here",
    "signer_email": "john@example.com",
    "signer_name": "John Doe"
  }
}
```

### Verifying Webhook Signatures

Webhooks include `X-Webhook-Signature` header with HMAC-SHA256:

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  return signature === hmac.digest('hex');
}
```

## Database Migrations

This project uses `node-pg-migrate` for database migrations.

```bash
# Run all pending migrations
npm run migrate

# Rollback last migration
npm run migrate:down

# Create new migration
npm run migrate:create migration-name
```

Migration files are in `migrations/` directory.

## Development

```bash
# Install dependencies
npm install

# Run development server (auto-reload)
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:cov

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Build TypeScript
npm run build

# Start production server
npm start
```

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- documentService.test.ts

# Run with coverage
npm run test:cov

# Watch mode
npm run test:watch
```

## Rate Limiting

- **General API**: 100 req/15min per IP
- **Auth endpoints**: 5 req/15min per IP
- **Upload**: 10 req/hour per IP
- **Signing**: 20 req/hour per IP

## Security Features

- JWT & API Key authentication
- Password hashing with bcrypt
- Rate limiting (express-rate-limit)
- CORS protection
- Helmet.js security headers
- SQL injection protection (parameterized queries)
- Input validation
- Audit logging

## Deployment

### Docker

```bash
# Using docker-compose (from project root)
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

### Traditional Server

1. Set all environment variables
2. Run migrations: `npm run migrate`
3. Build: `npm run build`
4. Start: `npm start`

## Project Structure

```
backend/
├── migrations/          # Database migrations
├── src/
│   ├── adapters/       # Storage adapters
│   ├── config/         # Configuration files
│   ├── controllers/    # Request handlers
│   ├── middleware/     # Express middleware
│   ├── models/         # Data models
│   ├── routes/         # API routes
│   ├── services/       # Business logic
│   └── __tests__/      # Integration tests
├── .env.example        # Environment template
└── package.json
```

## API Authentication

### JWT Token
```bash
curl -H "Authorization: Bearer <access_token>" \
  http://localhost:3001/api/documents
```

### API Key
```bash
curl -H "X-API-Key: <api_key>" \
  http://localhost:3001/api/documents
```

## Troubleshooting

### Database Connection Issues
- Verify `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running
- Check database exists: `psql -c "CREATE DATABASE ezsign;"`

### Email Not Sending
- Verify SMTP credentials in `.env`
- For Gmail, use App Password (not account password)
- Check firewall allows SMTP port

### File Upload Errors
- Check `FILE_STORAGE_PATH` directory exists and is writable
- Verify `MAX_FILE_SIZE` setting
- Ensure sufficient disk space

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
