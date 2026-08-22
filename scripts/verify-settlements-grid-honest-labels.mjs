#!/usr/bin/env node
/** Ratchet: settlement list/header/dispute/driver reverse drills use exact ids and human labels. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlements-grid-honest-labels";
const paths = {
  table: "apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx",
  header: "apps/frontend/src/pages/driver-finance/components/SettlementHeader.tsx",
  detail: "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx",
  pre: "apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx",
  earnings: "apps/frontend/src/components/drivers/EarningsTab.tsx",
  hub: "apps/frontend/src/pages/accounting/AccountingHubPage.tsx",
  disputes: "apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx",
  disputeList: "apps/frontend/src/pages/drivers/SettlementDisputeList.tsx",
};
const source = Object.fromEntries(Object.entries(paths).map(([key, rel]) => [key, readFileSync(join(ROOT, rel), "utf8")]));
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

export function collectFailures(src = source) {
  const failures = [];
  const code = Object.fromEntries(Object.entries(src).map(([key, text]) => [key, stripComments(text)]));
  const requireMatch = (key, pattern, message) => { if (!pattern.test(code[key])) failures.push(message); };
  const forbid = (key, pattern, message) => { if (pattern.test(code[key])) failures.push(message); };

  forbid("table", /driver_display_id/, "settlement table must not expose UUID-backed driver_display_id");
  requireMatch("table", /kind="driver"[\s\S]{0,100}?id=\{row\.driver_id\}[\s\S]{0,100}?name=\{row\.driver_full_name\}/, "table driver drill must bind row.driver_id to driver_full_name");
  requireMatch("table", /kind="settlement" id=\{row\.id\} name=\{row\.display_id\}/, "table settlement drill must bind row.id to display_id");
  requireMatch("table", /kind="load"[\s\S]{0,80}?id=\{id\}/, "table load-count drill must bind each canonical load id");
  requireMatch("table", /formatDateUS\(row\.period_start\)[\s\S]{0,60}?formatDateUS\(row\.period_end\)/, "table period must format both dates");

  forbid("header", /driverDisplayId|driver_display_id/, "header must not accept UUID-backed driver display ids");
  requireMatch("header", /kind="settlement"[\s\S]{0,80}?id=\{settlementId\}[\s\S]{0,100}?entityLabel\(settlementDisplayId, settlementId, "Settlement"\)/, "header settlement drill must bind settlementId to its human display id");
  requireMatch("header", /kind="driver" id=\{driverId\} label=\{entityLabel\(driverName, driverId, "Driver"\)\}/, "header driver drill must bind driverId to driverName");
  requireMatch("header", /loadIds\.map\([\s\S]{0,180}?kind="load"[\s\S]{0,80}?id=\{load\.id\}[\s\S]{0,100}?entityLabel\(load\.number, load\.id, "Load"\)/, "header load drills must bind each load id to its number");
  requireMatch("header", /formatDateUS\(periodStart\)[\s\S]{0,40}?formatDateUS\(periodEnd\)/, "header period must format both dates");
  forbid("detail", /driverDisplayId\s*=|driver_display_id/, "detail must not pass UUID-backed driver display ids");

  forbid("pre", /driver_display_id/, "pre-settlements must not expose UUID-backed driver_display_id");
  requireMatch("pre", /formatDateUS\(settlement\.period_start\)[\s\S]{0,60}?formatDateUS\(settlement\.period_end\)/, "pre-settlement periods must format both dates");
  requireMatch("earnings", /kind="settlement"[\s\S]{0,80}?id=\{row\.id\}[\s\S]{0,120}?formatDateUS\(row\.period_start\)[\s\S]{0,60}?formatDateUS\(row\.period_end\)/, "driver earnings settlement drill must bind row.id to its formatted period");
  forbid("hub", /driver_display_id/, "accounting hub must not use UUID-backed settlement driver labels");

  requireMatch("disputes", /kind="driver"[\s\S]{0,80}?id=\{row\.driver_id\}[\s\S]{0,100}?entityLabel\(row\.driver_name, row\.driver_id, "Driver"\)/, "dispute grid driver drill must bind row driver id/name");
  requireMatch("disputes", /kind="settlement" id=\{detail\.settlement_id\} label=\{entityLabel\(detail\.settlement_display_id, detail\.settlement_id, "Settlement"\)\}/, "dispute detail settlement drill must bind exact id/display id");
  requireMatch("disputes", /kind="driver" id=\{detail\.driver_id\} label=\{entityLabel\(detail\.driver_name, detail\.driver_id, "Driver"\)\}/, "dispute detail driver drill must bind exact id/name");
  requireMatch("disputeList", /kind="driver"[\s\S]{0,80}?id=\{row\.driver_id\}[\s\S]{0,100}?entityLabel\(row\.driver_name, row\.driver_id, "Driver"\)/, "driver dispute list must bind exact driver id/name");
  requireMatch("disputeList", /kind="settlement"[\s\S]{0,80}?id=\{row\.settlement_id\}[\s\S]{0,120}?entityLabel\(row\.settlement_display_id, row\.settlement_id, "Settlement"\)/, "driver dispute list must bind exact settlement id/display id");
  return failures;
}

function selftest() {
  const baseline = collectFailures();
  if (baseline.length) throw new Error(`clean baseline red: ${baseline.join("; ")}`);
  const mutations = [
    ["table", "id={row.driver_id}", "id={row.id}"],
    ["table", 'kind="settlement" id={row.id}', 'kind="settlement" id={row.driver_id}'],
    ["table", 'kind="load"\n                    id={id}', 'kind="load"\n                    id={row.id}'],
    ["header", "id={settlementId}", "id={driverId}"],
    ["header", 'kind="driver" id={driverId}', 'kind="driver" id={settlementId}'],
    ["header", "id={load.id}", "id={settlementId}"],
    ["earnings", 'kind="settlement"\n        id={row.id}', 'kind="settlement"\n        id={driverId}'],
    ["disputes", "id={row.driver_id}", "id={row.id}"],
    ["disputes", "id={detail.settlement_id}", "id={detail.driver_id}"],
    ["disputes", 'entityLabel(detail.driver_name, detail.driver_id, "Driver")', 'entityLabel(null, detail.settlement_id, "Driver")'],
    ["disputeList", "id={row.driver_id}", "id={row.id}"],
    ["disputeList", "id={row.settlement_id}", "id={row.driver_id}"],
  ];
  let rejected = 0;
  for (const [key, needle, replacement] of mutations) {
    if (!source[key].includes(needle)) throw new Error(`plant target missing in ${key}: ${needle}`);
    const planted = { ...source, [key]: source[key].split(needle).join(replacement) };
    if (collectFailures(planted).length) rejected += 1;
  }
  if (rejected !== mutations.length) throw new Error(`rejected ${rejected}/${mutations.length} plants`);
  console.log(`[${LABEL}] --selftest PASS: rejected ${rejected}/${mutations.length} exact-row plants`);
}

try {
  if (process.argv.includes("--selftest")) selftest();
  else {
    const failures = collectFailures();
    if (failures.length) throw new Error(failures.join("; "));
    console.log(`[${LABEL}] PASS: settlement list/header/dispute/earnings reverse labels bind exact rows`);
  }
} catch (error) {
  console.error(`[${LABEL}] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
