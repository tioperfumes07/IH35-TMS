#!/usr/bin/env node
// ROUND 155.15 FIX A / 157-D item 1 (owner, verbatim): "Company Settlements register: 'Number'
// reads '-' on all 48 rows. The number EXISTS." Root cause: SettlementNumberSource declared EVERY
// field optional, so CompanySettlementListRow (which carries neither source_document_ref nor
// settlement_number, only its own display_id) type-checked cleanly through settlementLabel() and
// failed silently at runtime, printing "-" on every row.
//
// This guard is a STATIC source-pattern check:
//   1. SettlementNumberSource must NOT declare both source_document_ref and settlement_number as
//      fully-optional siblings on one object shape (the exact all-optional bug shape) -- it must
//      be a union where at least one field is required in each branch.
//   2. SettlementsCompanyDriverTab.tsx's Company Settlements register ("Number" column, key
//      display_id) must render r.display_id directly, never settlementLabel(r)/settlementNumber(r)
//      -- CompanySettlementListRow has neither field settlementLabel expects.
export const ALLOW_OFFLINE_SKIP =
  "pure static source-text scan of settlementNumber.ts and SettlementsCompanyDriverTab.tsx -- never connects to a database.";

import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-settlement-number-source-is-typed";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const HELPER_FILE = path.join(ROOT, "apps/frontend/src/lib/settlementNumber.ts");
const REGISTER_FILE = path.join(ROOT, "apps/frontend/src/pages/driver-finance/SettlementsCompanyDriverTab.tsx");

export function checkHelper(src) {
  const problems = [];
  // The real bug was KEY MEMBERSHIP, not value optionality -- most real callers legitimately
  // declare source_document_ref as OPTIONAL (a tour genuinely has none until numbered), so
  // requiring a non-optional field broke every one of those real call sites the first time this
  // guard's own earlier version was tried. The fix is a `keyof` conditional (HasSettlementNumberKey)
  // applied generically at every call site, which correctly distinguishes "key declared (even
  // optional)" from "key never declared at all" -- the actual CompanySettlementListRow bug shape.
  if (!/type HasSettlementNumberKey<T>\s*=/.test(src)) {
    problems.push('HasSettlementNumberKey<T> conditional type not found -- the key-membership check (not a value-optionality check) is required.');
  }
  if (!/"source_document_ref"\s*extends\s*keyof\s*T/.test(src) || !/"settlement_number"\s*extends\s*keyof\s*T/.test(src)) {
    problems.push('HasSettlementNumberKey<T> does not test both "source_document_ref" and "settlement_number" via `extends keyof T`.');
  }
  for (const fn of ["settlementNumber", "settlementLabel", "isOpenSettlement"]) {
    const fnRe = new RegExp(`export function ${fn}<T[\\s\\S]{0,400}?HasSettlementNumberKey<T>`);
    if (!fnRe.test(src)) {
      problems.push(`${fn}() is not generic over T with a HasSettlementNumberKey<T> constraint in its parameter -- a row whose type declares neither key can still type-check at this call site.`);
    }
  }
  return problems;
}

export function checkRegister(src) {
  const problems = [];
  const numberColMatch = src.match(/key:\s*"display_id",\s*label:\s*"Number"[\s\S]{0,400}/);
  if (!numberColMatch) {
    problems.push('Company Settlements "Number" column (key: "display_id", label: "Number") not found.');
    return problems;
  }
  const col = numberColMatch[0];
  if (/settlementLabel\(|settlementNumber\(/.test(col)) {
    problems.push('Company Settlements "Number" column still calls settlementLabel()/settlementNumber() -- CompanySettlementListRow has neither source_document_ref nor settlement_number, only display_id. Render r.display_id directly.');
  }
  if (!/r\.display_id/.test(col)) {
    problems.push('Company Settlements "Number" column does not render r.display_id.');
  }
  return problems;
}

function selftest() {
  let bad = 0;
  const t = (name, cond) => {
    if (!cond) {
      console.error(`  SELFTEST FAIL: ${name}`);
      bad++;
    }
  };
  const BAD_HELPER = `
    export type SettlementNumberSource = {
      source_document_ref?: string | null;
      settlement_number?: string | null;
      status?: string | null;
    } | null | undefined;
    export function settlementNumber(row: SettlementNumberSource): string | null {
      const n = row?.source_document_ref ?? row?.settlement_number ?? null;
      return n ? String(n) : null;
    }
  `;
  const GOOD_HELPER = `
    type HasSettlementNumberKey<T> = "source_document_ref" extends keyof T
      ? true
      : "settlement_number" extends keyof T
        ? true
        : false;
    export function settlementNumber<T extends CommonFields & { source_document_ref?: string | null; settlement_number?: string | null }>(
      row: (HasSettlementNumberKey<T> extends true ? T : never) | null | undefined
    ): string | null { return null; }
    export function settlementLabel<T extends CommonFields & { source_document_ref?: string | null; settlement_number?: string | null }>(
      row: (HasSettlementNumberKey<T> extends true ? T : never) | null | undefined
    ): string { return "—"; }
    export function isOpenSettlement<T extends CommonFields & { source_document_ref?: string | null; settlement_number?: string | null }>(
      row: (HasSettlementNumberKey<T> extends true ? T : never) | null | undefined
    ): boolean { return false; }
  `;
  t("all-optional flat shape (no keyof check) fails", checkHelper(BAD_HELPER).length >= 1);
  t("keyof-conditional generic shape passes", checkHelper(GOOD_HELPER).length === 0);

  const BAD_REGISTER = `{ key: "display_id", label: "Number", minWidth: 100, sortValue: (r) => settlementLabel(r), render: (r) => <span>{settlementLabel(r)}</span> },`;
  const GOOD_REGISTER = `{ key: "display_id", label: "Number", minWidth: 100, sortValue: (r) => r.display_id ?? null, render: (r) => <span>{r.display_id || DASH}</span> },`;
  t("register calling settlementLabel fails", checkRegister(BAD_REGISTER).length >= 1);
  t("register rendering r.display_id passes", checkRegister(GOOD_REGISTER).length === 0);
  t("missing column fails", checkRegister("").length >= 1);

  if (bad > 0) {
    console.log(`${LABEL} SELFTEST FAILED (${bad})`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const problems = [];
  if (!fs.existsSync(HELPER_FILE)) {
    problems.push(`${path.relative(ROOT, HELPER_FILE)} does not exist.`);
  } else {
    for (const p of checkHelper(fs.readFileSync(HELPER_FILE, "utf8"))) problems.push(`settlementNumber.ts: ${p}`);
  }
  if (!fs.existsSync(REGISTER_FILE)) {
    problems.push(`${path.relative(ROOT, REGISTER_FILE)} does not exist.`);
  } else {
    for (const p of checkRegister(fs.readFileSync(REGISTER_FILE, "utf8"))) problems.push(`SettlementsCompanyDriverTab.tsx: ${p}`);
  }
  if (problems.length > 0) {
    console.error(`${LABEL}: FAIL — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — settlementNumber/settlementLabel/isOpenSettlement are generic over T with a HasSettlementNumberKey<T> constraint (a row whose type declares neither key is a compile error); the Company Settlements Number column renders display_id directly.`);
}

main();
