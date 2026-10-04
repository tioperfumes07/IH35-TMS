#!/usr/bin/env node
/**
 * Banking home KPI panel — four owner defects measured on main and still missing:
 *   1) 3 KPI rows (`lg:grid-cols-5` → 12 tiles) instead of 2 (`lg:grid-cols-6`)
 *   2) factoring wires vs expected stacked as a variance, not two quantities side by side
 *   3) uncleared computed as abs(in)+abs(out) instead of signed net
 *   4) drill id cells not EntityLink — DRILL_ID_COLUMN_KIND + primary_label, 15 kinds
 *
 * Static. --selftest plants each defect.
 *
 * Usage:
 *   node scripts/verify-banking-home-kpi-owner-now.mjs --selftest
 *   node scripts/verify-banking-home-kpi-owner-now.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-home-kpi-owner-now";
const PANEL = "apps/frontend/src/components/shared/LedgerKpiPanel.tsx";
const SERVICE = "apps/backend/src/banking/banking-kpi.service.ts";
const ENTITY = "apps/frontend/src/components/shared/EntityLink.tsx";

const REQUIRED_KINDS = [
  "factoring_purchase",
  "journal_entry",
  "bank_transaction",
  "invoice",
  "load",
  "customer",
  "factoring_advance",
  "bill",
  "settlement",
  "bank_account",
  "fuel_transaction",
  "expense",
  "vendor",
  "driver",
  "account",
];

function stripComments(src) {
  return String(src ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function findProblems({ panel, service, entity }) {
  const problems = [];
  const p = stripComments(panel);
  const s = stripComments(service);
  const e = String(entity ?? "");

  if (!/lg:grid-cols-6/.test(p)) {
    problems.push(`${PANEL}: missing lg:grid-cols-6 — 12 banking tiles must be two rows, not three`);
  }
  if (/lg:grid-cols-5/.test(p)) {
    problems.push(`${PANEL}: still lg:grid-cols-5 — that is three KPI rows ("3 is too many kpi boxes")`);
  }
  if (!/\bDRILL_ID_COLUMN_KIND\b/.test(p)) {
    problems.push(`${PANEL}: missing DRILL_ID_COLUMN_KIND — drill ids were plain text`);
  }
  if (!/\bprimary_label\b/.test(p)) {
    problems.push(`${PANEL}: missing primary_label — the clickable identity cell`);
  }
  if (!/factoring_wires_vs_expected/.test(p) || !/flex items-baseline justify-between/.test(p)) {
    problems.push(`${PANEL}: factoring wires vs expected is not two quantities side by side`);
  }
  const kinds = [...p.matchAll(/:\s*"(factoring_purchase|journal_entry|bank_transaction|invoice|load|customer|factoring_advance|bill|settlement|bank_account|fuel_transaction|expense|vendor|driver|account)"/g)].map((m) => m[1]);
  const unique = new Set(kinds);
  for (const kind of REQUIRED_KINDS) {
    if (!unique.has(kind)) problems.push(`${PANEL}: DRILL_ID_COLUMN_KIND missing EntityKind ${kind}`);
    if (!new RegExp(`case\\s+"${kind}"\\s*:`).test(e)) {
      problems.push(`${ENTITY}: resolveEntityRoute has no case "${kind}" — that cell 404s`);
    }
  }
  if (unique.size < 15) {
    problems.push(`${PANEL}: DRILL_ID_COLUMN_KIND has ${unique.size} EntityKinds, need 15`);
  }

  // Uncleared must be signed net (is_credit ? +abs : -abs), not sum(abs).
  const unclearedBlock = s.split("cleared_vs_uncleared")[1] ?? "";
  if (!/CASE WHEN b\.is_credit THEN/.test(s) || !/reconciliation_cleared IS NOT TRUE/.test(s)) {
    problems.push(`${SERVICE}: uncleared is not signed net (is_credit ? +abs : -abs)`);
  }
  if (/sum\(\$\{ABS\}\)\s*FILTER\s*\(\s*WHERE b\.reconciliation_cleared IS NOT TRUE\s*\)/.test(s)) {
    problems.push(`${SERVICE}: uncleared still uses abs sum — that printed $1,278,141.34 against a live net`);
  }
  if (/Uncleared \(vs cleared\)/.test(service)) {
    problems.push(`${SERVICE}: still labels Uncleared (vs cleared) — cleared is zero rows, the compare is meaningless`);
  }
  if (/value:\s*num\(w\.r\)\s*-\s*num\(w\.e\)/.test(s)) {
    problems.push(`${SERVICE}: factoring tile still posts the variance instead of wires beside expected`);
  }
  if (!/value:\s*num\(w\.r\),\s*compare_value:\s*num\(w\.e\)/.test(s) && !/value: num\(w\.r\), compare_value: num\(w\.e\)/.test(s)) {
    problems.push(`${SERVICE}: factoring wires must be value=received, compare_value=expected`);
  }
  void unclearedBlock;
  return problems;
}

function loadReal() {
  return {
    panel: fs.readFileSync(path.join(ROOT, PANEL), "utf8"),
    service: fs.readFileSync(path.join(ROOT, SERVICE), "utf8"),
    entity: fs.readFileSync(path.join(ROOT, ENTITY), "utf8"),
  };
}

function selftest() {
  const good = {
    panel: `
      const DRILL_ID_COLUMN_KIND = {
        purchase_id: "factoring_purchase", journal_entry_id: "journal_entry",
        bank_transaction_id: "bank_transaction", invoice_id: "invoice", load_id: "load",
        customer_id: "customer", factoring_advance_id: "factoring_advance", bill_id: "bill",
        settlement_id: "settlement", bank_account_id: "bank_account",
        fuel_transaction_id: "fuel_transaction", expense_id: "expense", vendor_id: "vendor",
        driver_id: "driver", account_id: "account",
      };
      function cell() { return row.primary_label; }
      <div className="lg:grid-cols-6">
      {k.key === "factoring_wires_vs_expected" ? <div className="flex items-baseline justify-between"> : null}
    `,
    service: `
      COALESCE(sum(CASE WHEN b.is_credit THEN abs(b.amount_cents) ELSE -abs(b.amount_cents) END) FILTER (WHERE b.reconciliation_cleared IS NOT TRUE), 0)
      out.push({ key: "cleared_vs_uncleared", label: "Uncleared", value: num(clr.uv) })
      out.push({ key: "factoring_wires_vs_expected", value: num(w.r), compare_value: num(w.e), compare_label: "Expected" })
    `,
    entity: REQUIRED_KINDS.map((k) => `case "${k}":`).join("\n"),
  };

  const cases = [
    { name: "all four owner fixes present", files: good, expectFail: false },
    { name: "three KPI rows (lg:grid-cols-5)", files: { ...good, panel: good.panel.replace("lg:grid-cols-6", "lg:grid-cols-5") }, expectFail: true },
    { name: "missing DRILL_ID_COLUMN_KIND", files: { ...good, panel: good.panel.replace(/DRILL_ID_COLUMN_KIND/g, "LINK_COLUMNS") }, expectFail: true },
    { name: "missing primary_label", files: { ...good, panel: good.panel.replace(/primary_label/g, "display_id") }, expectFail: true },
    { name: "uncleared still abs sum", files: { ...good, service: good.service.replace("CASE WHEN b.is_credit THEN abs(b.amount_cents) ELSE -abs(b.amount_cents) END", "${ABS}") }, expectFail: true },
    { name: "factoring still a variance", files: { ...good, service: good.service.replace("value: num(w.r), compare_value: num(w.e)", "value: num(w.r) - num(w.e), compare_value: num(w.e)") }, expectFail: true },
    { name: "fewer than 15 EntityKinds", files: { ...good, panel: good.panel.replace('driver_id: "driver", account_id: "account",', "") }, expectFail: true },
  ];

  let pass = 0;
  for (const c of cases) {
    const problems = findProblems(c.files);
    const failed = problems.length > 0;
    if (failed === c.expectFail) {
      pass += 1;
      console.log(`ok    ${c.name}`);
    } else {
      console.error(`FAIL  ${c.name} — expected ${c.expectFail ? "FAIL" : "PASS"}, got ${failed ? "FAIL" : "PASS"}`);
      if (problems.length) console.error(`      ${problems.join("\n      ")}`);
    }
  }
  console.log(`\n${LABEL} --selftest: ${pass}/${cases.length} ${pass === cases.length ? "PASS" : "FAIL"}`);
  process.exit(pass === cases.length ? 0 : 1);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = findProblems(loadReal());
  if (problems.length) {
    console.error(`${LABEL} FAIL — ${problems.length} owner Banking-home KPI defect(s) still open:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — two KPI rows, wires beside expected, uncleared is signed net, 15 drill EntityKinds.`);
}

main();
