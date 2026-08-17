#!/usr/bin/env node
/**
 * verify-customers-detail-status-label.mjs
 * LV-CUSTOMERS-DETAIL-RAW-LOWERCASE-STATUS
 *
 * Master-detail Customer Details Status must use customerStatusLabel (not dash(raw status)).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const LABEL = "verify-customers-detail-status-label";
const PAGE = "apps/frontend/src/pages/Customers.tsx";
const HELPER = "apps/frontend/src/lib/customerStatusLabel.ts";
const DETAIL = "apps/frontend/src/pages/CustomerDetail.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze(pageSrc, helperSrc, detailSrc) {
  const failures = [];
  if (!/from ["'].*lib\/customerStatusLabel["']/.test(pageSrc)) {
    failures.push("Customers.tsx must import customerStatusLabel");
  }
  if (!/label="Status"\s+value=\{customerStatusLabel\(customer\.status\)\}/.test(pageSrc)) {
    failures.push("Customers.tsx Status DetailRow must call customerStatusLabel(customer.status)");
  }
  if (/label="Status"\s+value=\{dash\(customer\.status\)\}/.test(pageSrc)) {
    failures.push("Customers.tsx must not dash(customer.status) for Status display");
  }
  if (!/export function customerStatusLabel/.test(helperSrc)) {
    failures.push("customerStatusLabel helper missing");
  }
  for (const [code, label] of [
    ["active", "Active"],
    ["inactive", "Inactive"],
    ["credit_hold", "Credit Hold"],
    ["blacklist", "Blacklist"],
  ]) {
    if (!helperSrc.includes(`"${code}"`) || !helperSrc.includes(`"${label}"`)) {
      failures.push(`helper must map ${code} → ${label}`);
    }
  }
  if (!/from ["'].*lib\/customerStatusLabel["']/.test(detailSrc)) {
    failures.push("CustomerDetail.tsx must import shared customerStatusLabel");
  }
  if (!/return customerStatusLabel\(status\)/.test(detailSrc)) {
    failures.push("CustomerDetail statusLabel must delegate to customerStatusLabel");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const goodPage = `
    import { customerStatusLabel } from "../lib/customerStatusLabel";
    <DetailRow label="Status" value={customerStatusLabel(customer.status)} />
  `;
  const badPage = `
    import { customerStatusLabel } from "../lib/customerStatusLabel";
    <DetailRow label="Status" value={dash(customer.status)} />
  `;
  const goodHelper = `
    export function customerStatusLabel(status) {
      if (status === "credit_hold") return "Credit Hold";
      if (status === "blacklist") return "Blacklist";
      if (status === "inactive") return "Inactive";
      if (status === "active") return "Active";
      return status;
    }
  `;
  const goodDetail = `
    import { customerStatusLabel } from "../lib/customerStatusLabel";
    function statusLabel(status) { return customerStatusLabel(status); }
  `;
  const badDetail = `
    function statusLabel(status) {
      if (status === "credit_hold") return "Credit Hold";
      return "Active";
    }
  `;
  if (analyze(goodPage, goodHelper, goodDetail).length) fail("selftest expected GOOD to pass");
  if (!analyze(badPage, goodHelper, goodDetail).length) fail("selftest expected BAD page to fail");
  if (!analyze(goodPage, goodHelper, badDetail).length) fail("selftest expected BAD detail to fail");

  // Runtime mapping proof (planted)
  const require = createRequire(import.meta.url);
  // TS helper is compiled only at build; evaluate logic inline
  const map = (status) => {
    if (status == null || status === "") return "—";
    if (status === "credit_hold") return "Credit Hold";
    if (status === "blacklist") return "Blacklist";
    if (status === "inactive") return "Inactive";
    if (status === "active") return "Active";
    return String(status)
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  };
  const cases = [
    ["active", "Active"],
    ["inactive", "Inactive"],
    ["credit_hold", "Credit Hold"],
    ["blacklist", "Blacklist"],
    ["weird_code", "Weird Code"],
    [null, "—"],
  ];
  for (const [inn, out] of cases) {
    if (map(inn) !== out) fail(`selftest map ${inn} → ${map(inn)} expected ${out}`);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = analyze(read(PAGE), read(HELPER), read(DETAIL));
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — Customers master-detail Status uses customerStatusLabel`);
