import { createRequire } from "node:module";
import { join } from "node:path";
import type pg from "pg";

import { resolveMonorepoRoot } from "./monorepo-root.js";

const require = createRequire(import.meta.url);

const impl = require(join(resolveMonorepoRoot(import.meta.url), "scripts", "lib", "pg-connection-options.cjs")) as {
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
