"use strict";

/**
 * Single source of truth for node-postgres TLS vs plain TCP.
 *
 * - Neon / managed Postgres: require TLS; use `{ rejectUnauthorized: false }` for typical Neon certs.
 * - GitHub Actions postgres service / local Docker on localhost: no TLS. Passing
 *   `ssl: { rejectUnauthorized: false }` still negotiates SSL and fails with
 *   "The server does not support SSL connections".
 *
 * PGSSLMODE=disable or sslmode=disable in the URL forces TLS off. Remote hosts default to TLS on.
 */

function inferPgSslOption(connectionString) {
  if (!connectionString || typeof connectionString !== "string") {
    return { rejectUnauthorized: false };
  }

  let hostname = "";
  let sslmodeFromUrl = "";
  try {
    const normalized = connectionString.trim().replace(/^postgres(ql)?:\/\//i, "http://");
    const u = new URL(normalized);
    hostname = (u.hostname || "").toLowerCase();
    sslmodeFromUrl = (u.searchParams.get("sslmode") || "").toLowerCase();
  } catch {
    return { rejectUnauthorized: false };
  }

  const sslmode = sslmodeFromUrl || String(process.env.PGSSLMODE || "").toLowerCase();

  if (sslmode === "disable") {
    return false;
  }

  const isLoopback =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1";

  const isComposeDefaultHost = hostname === "postgres" || hostname === "db";

  if (isLoopback || isComposeDefaultHost) {
    return false;
  }

  return { rejectUnauthorized: false };
}

function buildPgClientConfig(connectionString, extra = {}) {
  return {
    connectionString,
    ssl: inferPgSslOption(connectionString),
    ...extra,
  };
}

function buildPgPoolConfig(connectionString, extra = {}) {
  return {
    connectionString,
    ssl: inferPgSslOption(connectionString),
    ...extra,
  };
}

module.exports = {
  inferPgSslOption,
  buildPgClientConfig,
  buildPgPoolConfig,
};
