#!/usr/bin/env node
// verify-no-payroll-settlement-writes.mjs  (G4 — settlement engine collapse)
// The payroll.driver_settlements / payroll.driver_settlement_line_items ledger is RETIRE (superseded by
// canonical driver_finance.*). This guard fails CI when LIVE code (non-.deprecated, non-test) writes
// (INSERT/UPDATE) that ledger. It is a SHRINK-ONLY ratchet: the currently-known dead-branch writers are
// baselined so today stays green; a NEW payroll.* settlement write fails, and the baseline may only
// shrink as the remaining dead branches are retired (a baselined offender that disappears is fine; one
// that reappears after being retired must NOT be re-added). Keys are file+op+table (line-independent).
// Import-safe (exports run(); prints/exits only when invoked directly).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-payroll-settlement-writes";
const SRC = path.join(ROOT, "apps/backend/src");
const BASELINE = path.join(ROOT, "scripts/verify-no-payroll-settlement-writes.baseline.json");

// INSERT INTO / UPDATE  payroll.(driver_settlements | driver_settlement_line_items)
const WRITE_RE = /\b(INSERT\s+INTO|UPDATE)\s+payroll\.(driver_settlements|driver_settlement_line_items)\b/gi;

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp, out);
    else if (/\.ts$/.test(e.name) && !/\.(test|spec)\.ts$/.test(e.name) && !/\.deprecated\.ts$/.test(e.name)) out.push(fp);
  }
}

export function computeOffenders() {
  const files = [];
  if (fs.existsSync(SRC)) walk(SRC, files);
  const keys = new Set();
  for (const fp of files) {
    const rel = path.relative(ROOT, fp).replace(/\\/g, "/");
    const src = fs.readFileSync(fp, "utf8");
    let m;
    WRITE_RE.lastIndex = 0;
    while ((m = WRITE_RE.exec(src))) {
      const op = /INSERT/i.test(m[1]) ? "INSERT" : "UPDATE";
      keys.add(`${rel}::${op} payroll.${m[2]}`);
    }
  }
  return keys;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE)) return null;
  try {
    return new Set(JSON.parse(fs.readFileSync(BASELINE, "utf8")).keys ?? []);
  } catch {
    return null;
  }
}

export function run() {
  const offenders = computeOffenders();
  const baseline = loadBaseline();
  if (!baseline) {
    return [`baseline missing (${path.relative(ROOT, BASELINE)}); run UPDATE_PAYROLL_SETTLEMENT_WRITE_BASELINE=1`];
  }
  return [...offenders].filter((k) => !baseline.has(k)).map((k) => `new payroll.* settlement write (RETIRE ledger): ${k}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  if (process.env.UPDATE_PAYROLL_SETTLEMENT_WRITE_BASELINE === "1") {
    const keys = [...computeOffenders()].sort();
    fs.writeFileSync(
      BASELINE,
      JSON.stringify(
        {
          _comment:
            "G4 (settlement engine collapse). SHRINK-ONLY baseline of remaining dead-branch writers to the RETIRE payroll.* settlement ledger. Regenerate: UPDATE_PAYROLL_SETTLEMENT_WRITE_BASELINE=1. A new key fails CI; this list may only shrink as branches are retired.",
          count: keys.length,
          keys,
        },
        null,
        2
      ) + "\n"
    );
    console.log(`[${LABEL}] baseline written: ${keys.length} known dead-branch payroll.* settlement writers.`);
    process.exit(0);
  }
  const failures = run();
  if (failures.length) {
    console.error(`[${LABEL}] FAILED — ${failures.length} NEW payroll.* settlement write(s):`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.error(`\nThe payroll.driver_settlements / driver_settlement_line_items ledger is RETIRE. Write the`);
    console.error(`canonical driver_finance.* subledger instead (see driver-settlement.service.deprecated.ts map).`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — no NEW writes to the RETIRE payroll.* settlement ledger.`);
}
