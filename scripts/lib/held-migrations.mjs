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
 *
 * The registry (since the 2026-07-25 GUARD split) carries TWO arrays: `held` (genuinely
 * unapplied — absent from both the canonical and mirror prod ledgers) and `applied_held`
 * (still carries the DO-NOT-RUN marker on disk, but confirmed already applied on prod). The
 * runtime skip in scripts/db-migrate.mjs always resolves an already-ledgered file via the
 * ledger check BEFORE it ever reaches shouldSkipHeldOnProd(), so `applied_held` membership
 * here is defense-in-depth, not the primary control: if a ledger row were ever missing for
 * one of those files, this union still refuses to re-run it on prod rather than silently
 * applying it a second time. Rule 06 — more protective reading wins.
 * @param {string} migrationsDir absolute path to the db/migrations directory
 * @returns {Set<string>} set of held migration filenames (held + applied_held)
 */
export function loadHeldSet(migrationsDir) {
  const p = path.join(migrationsDir, HELD_REGISTRY_FILENAME);
  const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
  // Union EVERY array section, discovered dynamically — never an explicit list of section names.
  //
  // 2026-07-25: the registry gained a third section, `superseded` (202607790000 — its premise is false on
  // prod; applying it would DUPLICATE a CoA account that already exists for all three entities). With a
  // hardcoded [held, applied_held] union that file silently left the prod-skip set and became an ordinary
  // pending migration, armed to fire on the next deploy and cause exactly that duplication. Adding a section
  // to a JSON file must never be able to arm a migration.
  //
  // Every section here means the same thing to the RUNNER — "never auto-apply on prod". The sections differ
  // only in WHY (not yet applied / already applied / never to be applied), which is reporting, not behaviour.
  // Iterating the object keeps that true for any section added later, without another incident to teach it.
  const files = Object.values(parsed)
    .filter(Array.isArray)
    .flat()
    .map((h) => h?.file)
    .filter(Boolean);
  return new Set(files);
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
