// held-migrations.mjs — the RUNTIME control that makes a HELD migration genuinely
// un-runnable on production.
//
// Background (2026-07-12 incident): #2396's "DO NOT RUN ON PROD" migration
// (202607280000_relay_deposit_classifier.sql) actually EXECUTED on prod — the
// integrations.relay_deposits / relay_company_cards tables were created and the seed
// ran. Root cause: the "held" concept lived ONLY in a SQL comment marker + the
// db/migrations/.held-migrations.json registry + the static consistency guard
// (verify-hold-migrations-registered.mjs). NONE of those are consulted by the actual
// deploy runner (scripts/db-migrate.mjs), which applies every pending on-disk migration
// in filename order. The intended safety — "run on a Neon branch by hand, then
// ledger-backfill so prod db:migrate skips it" — was a manual race the deploy won: the
// preDeploy `npm run db:migrate` reached the held file before any ledger row existed and
// ran it. The marker had no runtime teeth.
//
// This module gives the marker teeth: the runner loads the held registry and, when the
// target is PRODUCTION, refuses to execute any registered held migration (it is skipped,
// never ledgered — it stays honestly "pending" on prod until the owner applies it
// deliberately). Held migrations STILL apply on CI / local / Neon-branch targets so the
// fresh-DB schema stays complete and the owner's hand-apply ceremony keeps working.

import fs from "node:fs";
import path from "node:path";

export const HELD_REGISTRY_FILENAME = ".held-migrations.json";

/**
 * Load the set of held migration filenames from db/migrations/.held-migrations.json.
 * @param {string} migrationsDir absolute path to the db/migrations directory
 * @returns {Set<string>} set of held migration filenames
 */
export function loadHeldSet(migrationsDir) {
  const p = path.join(migrationsDir, HELD_REGISTRY_FILENAME);
  const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
  return new Set((parsed.held || []).map((h) => h.file).filter(Boolean));
}

/**
 * The runtime decision: should this migration be SKIPPED (never executed) by an
 * automated run because it is HELD and the target is production?
 *
 * Truth table:
 *   not in heldSet                          -> false  (normal migration, apply)
 *   held, target NOT prod (CI/local/branch) -> false  (apply — keep fresh-DB schema complete,
 *                                                       and let the owner's Neon-branch ceremony run it)
 *   held, target prod, ceremony flag ON     -> false  (explicit owner-driven prod apply)
 *   held, target prod, no ceremony flag     -> true   (SKIP — the fix; a held migration cannot
 *                                                       silently fire on a prod deploy)
 *
 * The ceremony flag is DELIBERATELY separate from ALLOW_PROD_MIGRATE: normal prod deploys
 * already set ALLOW_PROD_MIGRATE=1 (otherwise every deploy migration would be refused), so
 * reusing it would defeat the control. Only an explicit ALLOW_HELD_PROD_MIGRATE=1 opts in.
 *
 * @param {{file:string, heldSet:Set<string>, isProd:boolean, allowHeldProdMigrate:boolean}} args
 * @returns {boolean}
 */
export function shouldSkipHeldOnProd({ file, heldSet, isProd, allowHeldProdMigrate }) {
  if (!heldSet.has(file)) return false;
  if (!isProd) return false;
  if (allowHeldProdMigrate) return false;
  return true;
}
