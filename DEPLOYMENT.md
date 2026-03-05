# EzSign Production Deployment Guide

## Quick Start

### 1. Server Setup

Any VPS with Docker installed (Ubuntu 22.04+ recommended, minimum 2GB RAM):

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt install docker-compose-plugin
```

### 2. Clone and Configure

```bash
git clone <your-repo-url> /opt/ezsign
cd /opt/ezsign

# Create .env from example
cp .env.example .env
```

Edit `.env` with production values:

```bash
# Required — generate unique secrets
JWT_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)
API_KEY_SECRET=$(openssl rand -base64 32)
WEBHOOK_SECRET=$(openssl rand -base64 32)

# Required — your domain
APP_URL=https://yourdomain.com

# Required — database (change the password!)
DATABASE_NAME=ezsign
DATABASE_USER=ezsign
DATABASE_PASSWORD=<strong-random-password>

# Required — email (example with Resend SMTP)
EMAIL_SMTP_HOST=smtp.resend.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=true
EMAIL_SMTP_USER=resend
EMAIL_SMTP_PASS=re_xxxxxxxxxxxx
EMAIL_FROM_ADDRESS=noreply@yourdomain.com

# Optional — Redis password
REDIS_PASSWORD=<optional-redis-password>
```

### 3. Configure Domain

Edit `Caddyfile` — replace `yourdomain.com` with your actual domain.

Point your domain's DNS A record to your server's IP address.

### 4. Deploy

```bash
# Start all services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Wait for backend to be healthy (~30 seconds)
docker compose ps

# Run database migrations
docker exec ezsign-backend npm run migrate

# Verify
curl https://yourdomain.com/health
```

### 5. Verify

- Visit `https://yourdomain.com` — you should see the login page
- Register a new account
- Check your email for verification link

## Updating

```bash
cd /opt/ezsign
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker exec ezsign-backend npm run migrate
```

## Backups

### Database

```bash
# Manual backup
docker exec ezsign-postgres pg_dump -U ezsign ezsign > backup_$(date +%Y%m%d).sql

# Restore
cat backup.sql | docker exec -i ezsign-postgres psql -U ezsign ezsign
```

### Automated daily backups (add to crontab)

```bash
# crontab -e
0 2 * * * docker exec ezsign-postgres pg_dump -U ezsign ezsign | gzip > /opt/backups/ezsign_$(date +\%Y\%m\%d).sql.gz
# Keep last 7 days
0 3 * * * find /opt/backups -name "ezsign_*.sql.gz" -mtime +7 -delete
```

## Monitoring

```bash
# View logs
docker compose logs -f backend
docker compose logs -f caddy

# Check service health
docker compose ps

# Backend health endpoint
curl https://yourdomain.com/health
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Backend won't start | Check logs: `docker compose logs backend` |
| Database connection errors | Ensure postgres is healthy: `docker compose ps` |
| No emails received | Verify SMTP settings, check backend logs for email errors |
| Certificate errors | Ensure DNS points to server, check Caddy logs |
| 502 Bad Gateway | Backend still starting, wait 30s and retry |

## Cost Estimates

| Provider | Plan | Cost |
|----------|------|------|
| Hetzner CX22 | 2 vCPU, 4GB RAM | ~$5/mo |
| DigitalOcean Basic | 2 vCPU, 2GB RAM | ~$12/mo |
| Railway | Starter | ~$5-15/mo |
| Domain | .com | ~$10-15/yr |
| Resend (email) | Free tier (3k/mo) | Free |
