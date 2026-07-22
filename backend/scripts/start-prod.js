#!/usr/bin/env node
'use strict';

/**
 * Production start script.
 *
 * `.node-pg-migraterc` only reads `DATABASE_URL`, but the deploy platform
 * (e.g. Drop) injects discrete `DATABASE_HOST`/`DATABASE_PORT`/`DATABASE_NAME`/
 * `DATABASE_USER`/`DATABASE_PASSWORD` vars instead - without this script,
 * `node-pg-migrate up` would run against no connection string and crash-loop
 * the container. This builds `DATABASE_URL` from the discrete vars when it
 * isn't already set (mirroring the fallback defaults in `src/server.ts`'s
 * `dbConfig`), runs migrations against it (the platform never runs them
 * separately), then starts the compiled server with the same URL available
 * in its environment.
 */

const path = require('path');
const { spawnSync } = require('child_process');

function buildDatabaseUrlFromDiscreteVars() {
  // Mirrors the discrete-var branch defaults in src/server.ts's dbConfig.
  const host = process.env.DATABASE_HOST || 'localhost';
  const port = process.env.DATABASE_PORT || '5432';
  const database = process.env.DATABASE_NAME || 'ezsign';
  const user = process.env.DATABASE_USER || 'ezsign';
  const password = process.env.DATABASE_PASSWORD || 'ezsign_password';

  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  let url = `postgres://${auth}@${host}:${port}/${database}`;

  if (process.env.DATABASE_SSL === 'true') {
    url += '?sslmode=require';
  }

  return url;
}

const databaseUrl = process.env.DATABASE_URL || buildDatabaseUrlFromDiscreteVars();

// Ensure DATABASE_URL is set for the migration subprocess and for the
// server process started below (server.ts prefers DATABASE_URL when set).
process.env.DATABASE_URL = databaseUrl;

const migrate = spawnSync('npx', ['node-pg-migrate', 'up'], {
  env: { ...process.env, DATABASE_URL: databaseUrl },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (migrate.status !== 0) {
  process.exit(migrate.status ?? 1);
}

require(path.join(__dirname, '..', 'dist', 'server.js'));
