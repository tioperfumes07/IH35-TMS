#!/usr/bin/env node
/**
 * GUARD: VendorBillForm must keep the operator memo (Gate-B sample tag) in bills.memo.
 *
 * FINDING: LV-SAMPLE-BILL-UNTAGGED-PURGE-ASYMMETRY
 * Root cause: buildMemoContext wrote only chrome metadata (bill_type/tax_rate/…) and the form
 * had no Memo field — so Cascade's USMCA_GATEB_SAMPLE_* never landed on accounting.bills.memo
 * while the matching bill-payment WAS tagged → tag-keyed purge voids payment and leaves A/P.
 *
 * Run:  node scripts/verify-vendor-bill-memo-preserves-operator-tag.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-vendor-bill-memo-preserves-operator-tag";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "apps/frontend/src/components/accounting/VendorBillForm.tsx");

function memoHelperBody(src) {
  const start = src.indexOf("export function buildMemoContext");
  const end = src.indexOf("export function VendorBillForm");
  if (start < 0 || end < 0 || end <= start) return "";
  return src.slice(start, end);
}

function assertForm(src) {
  const problems = [];
  if (!/\boperatorMemo\b/.test(src)) {
    problems.push("missing operatorMemo state / wiring — operator tag has nowhere to live");
  }
  if (!/data-testid=["']vendor-bill-operator-memo["']/.test(src)) {
    problems.push("missing Memo input data-testid=vendor-bill-operator-memo");
  }
  // Call site: shorthand operatorMemo inside buildMemoContext({ ... })
  if (!/buildMemoContext\(\{[\s\S]*?\boperatorMemo\b[\s\S]*?\}\)/.test(src)) {
    problems.push("buildMemoContext call must pass operatorMemo");
  }
  const body = memoHelperBody(src);
  if (!body) {
    problems.push("export function buildMemoContext must sit above VendorBillForm");
  } else {
    if (!/if\s*\(\s*operator\s*\)\s*parts\.push\(\s*operator\s*\)/.test(body)) {
      problems.push("buildMemoContext must prepend trimmed operatorMemo before chrome metadata");
    }
    if (!/bill_type:\$\{opts\.billType\}/.test(body)) {
      problems.push("buildMemoContext still must emit bill_type chrome after the operator memo");
    }
  }
  return problems;
}

function selftest() {
  const good = fs.readFileSync(TARGET, "utf8");
  const badNoField = good
    .replace(/\boperatorMemo\b/g, "UNUSED")
    .replace(/data-testid=["']vendor-bill-operator-memo["']/, 'data-testid="x"');
  const badNoPrepend = good.replace(
    /if \(operator\) parts\.push\(operator\);/,
    "// dropped operator"
  );
  const cases = [
    ["good form passes", good, 0],
    ["missing operatorMemo fails", badNoField, 1],
    ["no prepend fails", badNoPrepend, 1],
  ];
  let failed = 0;
  for (const [name, src, expectMin] of cases) {
    const n = assertForm(src).length;
    const ok = expectMin === 0 ? n === 0 : n >= expectMin;
    if (!ok) {
      console.error(`  FAIL selftest: ${name} (problems=${n}, expected ${expectMin === 0 ? 0 : "≥" + expectMin})`);
      for (const p of assertForm(src)) console.error("   ", p);
      failed++;
    }
  }
  if (failed) {
    console.error(`${LABEL} SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = fs.readFileSync(TARGET, "utf8");
const problems = assertForm(src);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — VendorBillForm Memo field + operatorMemo prepend into bills.memo`);
