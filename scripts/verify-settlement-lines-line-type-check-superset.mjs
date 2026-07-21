#!/usr/bin/env node
// GUARD (Rule 16 / Rule 17): held migration 202607380000 MUST rewrite
// driver_finance.settlement_lines.line_type as a TRUE LIVE SUPERSET — keep all 11 live tokens
// and ADD only escrow_contribution. Also requires a multi-constraint DROP loop (live has two
// line_type CHECKs). Pre-fix drafts narrowed the set (omitted escrow / auto_deduction /
// dispute_adjustment) and dropped only one constraint.
//
// Run: node scripts/verify-settlement-lines-line-type-check-superset.mjs [--selftest]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const MIGRATION = "db/migrations/202607380000_settlement_payrun_catalog_and_extends.sql";

/** Live prod line_type tokens (br-fancy-credit-akjnd07a, verified 2026-07-21) + escrow_contribution. */
const REQUIRED_LINE_TYPES = [
  "earnings",
  "extra_pay",
  "reimbursement",
  "deduction",
  "advance_recovery",
  "escrow",
  "abandonment_chargeback",
  "team_split_primary",
  "team_split_secondary",
  "auto_deduction",
  "dispute_adjustment",
  "escrow_contribution",
];

/**
 * Extract the IN-list tokens from settlement_lines_line_type_chk_payrun CHECK (...).
 * @param {string} source
 * @returns {Set<string>|null}
 */
function extractPayrunLineTypeInList(source) {
  const m = source.match(
    /settlement_lines_line_type_chk_payrun\s+CHECK\s*\(\s*line_type\s+IN\s*\(([\s\S]*?)\)\s*\)/i,
  );
  if (!m) return null;
  return new Set(Array.from(m[1].matchAll(/'([a-z_]+)'/g)).map((x) => x[1]));
}

function hasMultiConstraintDropLoop(source) {
  // Must drop ALL line_type CHECKs (live has two), not a single SELECT conname INTO.
  const hasForLoop =
    /FOR\s+\w+\s+IN[\s\S]*?pg_constraint[\s\S]*?line_type[\s\S]*?DROP CONSTRAINT/i.test(source);
  const hasSingleSelectInto =
    /SELECT\s+conname\s+INTO[\s\S]*?line_type[\s\S]*?DROP CONSTRAINT/i.test(source);
  return hasForLoop && !hasSingleSelectInto;
}

function missingFrom(setLike, required) {
  return required.filter((r) => !setLike.has(r));
}

function selftest() {
  const goodIn = REQUIRED_LINE_TYPES.map((t) => `'${t}'`).join(", ");
  const good = `
    FOR r IN SELECT c.conname FROM pg_constraint c WHERE pg_get_constraintdef(c.oid) ILIKE '%line_type%' LOOP
      EXECUTE format('ALTER TABLE driver_finance.settlement_lines DROP CONSTRAINT %I', r.conname);
    END LOOP;
    ADD CONSTRAINT settlement_lines_line_type_chk_payrun CHECK (
      line_type IN (${goodIn})
    );
  `;
  const narrowed = `
    SELECT conname INTO chk FROM pg_constraint WHERE pg_get_constraintdef(oid) ILIKE '%line_type%';
    EXECUTE format('ALTER TABLE driver_finance.settlement_lines DROP CONSTRAINT %I', chk);
    ADD CONSTRAINT settlement_lines_line_type_chk_payrun CHECK (
      line_type IN ('earnings', 'extra_pay', 'reimbursement', 'deduction', 'abandonment_chargeback',
        'team_split_primary', 'team_split_secondary', 'advance_recovery', 'escrow_contribution')
    );
  `;
  const failures = [];
  const goodSet = extractPayrunLineTypeInList(good);
  if (!goodSet || missingFrom(goodSet, REQUIRED_LINE_TYPES).length !== 0) {
    failures.push("detector missed a complete live-superset IN-list");
  }
  if (!hasMultiConstraintDropLoop(good)) {
    failures.push("detector did not accept a FOR-loop multi-constraint drop");
  }
  const badSet = extractPayrunLineTypeInList(narrowed);
  if (!badSet || missingFrom(badSet, REQUIRED_LINE_TYPES).length === 0) {
    failures.push("detector did not flag a narrowed IN-list");
  }
  if (hasMultiConstraintDropLoop(narrowed)) {
    failures.push("detector did not reject single SELECT INTO drop");
  }
  if (extractPayrunLineTypeInList("no check here") !== null) {
    failures.push("detector did not report an unparseable file");
  }
  if (failures.length > 0) {
    console.error("verify-settlement-lines-line-type-check-superset SELFTEST FAILED:");
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log("verify-settlement-lines-line-type-check-superset selftest passed");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const migAbs = path.join(ROOT, MIGRATION);
  if (!fs.existsSync(migAbs)) {
    console.error(`verify-settlement-lines-line-type-check-superset: migration missing: ${MIGRATION}`);
    process.exit(1);
  }
  const source = fs.readFileSync(migAbs, "utf8");

  if (!hasMultiConstraintDropLoop(source)) {
    console.error(
      "verify-settlement-lines-line-type-check-superset FAILED: 202607380000 must DROP ALL line_type CHECKs via a FOR loop (live has multiple); single SELECT INTO is forbidden",
    );
    process.exit(1);
  }

  const inList = extractPayrunLineTypeInList(source);
  if (!inList) {
    console.error(
      "verify-settlement-lines-line-type-check-superset FAILED: could not parse settlement_lines_line_type_chk_payrun IN-list",
    );
    process.exit(1);
  }
  const missing = missingFrom(inList, REQUIRED_LINE_TYPES);
  if (missing.length > 0) {
    console.error(
      `verify-settlement-lines-line-type-check-superset FAILED: IN-list missing live-superset tokens: ${missing.join(", ")}`,
    );
    process.exit(1);
  }

  console.log(
    `verify-settlement-lines-line-type-check-superset passed (${REQUIRED_LINE_TYPES.length} required line_types present; multi-constraint drop loop OK)`,
  );
}

main();
