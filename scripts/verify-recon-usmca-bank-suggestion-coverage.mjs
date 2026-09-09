#!/usr/bin/env node
// RECON-USMCA-BANK-01 (owner 2026-09-09) — "raise bank-match suggestion coverage on the 437 live
// USMCA bank transactions" from 109/437 (25%) to >=350/437 (80%+). Achieved 336/437 (76.9%),
// honestly short of 350 -- see the block below for why.
//
// Two parts, static + live:
//   1. STATIC (always runs, no DB needed): the two target engine files
//      (banking-rules.engine.ts, suggestion-engine.ts) and the new bulk-apply route must never
//      write categorized_at / matched_expense_id / matched_bill_id -- suggestion generation only,
//      never categorization. Owner-locked hard rule, checked by construction on every run.
//   2. LIVE (only when DATABASE_DIRECT_URL/DATABASE_URL is reachable AND the specific USMCA company
//      has bank_transactions present -- SKIPPED cleanly on an empty/ephemeral CI database, exactly
//      like every other db-verify-*.mjs script in this repo): re-runs applyBankingRulesForCompany
//      (the REAL production function, not a reimplementation) against the live USMCA transactions,
//      then asserts has_suggestion / total >= COVERAGE_FLOOR.
//
// HONEST NUMBER, NOT THE ASKED-FOR ONE: across two rounds (round 1 pre-merge, round 2 after an
// owner wake-up asking to push further), seeded ~40 new/updated real-vendor-backed banking_rules
// and created one missing real vendor (Dreamline Transit LLC, 28 recurring live occurrences, no
// prior mdata.vendors row). Live coverage rose from 109/437 (25%) to 336/437 (76.9%) -- NOT the
// requested 350/437 (80%), after genuinely exhausting the identifiable-vendor search (re-read
// every remaining unsuggested description twice, found real vendor rows for Sam's Club, H-E-B,
// ED-HER Plastics, American Express, a second Faro Factoring wire direction, a broadened Laura
// Munoz name match, and Bank Of America's own fee/ATM lines). The remaining ~101 lines are genuine
// non-merchant bank-administrative events (Return of Posted Check, Counter Credit, Cashed Check,
// Check Image, Wire Transfer Credit/Hold, ACH Hold -- BofA is processing someone ELSE's money in
// these, not a defensible vendor) or anonymous P2P payments (Zelle/Cash App/Remitly to individuals
// with no mdata.vendors row and no other identifying signal). Inventing a vendor for these to hit
// a number would be exactly the "money theater" this repo's standing law forbids. COVERAGE_FLOOR
// is set as a regression lock comfortably below the honestly-achieved 76.9%, not at the
// originally-requested 80% -- closing that gap for real needs either owner-provided identification
// of the anonymous recipients, or a product decision to count meaningful account-only suggestions
// (excluded today by the task's own has_suggestion definition: suggested_vendor_id OR
// suggested_match_bill_id).
import fs from "node:fs";

const ENGINE_REL = "apps/backend/src/banking/banking-rules.engine.ts";
const SUGGESTION_REL = "apps/backend/src/banking/suggestion-engine.ts";
const ROUTES_REL = "apps/backend/src/banking/p7-wave2.routes.ts";
const USMCA_OPERATING_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const COVERAGE_FLOOR = 0.72; // honest regression lock; achieved 336/437 = 0.769 at write time.

const FORBIDDEN_WRITE_PATTERNS = [
  /SET[\s\S]{0,400}\bcategorized_at\s*=/i,
  /SET[\s\S]{0,400}\bmatched_expense_id\s*=/i,
  /SET[\s\S]{0,400}\bmatched_bill_id\s*=/i,
];

export function auditFile(rel, src) {
  const failures = [];
  for (const re of FORBIDDEN_WRITE_PATTERNS) {
    if (re.test(src)) {
      failures.push(`${rel}: contains a write to a locked column matching ${re} -- suggestion engines must never write categorized_at/matched_expense_id/matched_bill_id`);
    }
  }
  return failures;
}

export function runStatic(root = process.cwd()) {
  const failures = [];
  for (const rel of [ENGINE_REL, SUGGESTION_REL, ROUTES_REL]) {
    let src;
    try {
      src = fs.readFileSync(`${root}/${rel}`, "utf8");
    } catch {
      failures.push(`${rel}: missing`);
      continue;
    }
    failures.push(...auditFile(rel, src));
  }
  if (!fs.existsSync(`${root}/${ENGINE_REL}`) || !/export async function applyBankingRulesForCompany/.test(fs.readFileSync(`${root}/${ENGINE_REL}`, "utf8"))) {
    failures.push(`${ENGINE_REL}: applyBankingRulesForCompany (the bulk suggestion pass) is missing`);
  }
  const routes = fs.existsSync(`${root}/${ROUTES_REL}`) ? fs.readFileSync(`${root}/${ROUTES_REL}`, "utf8") : "";
  if (!/\/api\/v1\/banking\/rules\/bulk-apply/.test(routes)) {
    failures.push(`${ROUTES_REL}: POST /api/v1/banking/rules/bulk-apply is not registered -- applyBankingRulesForCompany is unreachable dead code`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = `
export async function applyBankingRulesForTransaction(client, txnId, operatingCompanyId) {
  await client.query(\`UPDATE banking.bank_transactions SET suggested_vendor_id = $2, suggested_account_id = $3 WHERE id = $1\`, []);
}
export async function applyBankingRulesForCompany(client, operatingCompanyId) {
  return { scanned: 0, matched: 0 };
}
`;
  const goodRoutes = `app.post("/api/v1/banking/rules/bulk-apply", async () => {});`;
  const pass = [...auditFile(ENGINE_REL, good), ...auditFile(ROUTES_REL, goodRoutes)];
  if (pass.length) throw new Error("SELFTEST FAIL (should be clean): " + JSON.stringify(pass));

  const badCategorized = good.replace(
    "SET suggested_vendor_id = $2, suggested_account_id = $3",
    "SET categorized_at = now(), suggested_vendor_id = $2, suggested_account_id = $3"
  );
  if (auditFile(ENGINE_REL, badCategorized).length === 0) throw new Error("SELFTEST FAIL: categorized_at write went undetected");

  const badMatchedExpense = good.replace(
    "SET suggested_vendor_id = $2, suggested_account_id = $3",
    "SET matched_expense_id = $4, suggested_vendor_id = $2, suggested_account_id = $3"
  );
  if (auditFile(ENGINE_REL, badMatchedExpense).length === 0) throw new Error("SELFTEST FAIL: matched_expense_id write went undetected");

  const badMatchedBill = good.replace(
    "SET suggested_vendor_id = $2, suggested_account_id = $3",
    "SET matched_bill_id = $4, suggested_vendor_id = $2, suggested_account_id = $3"
  );
  if (auditFile(ENGINE_REL, badMatchedBill).length === 0) throw new Error("SELFTEST FAIL: matched_bill_id write went undetected");

  console.log("verify-recon-usmca-bank-suggestion-coverage: static SELFTEST PASS (4/4)");
  process.exit(0);
}

const staticFailures = runStatic();
if (staticFailures.length) {
  console.error("verify-recon-usmca-bank-suggestion-coverage FAILED (static):");
  for (const f of staticFailures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-recon-usmca-bank-suggestion-coverage: static OK (suggestion-only, bulk-apply reachable)");

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.log("verify-recon-usmca-bank-suggestion-coverage — SKIPPED live check (no DATABASE_DIRECT_URL/DATABASE_URL)");
  process.exit(0);
}

const { default: pg } = await import("pg");
const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();
try {
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  const present = await client.query(
    `SELECT count(*)::int AS n FROM banking.bank_transactions WHERE operating_company_id = $1::uuid`,
    [USMCA_OPERATING_COMPANY_ID]
  );
  if ((present.rows[0]?.n ?? 0) === 0) {
    console.log("verify-recon-usmca-bank-suggestion-coverage — SKIPPED live check (USMCA bank_transactions not present in this DB)");
    client.release();
    await pool.end();
    process.exit(0);
  }

  const { applyBankingRulesForCompany } = await import("../apps/backend/src/banking/banking-rules.engine.js");
  await client.query("BEGIN");
  const result = await applyBankingRulesForCompany(client, USMCA_OPERATING_COMPANY_ID);
  await client.query("COMMIT");

  const coverage = await client.query(
    `
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE suggested_vendor_id IS NOT NULL OR suggested_match_bill_id IS NOT NULL)::int AS has_suggestion
      FROM banking.bank_transactions
      WHERE operating_company_id = $1::uuid
    `,
    [USMCA_OPERATING_COMPANY_ID]
  );
  const { total, has_suggestion: hasSuggestion } = coverage.rows[0];
  const ratio = total > 0 ? hasSuggestion / total : 0;
  client.release();
  await pool.end();

  console.log(`verify-recon-usmca-bank-suggestion-coverage: re-ran suggestion pass (scanned ${result.scanned}, matched ${result.matched})`);
  console.log(`verify-recon-usmca-bank-suggestion-coverage: has_suggestion ${hasSuggestion}/${total} (${(ratio * 100).toFixed(1)}%), floor ${(COVERAGE_FLOOR * 100).toFixed(0)}%`);
  if (ratio < COVERAGE_FLOOR) {
    console.error(`verify-recon-usmca-bank-suggestion-coverage FAILED (live): coverage ${hasSuggestion}/${total} below floor ${COVERAGE_FLOOR}`);
    process.exit(1);
  }
  console.log("verify-recon-usmca-bank-suggestion-coverage: live OK");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  client.release();
  await pool.end();
  console.error("verify-recon-usmca-bank-suggestion-coverage — ERROR:", err?.message ?? err);
  process.exit(1);
}
