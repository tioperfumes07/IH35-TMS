#!/usr/bin/env node
/**
 * QBO-parity CUSTOMERS guard.
 *
 * Locks the additive QBO/TMS-parity surface added to the Customers module so it can't silently
 * regress (a refactor dropping a tab/column would otherwise pass CI unnoticed):
 *
 *   CustomerDetail.tsx (profile) MUST keep:
 *     - a "Loads" tab (mdata.loads list scoped to the customer, drill-through to the load)
 *     - a "Per-Customer P&L" tab (reuses the getCustomerProfitability report endpoint, scoped)
 *   CustomersListView.tsx (list) MUST keep:
 *     - an "Overdue" column (the promoted heuristic overdue chip — overdue_label)
 *     - a "With open" filter chip (with_open — filters open_balance > 0)
 *
 * Static, DB-free, non-financial (reuses existing endpoints/components only).
 * --selftest exercises assertGuard() against inline good/bad fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-parity-customers";

const TARGETS = [
  {
    file: "apps/frontend/src/pages/CustomerDetail.tsx",
    // Each entry: [needle, human description].
    requires: [
      ['"Loads"', "Loads tab registered in the tabs array"],
      ['"Per-Customer P&L"', "Per-Customer P&L tab registered in the tabs array"],
      ['activeTab === "Loads"', "Loads tab render block"],
      ['activeTab === "Per-Customer P&L"', "Per-Customer P&L tab render block"],
      ["listAllLoads(", "Loads tab exhausts the shared scoped loads endpoint (listAllLoads)"],
      ["getCustomerProfitability(", "P&L tab reuses the existing profitability report endpoint"],
    ],
  },
  {
    file: "apps/frontend/src/pages/customers/CustomersListView.tsx",
    requires: [
      ['label: "Overdue"', "Overdue column present in the list"],
      ["overdue_label", "Overdue column bound to the overdue_label heuristic field"],
      ['id: "with_open", label: "With open"', "With open filter chip present"],
      ['filter === "with_open"', "With open filter predicate wired"],
    ],
  },
];

export function assertGuard({ file, source, requires }) {
  const errors = [];
  for (const [needle, desc] of requires) {
    if (!source.includes(needle)) {
      errors.push(`${file}: missing ${desc} (expected token: ${needle})`);
    }
  }
  return errors;
}

function selftest() {
  const goodDetail = `const tabs = ["Profile","Tasks","Loads","Per-Customer P&L"];
    listAllLoads({ operating_company_id, customer_id: id }); getCustomerProfitability({ operating_company_id });
    {activeTab === "Loads" ? (<x/>) : null}
    {activeTab === "Per-Customer P&L" ? (<y/>) : null}`;
  const goodList = `type FilterChip = "all" | "with_open";
    if (filter === "with_open") return open > 0;
    const chips = [{ id: "with_open", label: "With open" }];
    const cols = [{ key: "overdue_label", label: "Overdue" }];`;
  const cases = [
    { n: "detail good → 0", args: { file: "d", source: goodDetail, requires: TARGETS[0].requires }, want: 0 },
    { n: "list good → 0", args: { file: "l", source: goodList, requires: TARGETS[1].requires }, want: 0 },
    { n: "detail missing Loads tab", args: { file: "d", source: goodDetail.replace('"Loads"', '"Nope"').replace('activeTab === "Loads"', 'activeTab === "Nope"'), requires: TARGETS[0].requires }, min: 1 },
    { n: "detail missing P&L endpoint", args: { file: "d", source: goodDetail.replace("getCustomerProfitability(", "someOtherThing("), requires: TARGETS[0].requires }, min: 1 },
    { n: "detail regresses to one loads page", args: { file: "d", source: goodDetail.replace("listAllLoads(", "listLoads("), requires: TARGETS[0].requires }, min: 1 },
    { n: "list missing Overdue column", args: { file: "l", source: goodList.replace('label: "Overdue"', 'label: "Other"'), requires: TARGETS[1].requires }, min: 1 },
    { n: "list missing With open chip", args: { file: "l", source: goodList.replace('id: "with_open", label: "With open"', 'id: "x", label: "X"'), requires: TARGETS[1].requires }, min: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = assertGuard(c.args).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (failed) { console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

let total = 0;
for (const t of TARGETS) {
  const p = path.join(ROOT, t.file);
  if (!fs.existsSync(p)) { console.error(`[${LABEL}] FAILED — missing ${t.file}`); process.exit(1); }
  const errors = assertGuard({ file: t.file, source: fs.readFileSync(p, "utf8"), requires: t.requires });
  for (const e of errors) console.error(`  ✗ ${e}`);
  total += errors.length;
}
if (total) { console.error(`[${LABEL}] FAILED — ${total} issue(s).`); process.exit(1); }
console.log(`[${LABEL}] OK — Customers module keeps Loads + Per-Customer P&L profile tabs and the list Overdue column + With-open filter.`);
