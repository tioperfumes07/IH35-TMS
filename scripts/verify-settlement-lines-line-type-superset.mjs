#!/usr/bin/env node
/**
 * verify-settlement-lines-line-type-superset — held migration 202607380000 §5 must keep the live
 * settlement_lines line_type values (escrow / auto_deduction / dispute_adjustment) and add
 * escrow_contribution (TRUE SUPERSET = 12). Prevents the non-superset CHECK that would drop live types.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-lines-line-type-superset";
const MIGRATION =
  "db/migrations/202607380000_settlement_payrun_catalog_and_extends.sql";

const REQUIRED = [
  "'escrow'",
  "'auto_deduction'",
  "'dispute_adjustment'",
  "'escrow_contribution'",
];

function section5(src) {
  const start = src.indexOf("-- ── 5. EXTEND settlement_lines line_type");
  if (start < 0) return null;
  const next = src.indexOf("-- ── 5b.", start + 1);
  return next > start ? src.slice(start, next) : src.slice(start);
}

function assertSuperset(src) {
  const errors = [];
  const sec = section5(src);
  if (!sec) {
    errors.push(`${MIGRATION}: missing §5 EXTEND settlement_lines line_type block`);
    return errors;
  }
  for (const token of REQUIRED) {
    if (!sec.includes(token)) {
      errors.push(`${MIGRATION} §5: missing required line_type ${token}`);
    }
  }
  // Ambiguous single-row SELECT INTO must not return — must loop-drop ALL line_type CHECKs.
  if (/SELECT\s+conname\s+INTO\s+\w+/i.test(sec) && !/FOR\s+\w+\s+IN/i.test(sec)) {
    errors.push(
      `${MIGRATION} §5: must DROP ALL line_type CHECKs via FOR loop (SELECT INTO is ambiguous when two exist)`,
    );
  }
  if (!/FOR\s+\w+\s+IN/i.test(sec)) {
    errors.push(`${MIGRATION} §5: expected FOR … IN loop dropping all line_type CHECK constraints`);
  }
  return errors;
}

function selftest() {
  const good = `
-- ── 5. EXTEND settlement_lines line_type set — TRUE SUPERSET
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.conname FROM pg_constraint c WHERE true LOOP
    NULL;
  END LOOP;
  CHECK (line_type IN ('escrow', 'auto_deduction', 'dispute_adjustment', 'escrow_contribution'));
END $$;
-- ── 5b. WIDEN
`;
  const bad = `
-- ── 5. EXTEND settlement_lines line_type set
DO $$
DECLARE chk text;
BEGIN
  SELECT conname INTO chk FROM pg_constraint;
  CHECK (line_type IN ('earnings', 'escrow_contribution'));
END $$;
-- ── 5b. WIDEN
`;
  const goodErrs = assertSuperset(good);
  if (goodErrs.length) throw new Error(`selftest good failed: ${goodErrs.join("; ")}`);
  const badErrs = assertSuperset(bad);
  if (badErrs.length < 3) {
    throw new Error(`selftest bad expected ≥3 errors, got ${badErrs.length}: ${badErrs.join("; ")}`);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const full = path.join(ROOT, MIGRATION);
  if (!fs.existsSync(full)) {
    console.error(`${LABEL} FAIL: missing ${MIGRATION}`);
    process.exit(1);
  }
  const src = fs.readFileSync(full, "utf8");
  const errors = assertSuperset(src);
  if (errors.length) {
    console.error(`${LABEL} FAIL:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS (${REQUIRED.join(", ")})`);
}

main();
