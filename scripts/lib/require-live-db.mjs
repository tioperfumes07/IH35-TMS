#!/usr/bin/env node
// require-live-db.mjs — ROUND 29.9-B owner ruling (2026-09-22): "a live money guard that cannot
// connect is a FAIL, never a pass. This is the law's own 'empty is a question, not an answer.'"
//
// PROOF THIS WAS NOT THEORETICAL: scripts/verify-faro-invoice-lines-load-linkage.mjs is wired in
// money-pr-local-gate.mjs, is a correct check, and asserts zero live faro_invoice_lines with
// load_id IS NULL. Live at the time this was written: 44 of 89 were NULL. A PR appending 70 lines
// passed a gate containing a guard that would have caught it — because that guard silently
// skip-passed (exit 0) when DATABASE_URL was absent, instead of failing.
//
// Dynamic-scanned live 2026-09-22: 192 scripts/verify-*.mjs reference DATABASE_URL. 162 of them
// exited 0 when DATABASE_URL was unset (actually RAN each one with DATABASE_URL deleted from env
// and captured the real exit code — not a static guess). 91 converted to fail-closed in this same
// pass (each individually re-verified the same way); 71 remain, tracked by name in
// scripts/lib/db-skip-baseline.json and enforced by scripts/verify-no-silent-db-skip.mjs (wired as
// gate step 03d) so the count can only shrink, never grow, from here.
//
// USE THIS FOR EVERY NEW verify-*.mjs THAT NEEDS A LIVE DB CONNECTION. Do not write your own
// `if (!process.env.DATABASE_URL) { ...; process.exit(0); }` branch — that IS the anti-pattern
// this file exists to retire.
//
// Usage:
//   import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";
//   const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
//   try { ... } finally { client.release(); await pool.end(); }
//
// The ONE declared exception (owner ruling, narrow and explicit): a script that has NO money/schema
// relevance may pass `allowOfflineSkip: "<one-line reason>"` to skip (exit 0) instead of failing when
// DATABASE_URL is absent. Anything that touches money data may NOT pass this. When declaring it,
// ALSO put `export const ALLOW_OFFLINE_SKIP = "<same reason>";` as a top-level export in the calling
// file — scripts/verify-no-silent-db-skip.mjs looks for that literal export, not just the option
// passed here, so the declaration is visible to a human reading the file's own source, not buried
// inside a function-call argument.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildPgPoolConfig } = require("./pg-connection-options.cjs");

/**
 * @param {{ label: string, allowOfflineSkip?: string }} opts
 * @returns {Promise<{ client: import("pg").PoolClient, pool: import("pg").Pool }>}
 */
export async function requireLiveDbOrExit({ label, allowOfflineSkip } = {}) {
  const pgMod = await import("pg");
  const pg = pgMod.default ?? pgMod;
  const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;

  if (!url) {
    if (allowOfflineSkip) {
      console.log(`${label}: SKIP — no DATABASE_URL. Declared ALLOW_OFFLINE_SKIP: ${allowOfflineSkip}`);
      process.exit(0);
    }
    console.error(
      `${label}: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. ` +
        `A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B owner ruling).`
    );
    process.exit(1);
  }

  const pool = new pg.Pool(buildPgPoolConfig(url, { max: 1 }));
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (allowOfflineSkip) {
      console.log(`${label}: SKIP — could not connect (${msg}). Declared ALLOW_OFFLINE_SKIP: ${allowOfflineSkip}`);
      await pool.end().catch(() => {});
      process.exit(0);
    }
    console.error(`${label}: FAIL — DATABASE_URL is set but the connection failed: ${msg}`);
    await pool.end().catch(() => {});
    process.exit(1);
  }

  return { client, pool };
}
