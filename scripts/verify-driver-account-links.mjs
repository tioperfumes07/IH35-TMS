#!/usr/bin/env node
// verify-driver-account-links.mjs
// Guard for the per-driver account foundation (HOLD-FOR-JORGE, 2026-07-05). Locks three invariants
// that keep the driver <-> account wiring correct and orphan-free:
//   (a) the per-driver escrow leaf nests under a YEAR-AGNOSTIC "Driver Escrow" sub-parent, which itself
//       nests under top-level "Damage Claim Escrow" (STOP-DECISION #1) — not directly under it;
//   (b) the driver HIRE path STORES both provisioned account ids (escrow -> accounting.escrow_accounts,
//       advance -> driver_finance.driver_advance_accounts) — the orphan bug was discarding them;
//   (c) the escrow leaf NAME carries the hire date, e.g. "(hired MM/DD/YYYY)".
// Static string/AST-lite checks only (no DB). Every bug fix gets a guard so it can't regress.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-account-links";
const errs = [];

const read = (rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { errs.push(`missing file: ${rel}`); return ""; }
  return fs.readFileSync(p, "utf8");
};

const svc = read("apps/backend/src/accounting/driver-subaccount-provision.service.ts");
const routes = read("apps/backend/src/mdata/drivers.routes.ts");
const backfill = read("apps/backend/src/accounting/driver-subaccount-backfill.service.ts");

// (a) year-agnostic "Driver Escrow" sub-parent under "Damage Claim Escrow".
if (!/DRIVER_ESCROW_PARENT_NAME\s*=\s*"Driver Escrow"/.test(svc))
  errs.push('(a) DRIVER_ESCROW_PARENT_NAME must be "Driver Escrow" (year-agnostic sub-parent)');
if (!/DRIVER_ESCROW_GRANDPARENT_NAME\s*=\s*"Damage Claim Escrow"/.test(svc))
  errs.push('(a) DRIVER_ESCROW_GRANDPARENT_NAME must be "Damage Claim Escrow" (top-level)');
// ensureDriverEscrowParent must resolve the grandparent then create the sub-parent UNDER it.
if (!/export async function ensureDriverEscrowParent/.test(svc))
  errs.push("(a) ensureDriverEscrowParent (resolve-or-create the Driver Escrow sub-parent) is missing");
if (!/resolveDriverEscrowParentId/.test(svc))
  errs.push("(a) resolveDriverEscrowParentId (grandparent -> Driver Escrow child) is missing");

// (b) hire path STORES both links.
if (!/upsertDriverAdvanceAccountLink\s*\(/.test(routes))
  errs.push("(b) hire path (drivers.routes.ts) must call upsertDriverAdvanceAccountLink (store the cash-advance account id)");
if (!/upsertDriverEscrowAccountLink\s*\(/.test(routes))
  errs.push("(b) hire path (drivers.routes.ts) must call upsertDriverEscrowAccountLink (store the escrow account id)");
// the upsert helpers must target the two bridge tables.
if (!/INSERT INTO accounting\.escrow_accounts/.test(svc) || !/'driver'/.test(svc) || !/'driver_bond'/.test(svc))
  errs.push("(b) upsertDriverEscrowAccountLink must INSERT INTO accounting.escrow_accounts with holder_type='driver', purpose='driver_bond'");
if (!/INSERT INTO driver_finance\.driver_advance_accounts/.test(svc))
  errs.push("(b) upsertDriverAdvanceAccountLink must INSERT INTO driver_finance.driver_advance_accounts");

// (c) escrow leaf name carries the hire date.
if (!/\(hired \$\{/.test(svc) && !/\(hired /.test(svc))
  errs.push('(c) driverEscrowSubAccountName must embed the hire date, e.g. "(hired MM/DD/YYYY)"');
if (!/function driverEscrowSubAccountName\([^)]*hireDate/.test(svc))
  errs.push("(c) driverEscrowSubAccountName must take a hireDate parameter");

// backfill must also wire the links (so existing drivers are de-orphaned) + pass hire date.
if (!/upsertDriverAdvanceAccountLink/.test(backfill) || !/upsertDriverEscrowAccountLink/.test(backfill))
  errs.push("(b) backfill service must wire BOTH links on apply (de-orphan existing drivers)");

// migration must create the bridge table with FORCED RLS + grants (0065 pattern), no DELETE grant.
const migDir = path.join(ROOT, "db/migrations");
const migFile = fs.readdirSync(migDir).find((f) => /driver_advance_account_link\.sql$/.test(f));
if (!migFile) {
  errs.push("migration db/migrations/*_driver_advance_account_link.sql is missing");
} else {
  const mig = fs.readFileSync(path.join(migDir, migFile), "utf8");
  if (!/CREATE TABLE IF NOT EXISTS driver_finance\.driver_advance_accounts/.test(mig))
    errs.push(`${migFile}: must CREATE TABLE IF NOT EXISTS driver_finance.driver_advance_accounts`);
  if (!/FORCE ROW LEVEL SECURITY/.test(mig))
    errs.push(`${migFile}: must FORCE ROW LEVEL SECURITY (0065 pattern)`);
  if (!/GRANT SELECT, INSERT, UPDATE ON driver_finance\.driver_advance_accounts TO ih35_app/.test(mig))
    errs.push(`${migFile}: must GRANT SELECT, INSERT, UPDATE (no DELETE) to ih35_app`);
  if (/GRANT[^;]*DELETE[^;]*driver_advance_accounts/.test(mig))
    errs.push(`${migFile}: must NOT grant DELETE (void-not-delete via is_active)`);
}

if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — escrow parent year-agnostic, hire path stores both links, hire date in name.`);
