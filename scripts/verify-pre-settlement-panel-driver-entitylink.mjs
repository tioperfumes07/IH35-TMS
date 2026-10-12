#!/usr/bin/env node
/** Ratchet: pre-settlement panel selected-company read and settlement/driver/load reverse drills. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-pre-settlement-panel-driver-entitylink";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/PreSettlementPanel.tsx");
const source = fs.readFileSync(FILE, "utf8");

export function collectFailures(src = source) {
  const failures = [];
  const requireText = (token, message) => { if (!src.includes(token)) failures.push(message); };
  requireText('queryFn: () => getPreSettlementForDriver(driverId, operatingCompanyId)', "reader must bind canonical driver and selected company");
  requireText('enabled: Boolean(driverId && operatingCompanyId)', "reader must require both scope keys");
  // LEAD 443.107 (2026-10-12) — old rule: the settlement drill named the row by raw settlement.display_id.
  //   new rule: it names it by settlementLabel(settlement) — the canonical settlement naming helper (a real AlwaysTrack
  //             number wins, else the display id) — still bound to the canonical settlement.id.
  //   why: Lead 443.104 ruled PreSettlementPanel uses settlementLabel(...) (the settlement naming law); fb17a4b687 had swapped
  //        it for raw display_id, which this guard then pinned.
  requireText('kind="settlement" id={settlement.id} name={settlementLabel(settlement)}', "settlement drill must bind canonical id and the canonical settlement label");
  requireText('data-testid="pre-settlement-panel-driver-entitylink"', "driver reverse surface must remain mounted");
  requireText('kind="driver"\n              id={settlement.driver_id || driverId}', "driver drill must bind the returned driver with scoped fallback");
  requireText('name={settlement.driver_name ?? null}', "driver drill must resolve the human driver name");
  requireText('kind="load"\n              id={settlement.first_load_id}\n              name={settlement.first_load_number}', "outbound load drill must bind canonical id and number");
  requireText('kind="load"\n              id={settlement.last_load_id}\n              name={settlement.last_load_number}', "return load drill must bind canonical id and number");
  return failures;
}

function main() {
  const failures = collectFailures();
  if (failures.length) {
    for (const failure of failures) console.error(`[${LABEL}] FAIL: ${failure}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] PASS: selected-company producer and settlement/driver/load reverse drills are exact`);
}

function selftest() {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`[${LABEL}] --selftest FAIL: clean baseline red: ${baseline.join("; ")}`);
    process.exit(1);
  }
  const mutations = [
    ['getPreSettlementForDriver(driverId, operatingCompanyId)', 'getPreSettlementForDriver(driverId, "wrong-company")'],
    ['Boolean(driverId && operatingCompanyId)', 'Boolean(driverId)'],
    ['kind="settlement" id={settlement.id} name={settlementLabel(settlement)}', 'kind="settlement" id={driverId} name={settlementLabel(settlement)}'],
    ['kind="settlement" id={settlement.id} name={settlementLabel(settlement)}', 'kind="settlement" id={settlement.id} name={settlement.display_id}'],
    ['data-testid="pre-settlement-panel-driver-entitylink"', 'data-testid="planted-missing"'],
    ['id={settlement.driver_id || driverId}', 'id={settlement.id}'],
    ['name={settlement.driver_name ?? null}', 'name={null}'],
    ['id={settlement.first_load_id}\n              name={settlement.first_load_number}', 'id={settlement.id}\n              name={settlement.first_load_number}'],
    ['id={settlement.last_load_id}\n              name={settlement.last_load_number}', 'id={settlement.id}\n              name={settlement.last_load_number}'],
  ];
  let rejected = 0;
  for (const [needle, replacement] of mutations) {
    if (!source.includes(needle)) {
      console.error(`[${LABEL}] --selftest FAIL: plant target missing: ${needle}`);
      process.exit(1);
    }
    if (collectFailures(source.split(needle).join(replacement)).length) rejected += 1;
  }
  if (rejected !== mutations.length) {
    console.error(`[${LABEL}] --selftest FAIL: rejected ${rejected}/${mutations.length} plants`);
    process.exit(1);
  }
  console.log(`[${LABEL}] --selftest PASS: rejected ${rejected}/${mutations.length} plants without editing runtime files`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
