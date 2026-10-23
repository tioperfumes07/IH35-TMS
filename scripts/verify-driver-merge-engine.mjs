#!/usr/bin/env node
/**
 * MATRIX-BUILT-OPTIONAL — engine-invariant guard (reference discovery, repoint proof, Owner gate per merge route); no Required
 *   matrix leaf exists for the driver-merge engine, so it claims no Built credit (443.270-C, CC-2).
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
 *   8. AJK-05: the GET preview is read-only (planRepoint SELECTs; READ ONLY transaction)
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
  // AJK-05 (443.113): the GET preview never writes. previewDriverMerge plans with planRepoint (SELECTs only); no dry-run
  // UPDATE + ROLLBACK TO SAVEPOINT; the GET route runs the preview in a READ ONLY transaction.
  const pv = s.slice(s.indexOf("export async function previewDriverMerge"), s.indexOf("export type MergeResult"));
  const plan = s.slice(s.indexOf("export async function planRepoint"), s.indexOf("/** Polymorphic references"));
  if (!/planRepoint\(client, "mdata\.drivers"/.test(pv) || /repointAll\(/.test(pv)) p.push("the merge preview must plan with planRepoint (read-only), never run repointAll");
  if (/\bUPDATE\s+\S+\s+SET\b|\bINSERT\s+INTO\b|\bDELETE\s+FROM\b/i.test(plan) || /SAVEPOINT/.test(plan) || /dryRun/.test(s)) p.push("planRepoint must be SELECTs only (no UPDATE / INSERT / DELETE / savepoint dry run)");
  if (!/SET LOCAL transaction_read_only = on[\s\S]{0,200}previewDriverMerge\(/.test(src.routes)) p.push("GET merge-preview must run the preview in a READ ONLY transaction");
  // 443.270-C (CC-2): two merge routes now (single + merge-all) — EACH handler carries its own Owner gate, so a gate
  // removed from either one fails (one gate anywhere in the file no longer stands in for both).
  const handler = (path) => {
    const at = src.routes.indexOf(`app.post("${path}"`);
    if (at < 0) return "";
    const next = src.routes.indexOf("app.post(", at + 1);
    return src.routes.slice(at, next < 0 ? undefined : next);
  };
  for (const path of ["/api/v1/drivers/:id/merge", "/api/v1/drivers/merge-all"]) {
    if (!/String\(user\.role\) !== "Owner"/.test(handler(path))) p.push(`POST ${path.replace("/api/v1", "")} must be Owner-only`);
  }
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
  if (!problems(m("svc", 'planRepoint(client, "mdata.drivers", m.id, s.id)', 'repointAll(client, "mdata.drivers", m.id, s.id)')).some((x) => /planRepoint/.test(x))) bad.push("AJK-05: a preview running repointAll passed");
  if (!problems(m("svc", "const out: RepointOutcome[] = [];\n  for (const r of await discoverReferences(client, target)) {\n    const ref = `${r.table}.${r.column}`;\n    const has = Number((await client.query(`SELECT count(*)::int AS n FROM ${qi(r.table)} WHERE ${qi(r.column)} = $1::uuid`, [from])).rows[0]?.n ?? 0);\n    if (has === 0) continue;\n    const priv", "const out: RepointOutcome[] = [];\n  for (const r of await discoverReferences(client, target)) {\n    const ref = `${r.table}.${r.column}`;\n    const has = Number((await client.query(`SELECT count(*)::int AS n FROM ${qi(r.table)} WHERE ${qi(r.column)} = $1::uuid`, [from])).rows[0]?.n ?? 0);\n    if (has === 0) continue;\n    await client.query(`UPDATE x SET y = 1`);\n    const priv")).some((x) => /SELECTs only/.test(x))) bad.push("AJK-05: a write inside planRepoint passed");
  if (!problems(m("routes", "SET LOCAL transaction_read_only = on", "SELECT 1")).some((x) => /READ ONLY/.test(x))) bad.push("AJK-05: a writable preview transaction passed");
  if (bad.length) { console.error(`${LABEL} SELFTEST FAILED:\n  - ${bad.join("\n  - ")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST OK — 8/8 (real tree passes; hand list, missing proof, non-owner merge, two vendors, preview running repointAll, a write in planRepoint, writable preview txn each caught)`);
  process.exit(0);
}
if (process.argv.includes("--selftest")) selftest();
const src = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
const p = problems(src);
if (p.length) { console.error(`${LABEL} FAIL\n  - ${p.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL} OK — one in-app merge engine: discovered references, measured repoints, proof of completeness, escrow through the ledger, one driver-vendor, Samsara untouched.`);
