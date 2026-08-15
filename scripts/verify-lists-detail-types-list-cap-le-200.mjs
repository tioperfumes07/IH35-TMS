#!/usr/bin/env node
/**
 * LST Detail Type list — catalogs listQuerySchema.max(200).
 * DetailTypesListPage must not request limit > 200 (was 500 → live HTTP 400 validation_error).
 *
 * Run: node scripts/verify-lists-detail-types-list-cap-le-200.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lists-detail-types-list-cap-le-200";
const PAGE = path.join(ROOT, "apps/frontend/src/pages/lists/accounting/DetailTypesListPage.tsx");
const SHARED = path.join(ROOT, "apps/backend/src/catalogs/accounting/shared.ts");

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function problems(pageSrc, sharedSrc) {
  const out = [];
  if (!/limit:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)/.test(sharedSrc)) {
    out.push("catalogs accounting listQuerySchema must keep limit.max(200)");
  }
  const capMatch = pageSrc.match(/DETAIL_TYPES_LIST_CAP\s*=\s*(\d+)/);
  if (!capMatch) {
    out.push("DetailTypesListPage must define DETAIL_TYPES_LIST_CAP");
  } else {
    const cap = Number(capMatch[1]);
    if (!(cap >= 1 && cap <= 200)) {
      out.push(`DETAIL_TYPES_LIST_CAP must be 1..200 (got ${cap}) — >200 causes Zod validation_error`);
    }
  }
  if (!/limit:\s*DETAIL_TYPES_LIST_CAP/.test(pageSrc)) {
    out.push("list query must pass limit: DETAIL_TYPES_LIST_CAP");
  }
  if (/limit:\s*500\b/.test(pageSrc)) {
    out.push("DetailTypesListPage must not hardcode limit:500");
  }
  return out;
}

function audit() {
  const pageSrc = fs.readFileSync(PAGE, "utf8");
  const sharedSrc = fs.readFileSync(SHARED, "utf8");
  const errs = problems(pageSrc, sharedSrc);
  if (errs.length) fail(errs.join("; "));
}

if (process.argv.includes("--selftest")) {
  const page = fs.readFileSync(PAGE, "utf8");
  const shared = fs.readFileSync(SHARED, "utf8");
  const ok = problems(page, shared);
  if (ok.length) fail(`selftest baseline red: ${ok.join("; ")}`);
  const broken = page.replace(/DETAIL_TYPES_LIST_CAP\s*=\s*\d+/, "DETAIL_TYPES_LIST_CAP = 500");
  const bad = problems(broken, shared);
  if (!bad.some((m) => /1\.\.200/.test(m) || /limit:500/.test(m))) {
    fail(`selftest: mutated cap=500 must be rejected (got: ${JSON.stringify(bad)})`);
  }
  console.log(`${LABEL} selftest OK`);
  process.exit(0);
}

audit();
console.log(`${LABEL} OK — DetailTypesListPage DETAIL_TYPES_LIST_CAP ≤ 200`);
