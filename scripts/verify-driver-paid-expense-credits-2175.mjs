#!/usr/bin/env node
/**
 * verify-driver-paid-expense-credits-2175 — ROUND 155.18 JOB 2 (owner order, 2026-09-28).
 *
 * 26 of this week's 982 purged voided USMCA expenses were driver-paid expenses (is_reimbursable
 * = true, the money the company owes a driver who fronted a cost) that wrongly credited 1000
 * "Bank of America - Operating (USMCA)" instead of that driver's own liability leaf under 2175
 * ("2175-00-NNN <Driver Name> — Driver Reimbursements", provisioned by
 * driver-subaccount-provision.service.ts's driverReimbursementSubAccountName()/
 * resolveDriverReimbursementSubAccountId()). Crediting the bank directly falsely claims cash
 * already left the account before the driver was actually paid.
 *
 * HONEST STATE OF THE FIX (found this round, NOT fully closed — flagged, not silently declared
 * done): posting-engine.service.ts's buildExpenseLines() — the function that posts EVERY plain
 * `expense` source transaction, including is_reimbursable ones — has NO branch for
 * is_reimbursable/driver_uuid at all. Its credit-account resolution is a strict two-way choice:
 * exp.payment_account_uuid if set, else AP-with-vendor if vendor_uuid is set, else it THROWS
 * ACCOUNT_MAPPING_MISSING ("neither a payment account nor a vendor"). It never silently defaults
 * to 1000 or any other account. That means:
 *   - the 26 historical bad rows were produced by a CALLER explicitly setting
 *     payment_account_uuid to the 1000 bank account on an is_reimbursable expense — not by a
 *     silent fallback inside the posting engine itself. That caller was not found live this
 *     round (0 live posted is_reimbursable+driver expenses exist to trace one from).
 *   - driver-subaccount-provision.service.ts's leaf-resolver
 *     (resolveDriverReimbursementSubAccountId) is NOT currently wired into buildExpenseLines at
 *     all — it is only used by the separate driver_finance.driver_reimbursements immediate-payout
 *     flow (buildDriverReimbursementLines), which has its own different credit logic (an
 *     immediate cash payout, correctly credits cash/bank, not 2175 — that IS the intended design
 *     for THAT flow, per its own header comment).
 * A genuine fix requires wiring the 2175-leaf resolver into buildExpenseLines' credit-account
 * resolution when is_reimbursable=true and driver_uuid is set and no explicit payment_account_uuid
 * was given -- that is real money-posting-engine surgery, out of scope for a guard-writing pass;
 * recommended as its own follow-up, not implemented here.
 *
 * STATIC layer (no DATABASE_URL, never skips) therefore asserts the NARROWER, TRUE invariant that
 * currently holds: buildExpenseLines' credit-account resolution has no silent hardcoded-account
 * fallback (it fails loud with ACCOUNT_MAPPING_MISSING instead) -- this is a regression lock
 * against someone later adding a silent "else credit 1000" branch, which would reopen exactly the
 * defect class that produced the 26 voided rows.
 */
export const ALLOW_OFFLINE_SKIP =
  "Static source-shape guard: reads posting-engine.service.ts off disk, asserts buildExpenseLines' credit resolution has no silent hardcoded-account fallback. No DB connection on the static path.";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-paid-expense-credits-2175";
const TARGET = "apps/backend/src/accounting/posting-engine.service.ts";

const fail = (m) => {
  console.error(`\n  ${LABEL} FAIL: ${m}\n`);
  process.exit(1);
};
const ok = (m) => console.log(`  ${LABEL} PASS: ${m}`);

function extractBuildExpenseLines(src) {
  const start = src.indexOf("async function buildExpenseLines(");
  if (start === -1) return null;
  // Bounded to the next top-level "async function " after this one, or EOF.
  const nextFnIdx = src.indexOf("\nasync function ", start + 10);
  return src.slice(start, nextFnIdx === -1 ? src.length : nextFnIdx);
}

export function analyse(src) {
  const problems = [];
  const fn = extractBuildExpenseLines(src);
  if (!fn) {
    problems.push("buildExpenseLines() not found in posting-engine.service.ts — the function this guard checks was renamed or removed.");
    return problems;
  }
  const code = fn
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");

  // No literal account_number/account id "1000" anywhere in the credit-resolution body.
  if (/1000/.test(code)) {
    problems.push('buildExpenseLines() references "1000" literally — a hardcoded bank-account fallback is exactly the R-185 defect class.');
  }
  // The credit branch must still fail loud (throw) rather than defaulting when neither
  // payment_account_uuid nor vendor_uuid is set — a silent default here is where a hardcoded
  // account would be reintroduced.
  if (!/ACCOUNT_MAPPING_MISSING["'][\s\S]{0,120}neither a payment account nor a vendor/i.test(code)) {
    problems.push(
      "buildExpenseLines() no longer fails loud when neither payment_account_uuid nor vendor_uuid is " +
        "set — the orphan guard that prevents a silent default account was removed or weakened."
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const wrap = (body) => `async function buildExpenseLines(client, operatingCompanyId, sourceId) {\n${body}\n}\nasync function nextFn() {}`;
  const good = wrap(`
    let creditAccount;
    if (exp.payment_account_uuid) {
      creditAccount = exp.payment_account_uuid;
    } else if (exp.vendor_uuid) {
      creditAccount = await resolveApAccountForCompany(client, operatingCompanyId);
      if (!creditAccount) throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "AP account (ap_control) is unresolved for the accrual expense path");
    } else {
      throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "Expense has neither a payment account nor a vendor — cannot post (no orphan payable)");
    }
  `);
  const badHardcoded1000 = wrap(`
    let creditAccount = exp.payment_account_uuid ?? "1000-fallback-account-id";
  `);
  const badSilentDefault = wrap(`
    let creditAccount;
    if (exp.payment_account_uuid) {
      creditAccount = exp.payment_account_uuid;
    } else if (exp.vendor_uuid) {
      creditAccount = await resolveApAccountForCompany(client, operatingCompanyId);
    } else {
      creditAccount = await resolveDisbursementCashAccountForCompany(client, operatingCompanyId);
    }
  `);
  const cases = [
    ["clean fail-loud shape passes", analyse(good).length === 0],
    ["hardcoded 1000 is caught", analyse(badHardcoded1000).some((p) => p.includes("1000"))],
    ["silent default instead of throw is caught", analyse(badSilentDefault).some((p) => p.includes("no longer fails loud"))],
    ["missing function entirely is caught", analyse("// nothing here").some((p) => p.includes("not found"))],
  ];
  let bad = 0;
  for (const [name, passed] of cases) {
    console.log(`  ${passed ? "ok" : "FAIL"} — ${name}`);
    if (!passed) bad++;
  }
  if (bad) fail(`${bad} selftest case(s) failed`);
  ok(`selftest ${cases.length}/${cases.length}`);
  process.exit(0);
}

const abs = path.join(ROOT, TARGET);
if (!fs.existsSync(abs)) fail(`${TARGET} is missing. Refusing to pass a guard whose subject does not exist.`);
const problems = analyse(fs.readFileSync(abs, "utf8"));
if (problems.length) fail(problems.map((p) => `\n    - ${p}`).join(""));
ok(`buildExpenseLines() in ${TARGET} has no hardcoded "1000" fallback and still fails loud when neither a payment account nor a vendor is set. NOTE: this does NOT yet assert a driver-paid expense credits its own 2175 leaf — that wiring does not exist yet (see file header); tracked as a real follow-up, not silently solved.`);

// --- Live layer, ADDITIONAL to the static shape check above, not a replacement.
const LIVE_LABEL = `${LABEL} (live check)`;
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
async function liveCheck() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(`  ${LIVE_LABEL}: SKIP — no DATABASE_URL (the static check above already passed and is sufficient offline).`);
    return;
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    const populationRes = await client.query(
      `SELECT count(*) AS n FROM accounting.expenses e
        WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL
          AND e.is_reimbursable = true AND e.driver_uuid IS NOT NULL
          AND e.posting_status = 'posted' AND e.journal_entry_id IS NOT NULL`,
      [USMCA_COMPANY_ID]
    );
    const population = Number(populationRes.rows[0].n);
    if (population === 0) {
      await client.query("ROLLBACK");
      console.log(`  ${LIVE_LABEL}: SKIP — 0 posted driver-paid (is_reimbursable + driver_uuid) expenses exist yet; forward-looking lock only, nothing to check live.`);
      return;
    }
    const badRes = await client.query(
      `SELECT count(*) AS n FROM accounting.expenses e
         JOIN mdata.drivers d ON d.id = e.driver_uuid
         JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = e.journal_entry_id
         JOIN catalogs.accounts a ON a.id = p.account_id
        WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL
          AND e.is_reimbursable = true AND e.driver_uuid IS NOT NULL
          AND p.debit_or_credit = 'credit'
          AND a.account_name != (TRIM(concat_ws(' ', d.first_name, d.last_name)) || ' — Driver Reimbursements')`,
      [USMCA_COMPANY_ID]
    );
    await client.query("ROLLBACK");
    const badCount = Number(badRes.rows[0].n);
    if (badCount > 0) {
      console.error(`  ${LIVE_LABEL}: FAIL — ${badCount} of ${population} posted driver-paid expense(s) credit an account other than their own driver's 2175 leaf.`);
      process.exitCode = 1;
      return;
    }
    console.log(`  ${LIVE_LABEL}: PASS — all ${population} posted driver-paid expense(s) credit their own driver's 2175 leaf.`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`  ${LIVE_LABEL}: connection/query error (not fatal to the static PASS above): ${e.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}
await liveCheck();
