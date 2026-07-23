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

/**
 * Platform-injected DATABASE_URLs sometimes carry credentials with raw
 * URL-hostile characters (%, #, spaces, ...) that the WHATWG URL parser -
 * used by pg-connection-string in both node-pg-migrate and pg itself -
 * rejects with ERR_INVALID_URL. When the URL fails to parse, salvage it:
 * split out the userinfo section (on the LAST '@', so passwords containing
 * '@' survive) and percent-encode user and password. Never log the URL or
 * its parts - it is a secret.
 */
function normalizeDatabaseUrl(raw) {
  try {
    new URL(raw);
    return raw;
  } catch {
    // fall through to salvage
  }

  const schemeMatch = raw.match(/^(postgres(?:ql)?:\/\/)/i);
  if (!schemeMatch) {
    console.error(
      'DATABASE_URL is not parseable and does not start with postgres:// - cannot repair it.'
    );
    process.exit(1);
  }

  const scheme = schemeMatch[1];
  const rest = raw.slice(scheme.length);
  const atIdx = rest.lastIndexOf('@');
  if (atIdx === -1) {
    console.error('DATABASE_URL is not a valid URL and has no credentials section to repair.');
    process.exit(1);
  }

  const userinfo = rest.slice(0, atIdx);
  const hostAndPath = rest.slice(atIdx + 1);
  const colonIdx = userinfo.indexOf(':');
  const user = colonIdx === -1 ? userinfo : userinfo.slice(0, colonIdx);
  const password = colonIdx === -1 ? undefined : userinfo.slice(colonIdx + 1);

  const auth =
    encodeURIComponent(user) +
    (password !== undefined ? `:${encodeURIComponent(password)}` : '');
  const repaired = `${scheme}${auth}@${hostAndPath}`;

  try {
    new URL(repaired);
  } catch {
    console.error(
      'DATABASE_URL could not be repaired by percent-encoding its credentials - fix it at the source.'
    );
    process.exit(1);
  }

  console.log('DATABASE_URL required normalization (percent-encoded credentials).');
  return repaired;
}

const databaseUrl = normalizeDatabaseUrl(
  process.env.DATABASE_URL || buildDatabaseUrlFromDiscreteVars()
);

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
