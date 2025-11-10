# Multi-stage Dockerfile for EzSign Backend

# Stage 1: Development
FROM node:20-alpine AS development

WORKDIR /app

# Install build dependencies for native modules (canvas, etc.)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy source code
COPY . .

# Expose port and debugger port
EXPOSE 3001 9229

# Development command (overridden by docker-compose)
CMD ["npm", "run", "dev"]


# Stage 2: Build
FROM node:20-alpine AS build

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Remove devDependencies
RUN npm prune --production


# Stage 3: Production
FROM node:20-alpine AS production

# Install runtime dependencies and dumb-init
RUN apk add --no-cache \
    dumb-init \
    cairo \
    jpeg \
    pango \
    giflib \
    pixman

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files (for metadata)
COPY package*.json ./

# Copy built application and production dependencies from build stage
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules

# Create necessary directories
RUN mkdir -p storage logs && \
    chown -R nodejs:nodejs storage logs

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/server.js"]
