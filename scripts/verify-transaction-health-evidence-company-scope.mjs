#!/usr/bin/env node
/**
 * SYS-F7440 — Transaction Health evidence reads preserve each register row's
 * operating company. Owner sessions can see every active company, so RLS is not
 * a substitute for source, posting, label, and shared-driver predicates.
 *
 * Self-test: node scripts/verify-transaction-health-evidence-company-scope.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/system/transaction-health-evidence.ts";
const source = fs.readFileSync(path.join(ROOT, FILE), "utf8");

const anchors = [
  ["row company set", "const companyIds = [...new Set(rows.map((row) => row.operating_company_id))];"],
  ["source posting scope", "p.operating_company_id = ANY($3::uuid[])"],
  ["journal-entry posting scope", "p.operating_company_id = ANY($2::uuid[])"],
  ["posting account scope", "a.operating_company_id = p.operating_company_id"],
  ["expense source scope", "e.operating_company_id = ANY($2::uuid[])"],
  ["expense posting scope", "p.operating_company_id = e.operating_company_id"],
  ["settlement source scope", "s.operating_company_id = ANY($2::uuid[])"],
  ["settlement posting scope", "p.operating_company_id = s.operating_company_id"],
  ["factoring source scope", "fb.operating_company_id = ANY($2::uuid[])"],
  ["factoring invoice scope", "fi.operating_company_id = fb.operating_company_id"],
  ["factoring advance scope", "fa.operating_company_id = fi.operating_company_id"],
  ["factoring posting scope", "p.operating_company_id = fa.operating_company_id"],
  ["invoice source scope", "i.operating_company_id = ANY($2::uuid[])"],
  ["invoice customer scope", "c.operating_company_id = i.operating_company_id"],
  ["bill source scope", "b.operating_company_id = ANY($2::uuid[])"],
  ["bill vendor scope", "v.operating_company_id = b.operating_company_id"],
  ["bill-payment source scope", "bp.operating_company_id = ANY($2::uuid[])"],
  ["bill-payment bill scope", "b.operating_company_id = bp.operating_company_id"],
  ["customer-payment source scope", "py.operating_company_id = ANY($2::uuid[])"],
  ["customer-payment customer scope", "c.operating_company_id = py.operating_company_id"],
  ["expense vendor scope", "v.operating_company_id = e.operating_company_id"],
  ["expense load scope", "l.operating_company_id = e.operating_company_id"],
  ["expense driver home scope", "d.operating_company_id = e.operating_company_id"],
  ["expense shared-driver authorization", "txh_expense_dca.company_id = e.operating_company_id"],
  ["expense shared-driver active", "txh_expense_dca.deactivated_at IS NULL"],
  ["factoring vendor scope", "v.operating_company_id = fb.operating_company_id"],
  ["settlement bill scope", "b.operating_company_id = s.operating_company_id"],
  ["settlement driver home scope", "d.operating_company_id = s.operating_company_id"],
  ["settlement shared-driver authorization", "txh_settlement_dca.company_id = s.operating_company_id"],
  ["settlement shared-driver active", "txh_settlement_dca.deactivated_at IS NULL"],
  ["GL helper receives company set", "loadSourceTypeGl(client, sourceTypes, sourceIds, companyIds)"],
  ["JE helper receives company set", "loadJeGl(client, idsOf(rows, \"journal_entry\"), companyIds)"],
  ["expense helper receives company set", "loadExpenseGl(client, idsOf(rows, \"expense\"), companyIds)"],
  ["settlement helper receives company set", "loadSettlementGl(client, idsOf(rows, \"settlement\"), companyIds)"],
  ["factoring helper receives company set", "loadFactoringGl(client, idsOf(rows, \"factoring_batch\"), companyIds)"],
];

function failures(text) {
  return anchors.filter(([, anchor]) => !text.includes(anchor)).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const baseline = failures(source);
  if (baseline.length) {
    console.error(`FAIL baseline: ${baseline.join(", ")}`);
    process.exit(1);
  }
  let caught = 0;
  for (const [name, anchor] of anchors) {
    const mutated = source.split(anchor).join(`/* planted ${name} regression */`);
    if (mutated === source) {
      console.error(`FAIL mutation anchor absent: ${name}`);
      process.exit(1);
    }
    if (failures(mutated).includes(name)) caught += 1;
    else console.error(`FAIL mutation escaped: ${name}`);
  }
  if (caught !== anchors.length) process.exit(1);
  console.log(`PASS selftest: ${caught}/${anchors.length} company-scope mutations caught`);
  process.exit(0);
}

const missing = failures(source);
if (missing.length) {
  console.error(`FAIL ${FILE}: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`PASS ${FILE}: ${anchors.length} company-scope and shared-driver anchors`);
