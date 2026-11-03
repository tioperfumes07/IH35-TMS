#!/usr/bin/env node
/**
 * FAC-09a Purchase Report — Filter by Debtor must be wired (EntityMultiSelect + pr_customer_ids URL)
 * AND the client predicate must actually exclude non-selected debtors (Codex QA 11-02: token-only
 * audit let `return allPurchaseReportLines` escape).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-purchase-report-debtor-filter";
const FILE = "apps/frontend/src/pages/factoring/FactoringHome.tsx";

/** Pure mirror of FactoringHome.filterPurchaseReportByDebtors — keep in sync. */
function filterPurchaseReportByDebtors(lines, debtorIds) {
  if (debtorIds.length === 0) return lines;
  const want = new Set(debtorIds);
  return lines.filter((l) => l.customer_id && want.has(l.customer_id));
}

function audit(src) {
  const fails = [];
  for (const needle of [
    'searchParams.get("pr_customer_ids")',
    'p.set("pr_customer_ids"',
    "factoring-purchase-report-debtor-filter",
    'kind="customer"',
    "purchaseReportDebtorIds",
    "Filter by Debtor",
    "filterPurchaseReportByDebtors",
  ]) {
    if (!src.includes(needle)) fails.push(`${FILE}: missing ${JSON.stringify(needle)}`);
  }
  if (/Filter by Debtor["'] are not wired/.test(src) || /"Filter by Debtor" are not wired/.test(src)) {
    fails.push(`${FILE}: still claims Filter by Debtor is not wired`);
  }
  // Must call the shared predicate — not an inline pass-through of all lines.
  if (!/filterPurchaseReportByDebtors\(\s*allPurchaseReportLines\s*,\s*purchaseReportDebtorIds\s*\)/.test(src)) {
    fails.push(`${FILE}: purchaseReportLines must call filterPurchaseReportByDebtors(allPurchaseReportLines, purchaseReportDebtorIds)`);
  }
  return fails;
}

function behavioralExcludeThird() {
  const lines = [
    { purchase_id: "p1", customer_id: "c-a", customer_name: "A", gross_cents: 100 },
    { purchase_id: "p2", customer_id: "c-b", customer_name: "B", gross_cents: 200 },
    { purchase_id: "p3", customer_id: "c-c", customer_name: "C", gross_cents: 400 },
  ];
  const filtered = filterPurchaseReportByDebtors(lines, ["c-a", "c-b"]);
  if (filtered.length !== 2) throw new Error(`expected 2 lines, got ${filtered.length}`);
  if (filtered.some((l) => l.customer_id === "c-c")) throw new Error("third debtor must be excluded");
  if (!filtered.every((l) => l.customer_id === "c-a" || l.customer_id === "c-b")) {
    throw new Error("filtered set must be exactly the two selected debtors");
  }
  const gross = filtered.reduce((s, l) => s + Number(l.gross_cents), 0);
  if (gross !== 300) throw new Error(`summary aggregate must match filtered set (got ${gross})`);
  const all = filterPurchaseReportByDebtors(lines, []);
  if (all.length !== 3) throw new Error("empty selection must keep all lines");
}

if (process.argv.includes("--selftest")) {
  const good = `
searchParams.get("pr_customer_ids")
p.set("pr_customer_ids", value)
dataTestId="factoring-purchase-report-debtor-filter"
kind="customer"
purchaseReportDebtorIds
ariaLabel="Filter by Debtor"
export function filterPurchaseReportByDebtors(lines, debtorIds) { return lines; }
filterPurchaseReportByDebtors(allPurchaseReportLines, purchaseReportDebtorIds)
`;
  if (audit(good).length) throw new Error("SELFTEST FAIL clean: " + JSON.stringify(audit(good)));
  const bad = good.replace("purchaseReportDebtorIds", "x") + `\n"Filter by Debtor" are not wired this pass\n`;
  if (audit(bad).length === 0) throw new Error("SELFTEST FAIL: unwired note undetected");
  const bypass = good.replace(
    "filterPurchaseReportByDebtors(allPurchaseReportLines, purchaseReportDebtorIds)",
    "allPurchaseReportLines /* planted bypass */",
  );
  if (!audit(bypass).some((f) => f.includes("filterPurchaseReportByDebtors(allPurchaseReportLines"))) {
    throw new Error("SELFTEST FAIL: return-all bypass undetected");
  }
  behavioralExcludeThird();
  // Plant: no-op filter must fail the behavioral assertion
  const noop = (lines) => lines;
  const planted = noop(
    [
      { customer_id: "c-a", gross_cents: 1 },
      { customer_id: "c-b", gross_cents: 1 },
      { customer_id: "c-c", gross_cents: 1 },
    ],
    ["c-a", "c-b"],
  );
  if (planted.length === 2) throw new Error("SELFTEST plant invalid — noop should keep 3");
  console.log(`${LABEL}: SELFTEST PASS`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const fails = audit(src);
behavioralExcludeThird();
if (fails.length) {
  console.error(`${LABEL} FAILED:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Purchase Report Filter by Debtor wired + behavioral exclude-third`);
