#!/usr/bin/env node
/**
 * verify-customers-detail-tabs-url-sync.mjs — Ops F + AUDIT 2730:
 * Customers master-detail (?tab=) AND CustomerDetail page (?tab=coi|billing|…) sync.
 *
 * FAIL: CustomerDetail only honors tab=billing (deep-link mounts Profile).
 * PASS: CustomerDetail maps all detail tab slugs + writes ?tab= on change.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customers-detail-tabs-url-sync";
const LIST_PAGE = "apps/frontend/src/pages/Customers.tsx";
const DETAIL_PAGE = "apps/frontend/src/pages/CustomerDetail.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function checkList() {
  const source = fs.readFileSync(path.join(ROOT, LIST_PAGE), "utf8");
  for (const needle of [
    "useSearchParams",
    'searchParams.get("tab")',
    "parseCustomerDetailTab",
    'params.set("tab", next)',
  ]) {
    assert(source.includes(needle), `missing ${JSON.stringify(needle)} in ${LIST_PAGE}`);
  }
  assert(!source.includes('useState<CustomerTabId>("transaction_list")'), `local tab useState still present in ${LIST_PAGE}`);
}

function checkDetail() {
  const source = fs.readFileSync(path.join(ROOT, DETAIL_PAGE), "utf8");
  assert(/parseCustomerDetailPageTab/.test(source), `${DETAIL_PAGE} must parse ?tab= via parseCustomerDetailPageTab`);
  assert(/CUSTOMER_DETAIL_TAB_QUERY/.test(source), `${DETAIL_PAGE} must map every CustomerTab to a query slug`);
  assert(/COI:\s*["']coi["']/.test(source), `${DETAIL_PAGE} must map COI → tab=coi`);
  assert(/["']Billing & Receivables["']:\s*["']billing["']/.test(source), `${DETAIL_PAGE} must map Billing → tab=billing`);
  assert(/params\.set\(["']tab["'],\s*slug\)/.test(source), `${DETAIL_PAGE} must write ?tab= on tab change`);
  // Ban billing-only deep-link (the pre-fix defect).
  assert(
    !/if\s*\(\s*searchParams\.get\(["']tab["']\)\s*===\s*["']billing["']\s*\)\s*\{[\s\S]*?setActiveTab\(["']Billing & Receivables["']\)/.test(source),
    `${DETAIL_PAGE} must not only honor tab=billing`,
  );
}

function run() {
  checkList();
  checkDetail();
  console.log(`${LABEL}: PASS`);
}

function selftest() {
  const detailPath = path.join(ROOT, DETAIL_PAGE);
  const original = fs.readFileSync(detailPath, "utf8");
  const broken = original.replace(/COI:\s*["']coi["']/, 'COI: "ignore"');
  fs.writeFileSync(detailPath, broken);
  let failed = false;
  try {
    checkDetail();
  } catch {
    failed = true;
  } finally {
    fs.writeFileSync(detailPath, original);
  }
  assert(failed, "--selftest expected FAIL when COI slug mapping is mutated away");
  run();
  console.log(`${LABEL}: OK — selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
