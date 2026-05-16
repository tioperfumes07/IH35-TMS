import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

const require = createRequire(import.meta.url);

/** Repo root (works from both src/ and dist/ tree depth). */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const impl = require(join(repoRoot, "scripts", "lib", "pg-connection-options.cjs")) as {
  inferPgSslOption: (cs: string) => boolean | { rejectUnauthorized: boolean };
  buildPgClientConfig: (cs: string, extra?: pg.ClientConfig) => pg.ClientConfig;
  buildPgPoolConfig: (cs: string, extra?: pg.PoolConfig) => pg.PoolConfig;
};

export function inferPgSslOption(connectionString: string): boolean | { rejectUnauthorized: boolean } {
  return impl.inferPgSslOption(connectionString);
}

export function buildPgClientConfig(connectionString: string, extra?: pg.ClientConfig): pg.ClientConfig {
  return impl.buildPgClientConfig(connectionString, extra);
}

export function buildPgPoolConfig(connectionString: string, extra?: pg.PoolConfig): pg.PoolConfig {
  return impl.buildPgPoolConfig(connectionString, extra);
}
