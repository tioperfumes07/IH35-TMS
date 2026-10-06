#!/usr/bin/env node
/**
 * GUARD (owner 2026-10-06): duplicate driver profiles merge IN THE APP through ONE engine — one driver-vendor profile per
 * person, many Samsara users allowed — and the engine can never drift back to a hand-written table list.
 *
 * ROOT CAUSE it pins: ops scripts merged drivers with a hand list of ~70 columns; 198 reference a driver (measured
 * 2026-10-06), so references off the list (documents …) stayed on the merged-away record.
 *
 * STATIC
 *   1. references are DISCOVERED from the catalog (pg_constraint FKs + the naming convention) — no hand list
 *   2. every repoint is MEASURED (savepoint; moved / kept_on_survivor / history_kept; anything else refuses)
 *   3. the merge PROVES no writable reference to the merged record remains, or refuses
 *   4. escrow moves through createJournalEntryOnClient + recordEscrowPostingOnly (never a direct balance edit)
 *   5. the driver's vendor folds into the survivor's (one driver-vendor profile)
 *   6. Samsara is never written; mdata.driver_samsara_accounts follows the driver
 *   7. execute is Owner-only; the page exists and the Drivers page links it
 * Run: node scripts/verify-driver-merge-engine.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-merge-engine";
const F = {
  svc: "apps/backend/src/mdata/driver-merge.service.ts",
  routes: "apps/backend/src/mdata/driver-merge.routes.ts",
  drivers: "apps/backend/src/mdata/drivers.routes.ts",
  page: "apps/frontend/src/pages/drivers/DriverDuplicatesPage.tsx",
  list: "apps/frontend/src/pages/Drivers.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
};

export function problems(src) {
  const p = [];
  const s = src.svc;
  if (!/confrelid = \$1::text::regclass/.test(s) || !/column_name ~ \$2/.test(s)) p.push("references must be discovered from the catalog (FKs + naming convention)");
  if (/const\s+FK_TABLES\s*=\s*\[/.test(s)) p.push("a hand-written FK_TABLES list is back — discovery must be the only source");
  if (!/SAVEPOINT merge_ref/.test(s) || !/"kept_on_survivor"/.test(s) || !/"history_kept"/.test(s) || !/driver_merge_repoint_refused/.test(s))
    p.push("repoints must be measured per column (moved / kept_on_survivor / history_kept, anything else refuses)");
  if (!/driver_merge_incomplete/.test(s)) p.push("the merge must prove no writable reference remains, or refuse");
  if (!/deps\.createJournalEntryOnClient\(/.test(s) || !/deps\.recordEscrowPostingOnly\(/.test(s)) p.push("escrow must move through the journal + escrow posting engine");
  if (/UPDATE\s+driver_finance\.escrow_balances/i.test(s)) p.push("escrow balances must not be edited directly (derived view)");
  if (!/driverVendorPlan\(/.test(s) || !/repointAll\(client, "mdata\.vendors"/.test(s)) p.push("the duplicate's driver-vendor must fold into the survivor's vendor");
  if (/UPDATE\s+integrations\.samsara_drivers\s+SET\s+(raw_payload|driver_activation_status)/i.test(s) || /SamsaraClient/.test(s)) p.push("Samsara must never be written by a merge");
  if (!/merged_into_driver_id = \$2::uuid/.test(s)) p.push("the merged record must retire with merged_into_driver_id");
  if (!/String\(user\.role\) !== "Owner"/.test(src.routes) || !/\/api\/v1\/drivers\/:id\/merge"/.test(src.routes)) p.push("POST /drivers/:id/merge must be Owner-only");
  if (!/registerDriverMergeRoutes\(app\)/.test(src.drivers)) p.push("merge routes are not registered");
  if (!/driverMergeApi\.preview\(/.test(src.page) || !/driverMergeApi\.merge\(/.test(src.page)) p.push("the duplicates page must preview before it merges");
  if (!/"\/drivers\/duplicates"/.test(src.manifest) || !/to="\/drivers\/duplicates"/.test(src.list)) p.push("the duplicates page must be routed and linked from Drivers");
  return p;
}

function selftest() {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  const good = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  const m = (k, from, to) => ({ ...good, [k]: good[k].replace(from, to) });
  const bad = [];
  if (problems(good).length) bad.push(`real tree flagged: ${problems(good).join("; ")}`);
  if (!problems(m("svc", "export async function discoverReferences", 'const FK_TABLES = ["x"];\nexport async function discoverReferences')).some((x) => /hand-written/.test(x))) bad.push("a hand list passed");
  if (!problems(m("svc", /driver_merge_incomplete/g, "noop")).some((x) => /prove/.test(x))) bad.push("a merge without the proof passed");
  if (!problems(m("routes", 'String(user.role) !== "Owner"', "false")).some((x) => /Owner-only/.test(x))) bad.push("a non-owner merge passed");
  if (!problems(m("svc", /driverVendorPlan\(/g, "noVendor(")).some((x) => /driver-vendor/.test(x))) bad.push("a merge that leaves two vendors passed");
  if (bad.length) { console.error(`${LABEL} SELFTEST FAILED:\n  - ${bad.join("\n  - ")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST OK — 5/5 (real tree passes; hand list, missing proof, non-owner merge, two vendors each caught)`);
  process.exit(0);
}
if (process.argv.includes("--selftest")) selftest();
const src = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
const p = problems(src);
if (p.length) { console.error(`${LABEL} FAIL\n  - ${p.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL} OK — one in-app merge engine: discovered references, measured repoints, proof of completeness, escrow through the ledger, one driver-vendor, Samsara untouched.`);
