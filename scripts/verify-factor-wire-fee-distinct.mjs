#!/usr/bin/env node
/**
 * FACT-05 — ACH/wire fee must post to factor_wire_fee, not factor_fee_expense.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factor-wire-fee-distinct";
const SELFTEST = process.argv.includes("--selftest");
const POSTER = path.join(ROOT, "apps/backend/src/accounting/factoring-posting/poster.service.ts");
const MIG = path.join(ROOT, "db/migrations/202609010020_fact_05_factor_wire_fee_role.sql");

function check(poster, mig) {
  const problems = [];
  if (!fs.existsSync(MIG)) problems.push("missing migration 202609010020_fact_05_factor_wire_fee_role.sql");
  if (!/'factor_wire_fee'/.test(mig)) problems.push("migration must widen CHECK to include factor_wire_fee");
  if (!/role:\s*"factor_wire_fee"/.test(poster) && !/role: "factor_wire_fee"/.test(poster)) {
    problems.push("fundingExpectedLegs must emit factor_wire_fee for ACH");
  }
  // Detect collapsed ACH → factor_fee_expense in fundingExpectedLegs
  const collapsed = /if\s*\(opts\.ach\s*>\s*0\)\s*legs\.push\(\{\s*role:\s*"factor_fee_expense"/.test(poster);
  if (collapsed) problems.push("ACH still collapsed onto factor_fee_expense in fundingExpectedLegs");
  if (!/resolveRoleAccount\([^)]*"factor_wire_fee"\)/.test(poster)) {
    problems.push("funding prepare must resolveRoleAccount(..., factor_wire_fee) for ACH");
  }
  return problems;
}

function selftest() {
  const goodPoster = `
    if (opts.ach > 0) legs.push({ role: "factor_wire_fee", debit_or_credit: "debit", amount_cents: opts.ach });
    await resolveRoleAccount(client, opco, "factor_wire_fee");
  `;
  const goodMig = `CHECK (role IN ('factor_fee_expense','factor_wire_fee'))`;
  const badPoster = `
    if (opts.ach > 0) legs.push({ role: "factor_fee_expense", debit_or_credit: "debit", amount_cents: opts.ach });
  `;
  if (check(goodPoster, goodMig).length) throw new Error("compliant flagged");
  if (!check(badPoster, goodMig).length) throw new Error("collapsed ACH not caught");
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (SELFTEST) selftest();

const poster = fs.readFileSync(POSTER, "utf8");
const mig = fs.existsSync(MIG) ? fs.readFileSync(MIG, "utf8") : "";
const problems = check(poster, mig);
if (problems.length) {
  console.error(`[${LABEL}] FAILED:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — ACH/wire uses factor_wire_fee; distinct from factor_fee_expense`);
