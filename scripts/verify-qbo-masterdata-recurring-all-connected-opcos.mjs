// QBO-TRANSP-RECURRING — Static guard for the recurring QBO master-data (CDC) company selector.
//
// Root cause it locks: listMasterDataCompanyIds() in master-data-sync.service.ts used to
// hard-code codes = ["TRK"] and only add TRANSP behind QBO_MASTERDATA_TRANSP_ENABLED=1. That
// silently dropped TRANSP (which holds the $1.22M A/P) off the recurring schedule — TRK synced
// every 15m while TRANSP last ran 2026-05-17.
//
// The selector must stay ENTITY-INDEPENDENT: every active operating company with an active
// (non-revoked) QBO connection is on the schedule — no hard-coded opco code, no per-opco env flag.
//
// This guard fails if listMasterDataCompanyIds() reintroduces:
//   - a hard-coded company code literal ("TRK" / "TRANSP" / "USMCA"), or
//   - the retired QBO_MASTERDATA_TRANSP_ENABLED flag,
// and requires it to JOIN integrations.qbo_connections (the connected-opco source of truth).

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const target = path.join(repoRoot, "apps/backend/src/qbo/master-data-sync.service.ts");

if (!fs.existsSync(target)) {
  console.error("verify-qbo-masterdata-recurring-all-connected-opcos FAILED: target file missing:", target);
  process.exit(1);
}

const src = fs.readFileSync(target, "utf8");

// Isolate the listMasterDataCompanyIds() function body.
const fnMatch = src.match(/export async function listMasterDataCompanyIds\([\s\S]*?\n}/);
if (!fnMatch) {
  console.error("verify-qbo-masterdata-recurring-all-connected-opcos FAILED:");
  console.error("  Could not locate listMasterDataCompanyIds() — the recurring CDC opco selector.");
  process.exit(1);
}
const fnBody = fnMatch[0];

const failures = [];

// 1. No hard-coded company code literals in the selector.
const codeLiteral = fnBody.match(/["'](TRK|TRANSP|USMCA)["']/);
if (codeLiteral) {
  failures.push(`hard-coded company code literal ${codeLiteral[0]} — the selector must be entity-independent.`);
}

// 2. The retired per-opco env flag must not come back.
if (/QBO_MASTERDATA_TRANSP_ENABLED/.test(fnBody)) {
  failures.push("references QBO_MASTERDATA_TRANSP_ENABLED — that per-opco flag is retired; select all connected opcos instead.");
}

// 3. Must derive the set from active QBO connections.
if (!/integrations\.qbo_connections/.test(fnBody)) {
  failures.push("does not JOIN integrations.qbo_connections — the recurring set must be every opco with an active QBO connection.");
}

if (failures.length > 0) {
  console.error("verify-qbo-masterdata-recurring-all-connected-opcos FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-qbo-masterdata-recurring-all-connected-opcos passed");
