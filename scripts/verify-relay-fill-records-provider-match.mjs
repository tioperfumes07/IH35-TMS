#!/usr/bin/env node
// ACCT-F11125 — the Relay fill-record engine (fuel.relay_fill_records) names a fill's truck / driver from Relay's own
// match, and records one product split into same-price lines as one row.
//
// Measured on prod 2026-11-10 (USMCA): the 06:00 CT run refused 3 fills by name every day —
//   txn_2gAW9V27xqzpYB $232.12 "no driver" although Relay matched Vicente Santos (the recorder passed matchedDriverId: null);
//   txn_EE9rkFekb8YWD4 $686.35 "no truck" (no truck on its document / load; the recorder never read Relay's matched truck);
//   txn_8LZfDKWFvFv1oD $40.89 "two DEF lines" — DEF 9.613 gal $38.44 + 0.112 gal $0.45, both 400¢/gal = Relay paid $38.89.
//
// RULE 1 — recordRelayFillAtReceipt reads Relay's matched truck / driver (only one of THIS company) and passes the driver
//          match to resolveFillDriverAtTime; it never passes `matchedDriverId: null` again.
// RULE 2 — the truck chain is document → load → Relay's matched truck.
// RULE 3 — relayFillRowsFromLines merges a repeated product only when both lines carry the same unit price (and gallons);
//          a repeated product at a different price is still refused by name.
import fs from "node:fs";

const REC = "apps/backend/src/fuel/fuel-expense-document.service.ts";
const PLAN = "apps/backend/src/fuel/relay-fill-fuel-rows.ts";

export function audit(files) {
  const out = [];
  const rec = files[REC] ?? "";
  const i = rec.indexOf("export async function recordRelayFillAtReceipt");
  const body = i < 0 ? "" : rec.slice(i, rec.indexOf("\nexport ", i + 10));
  if (!body) out.push("RULE 1: recordRelayFillAtReceipt missing");
  else {
    if (/matchedDriverId:\s*null/.test(body)) out.push("RULE 1: recordRelayFillAtReceipt passes matchedDriverId: null — Relay's own driver match is dropped");
    if (!/matchedDriverId:\s*relayMatch\?\.driver_id/.test(body)) out.push("RULE 1: recordRelayFillAtReceipt no longer passes Relay's matched driver");
    if (!/d\.id = r\.matched_driver_id AND d\.operating_company_id = r\.operating_company_id/.test(body)) out.push("RULE 1: Relay's driver match is not limited to this company's drivers");
    if (!/u\.owner_company_id = r\.operating_company_id OR u\.currently_leased_to_company_id = r\.operating_company_id/.test(body)) out.push("RULE 1: Relay's truck match is not limited to this company's trucks");
    if (!/if \(!unitId\) unitId = relayMatch\?\.unit_id \?\? null;/.test(body)) out.push("RULE 2: the truck chain no longer falls back to Relay's matched truck");
  }
  const plan = files[PLAN] ?? "";
  const j = plan.indexOf("export function relayFillRowsFromLines");
  const pb = j < 0 ? "" : plan.slice(j, plan.indexOf("\nexport ", j + 10));
  if (!pb) out.push("RULE 3: relayFillRowsFromLines missing");
  else {
    if (!/a == null \|\| b == null \|\| a !== b/.test(pb)) out.push("RULE 3: a repeated product merges without requiring the same unit price");
    if (!/"relay_fill_product_repeated"/.test(pb)) out.push("RULE 3: a repeated product at a different price is no longer refused by name");
    if (!/return merged;/.test(pb)) out.push("RULE 3: the merged rows are not what the planner returns");
  }
  return out;
}

const load = () => ({ [REC]: fs.readFileSync(REC, "utf8"), [PLAN]: fs.readFileSync(PLAN, "utf8") });

if (process.argv.includes("--selftest")) {
  const good = load();
  const clean = audit(good);
  if (clean.length) throw new Error("SELFTEST FAIL (live tree should be clean): " + JSON.stringify(clean));
  const plant = (file, from, to) => {
    if (!good[file].includes(from)) throw new Error(`SELFTEST setup broken: '${from}' not in ${file}`);
    return { ...good, [file]: good[file].replace(from, to) };
  };
  const cases = [
    ["driver match dropped", plant(REC, "matchedDriverId: relayMatch?.driver_id ?? null", "matchedDriverId: null")],
    ["driver match any company", plant(REC, "d.id = r.matched_driver_id AND d.operating_company_id = r.operating_company_id", "d.id = r.matched_driver_id")],
    ["truck match any company", plant(REC, "u.owner_company_id = r.operating_company_id OR u.currently_leased_to_company_id = r.operating_company_id", "true")],
    ["truck fallback removed", plant(REC, "if (!unitId) unitId = relayMatch?.unit_id ?? null;", "")],
    ["merge ignores price", plant(PLAN, "a == null || b == null || a !== b", "a == null || b == null")],
    ["planner returns unmerged", plant(PLAN, "return merged;", "return plans;")],
  ];
  let caught = 0;
  for (const [name, files] of cases) {
    if (audit(files).length === 0) throw new Error(`SELFTEST FAIL: planted defect '${name}' went undetected`);
    caught += 1;
  }
  console.log(`verify-relay-fill-records-provider-match: SELFTEST PASS (${caught}/${cases.length} planted defects caught)`);
  process.exit(0);
}

const failures = audit(load());
if (failures.length) {
  console.error("verify-relay-fill-records-provider-match FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-relay-fill-records-provider-match: PASS — Relay's own truck / driver match names a fill; same-price product lines are one row");
