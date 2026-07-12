#!/usr/bin/env node
// verify-qbo-minorversion-consistent (0243-h7-2 — vendor runtime hygiene)
//
// Every QuickBooks Online REST call must pin the SAME, current Intuit API minorversion. A stale
// `minorversion=65` on one path (the deep-health `companyinfo` probe) while every other QBO call
// used `minorversion=75` meant the health probe exercised a different API contract than production
// traffic — a health-check that can pass/fail on API behavior the real paths never see. This guard
// asserts NO backend QBO URL pins a minorversion below the canonical MIN (75). Read-only, non-financial.
//
// Root cause fixed: apps/backend/src/admin/health-deep.service.ts probeQboCompanyInfo (65 -> 75).
// LINKAGE: N/A (external-vendor hygiene). Additive-only.
// Self-test: node scripts/verify-qbo-minorversion-consistent.mjs --selftest

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "apps/backend/src");
const CANONICAL_MIN = 75;
const RE = /minorversion=(\d+)/g;

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) acc.push(p);
  }
  return acc;
}

export function scan(text, file) {
  const offenders = [];
  let m;
  RE.lastIndex = 0;
  while ((m = RE.exec(text)) !== null) {
    const v = Number(m[1]);
    if (Number.isFinite(v) && v < CANONICAL_MIN) {
      offenders.push(`${file}: minorversion=${v} (< canonical ${CANONICAL_MIN})`);
    }
  }
  return offenders;
}

export function run() {
  const offenders = [];
  for (const file of walk(SRC)) {
    offenders.push(...scan(fs.readFileSync(file, "utf8"), path.relative(ROOT, file)));
  }
  return offenders;
}

if (process.argv.includes("--selftest")) {
  const bad = scan("a?minorversion=65 b?minorversion=75", "x.ts");
  const good = scan("a?minorversion=75 b?minorversion=80", "x.ts");
  if (bad.length !== 1) throw new Error(`selftest: expected 1 offender, got ${bad.length}`);
  if (good.length !== 0) throw new Error(`selftest: expected 0 offenders, got ${good.length}`);
  console.log("verify-qbo-minorversion-consistent selftest OK");
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const offenders = run();
  if (offenders.length) {
    console.error("verify:qbo-minorversion-consistent FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log("verify:qbo-minorversion-consistent OK — all QBO minorversion pins >= " + CANONICAL_MIN);
}
