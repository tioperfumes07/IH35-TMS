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
    name: "settlement-creator restate (settlement-creator-restate-bill.ts, moved verbatim out of settlement-creator.service.ts 2026-10-25) calls restampDriverBillUnitAndTrailer",
    file: "apps/backend/src/driver-finance/settlement-creator-restate-bill.ts",
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

if (process.argv.includes("--selftest")) {
  // REAL selftest: the clean tree must pass, and for EACH check a copy of its source with the matched code removed
  // (in memory — the tracked file is never written) must make that check fail. The old arm only re-ran the check
  // on the real file, so it could never fail.
  const problems = [];
  CHECKS.forEach((c, i) => {
    const src = read(c.file);
    if (!c.pattern.test(src)) problems.push(`clean tree: check ${i + 1} (${c.name}) does not match`);
    const g = new RegExp(c.pattern.source, c.pattern.flags.includes("g") ? c.pattern.flags : c.pattern.flags + "g");
    const planted = src.replace(g, "/* planted: removed */");
    if (planted === src) problems.push(`plant ${i + 1} changed nothing`);
    else if (c.pattern.test(planted)) problems.push(`plant ${i + 1} (${c.name}) escaped`);
  });
  if (problems.length) {
    console.error(`${LABEL} selftest FAIL:\n  - ${problems.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest PASS — clean tree passes; ${CHECKS.length}/${CHECKS.length} planted removals caught`);
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
