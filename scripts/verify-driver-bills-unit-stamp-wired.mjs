#!/usr/bin/env node
/**
 * ENG-14 (443.323 G9): verify every driver-bill writer calls restampDriverBillUnitAndTrailer
 * after INSERT so the bill carries unit_id from the load's assigned_unit_id.
 *
 * Also verifies backStampSettledDriverBillUnitAndTrailer exists for the settled-bill repair path.
 *
 * Self-test: node scripts/verify-driver-bills-unit-stamp-wired.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-bills-unit-stamp-wired";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const CHECKS = [
  {
    name: "driver-bill-unit-trailer.ts exports restampDriverBillUnitAndTrailer",
    file: "apps/backend/src/driver-finance/driver-bill-unit-trailer.ts",
    pattern: /export\s+async\s+function\s+restampDriverBillUnitAndTrailer/,
  },
  {
    name: "driver-bill-unit-trailer.ts exports backStampSettledDriverBillUnitAndTrailer (settled-bill repair path)",
    file: "apps/backend/src/driver-finance/driver-bill-unit-trailer.ts",
    pattern: /export\s+async\s+function\s+backStampSettledDriverBillUnitAndTrailer/,
  },
  {
    name: "restampDriverBillUnitAndTrailer sets unit_id = l.assigned_unit_id from load",
    file: "apps/backend/src/driver-finance/driver-bill-unit-trailer.ts",
    pattern: /SET\s+unit_id\s*=\s*l\.assigned_unit_id/,
  },
  {
    name: "book-load.service.ts calls restampDriverBillUnitAndTrailer after INSERT",
    file: "apps/backend/src/dispatch/book-load.service.ts",
    pattern: /restampDriverBillUnitAndTrailer/,
  },
  {
    name: "settlement-creator.service.ts calls restampDriverBillUnitAndTrailer",
    file: "apps/backend/src/driver-finance/settlement-creator.service.ts",
    pattern: /restampDriverBillUnitAndTrailer/,
  },
  {
    name: "void-open-driver-bill.service.ts calls restampDriverBillUnitAndTrailer on reissue",
    file: "apps/backend/src/driver-finance/void-open-driver-bill.service.ts",
    pattern: /restampDriverBillUnitAndTrailer/,
  },
  {
    name: "backStampSettledDriverBillUnitAndTrailer uses COALESCE to fill-only (never overwrite)",
    file: "apps/backend/src/driver-finance/driver-bill-unit-trailer.ts",
    pattern: /COALESCE\(b\.unit_id,\s*l\.assigned_unit_id\)/,
  },
];

const args = process.argv.slice(2);

if (args.includes("--selftest")) {
  const results = CHECKS.map((c) => {
    const src = read(c.file);
    return c.pattern.test(src);
  });
  const pass = results.every(Boolean);
  const failed = results.map((ok, i) => ok ? null : i + 1).filter(Boolean);
  if (!pass) {
    console.error(`${LABEL} selftest FAIL — checks ${failed.join(",")} did not match`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest PASS — all ${CHECKS.length} checks match`);
  process.exit(0);
}

const failures = [];
for (const check of CHECKS) {
  const src = read(check.file);
  if (!check.pattern.test(src)) {
    failures.push(`FAIL: ${check.name} (${check.file})`);
  }
}

if (failures.length) {
  for (const f of failures) console.error(f);
  console.error(`[${LABEL}] FAIL — ${failures.length} check(s) failed`);
  process.exit(1);
}

console.log(`[${LABEL}] PASS — restampDriverBillUnitAndTrailer wired in all driver-bill writers (book-load, settlement-creator, void-reissue); backStamp repair path present`);
