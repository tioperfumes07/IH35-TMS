#!/usr/bin/env node
/**
 * Guard: live (non-test) code must not INSERT/UPDATE RETIRE QBO master mirrors.
 *
 * ACCT-ECON-05 / Rule 14 (2026-07-28):
 *   vendors   — CANONICAL = accounting.qbo_vendors; RETIRE = mdata.qbo_vendors
 *               → forbid INSERT/UPDATE mdata.qbo_vendors in live src for *new* primary writers
 *                 is handled by verify-canonical-table-writes shrink-only + ECON-05 inbound guard (1718).
 *               → this guard MUST NOT forbid accounting.qbo_vendors (was inverted; blocked #3723).
 *   accounts/customers — still mid-flight; keep forbidding accounting.qbo_{accounts,customers}
 *               until their dedicated map-flip waves (same defect class as pre-ECON-05 vendors).
 *
 * Allows: comments, test fixtures. Self-test: --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-accounting-qbo-writes";
/** Still-inverted pair until dedicated waves: writing accounting.qbo_* for these is forbidden. */
const ACCOUNTING_RETIRE_STILL = ["accounts", "customers"];
const WRITE_RE = new RegExp(
  String.raw`(?:INSERT\s+INTO|UPDATE)\s+accounting\.qbo_(?:${ACCOUNTING_RETIRE_STILL.join("|")})\b`,
  "i"
);
/** Vendors flipped — writing accounting.qbo_vendors is CANONICAL and must NOT trip this guard. */
const VENDOR_CANONICAL_RE = /(?:INSERT\s+INTO|UPDATE)\s+accounting\.qbo_vendors\b/i;
const SKIP_DIR = new Set(["node_modules", "dist", "coverage", ".git", "__tests__", "tests"]);
const SKIP_FILE_RE = /\.(test|spec)\.(ts|tsx|js|mjs)$|README|\.md$/i;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(ent.name) && !SKIP_FILE_RE.test(ent.name)) out.push(p);
  }
  return out;
}

export function findWrites(files, read = (f) => fs.readFileSync(f, "utf8")) {
  const hits = [];
  for (const f of files) {
    const src = read(f);
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      if (VENDOR_CANONICAL_RE.test(line)) return; // accounting.qbo_vendors is canonical
      if (WRITE_RE.test(line)) hits.push(`${path.relative(ROOT, f)}:${i + 1}: ${trimmed.slice(0, 120)}`);
    });
  }
  return hits;
}

if (process.argv.includes("--selftest")) {
  const allowVendor = findWrites(["x.ts"], () => `INSERT INTO accounting.qbo_vendors (id) VALUES ($1)`);
  const allowMdataVendor = findWrites(["x.ts"], () => `UPDATE mdata.qbo_vendors SET sync_status = 'ok'`);
  const goodAcct = findWrites(["x.ts"], () => `UPDATE mdata.qbo_accounts SET sync_status = 'ok'`);
  const badAcct = findWrites(["x.ts"], () => `UPDATE accounting.qbo_accounts SET sync_status = 'ok'`);
  const badCust = findWrites(["x.ts"], () => `INSERT INTO accounting.qbo_customers (id) VALUES ($1)`);
  if (
    allowVendor.length !== 0 ||
    allowMdataVendor.length !== 0 ||
    goodAcct.length !== 0 ||
    badAcct.length !== 1 ||
    badCust.length !== 1
  ) {
    console.error(`${LABEL} --selftest FAILED`, {
      allowVendor,
      allowMdataVendor,
      goodAcct,
      badAcct,
      badCust,
    });
    process.exit(1);
  }
  console.log(`${LABEL} --selftest — OK (vendors canonical on accounting; accounts/customers still forbid accounting.*)`);
  process.exit(0);
}

const srcRoot = path.join(ROOT, "apps/backend/src");
const hits = findWrites(walk(srcRoot));
if (hits.length) {
  console.error(
    `${LABEL} — FAILED (accounting.qbo_{accounts,customers} writes still present; vendors may write accounting.qbo_vendors):`
  );
  for (const h of hits) console.error(" - " + h);
  process.exit(1);
}
console.log(
  `${LABEL} — OK (no INSERT/UPDATE to accounting.qbo_{accounts,customers}; accounting.qbo_vendors allowed as canonical)`
);
