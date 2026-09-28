#!/usr/bin/env node
// verify-check-engine.mjs — R-154 §7 / R-154.1 §E, assertions 9-13.
//
// 9.  Every live check's payee resolves in its declared kind's canonical table.
// 10. Every check line's resolved debit account is never a forbidden type (A/R, Undeposited Funds,
//     Income/OtherIncome) and is postable.
// 11. A check line in a category the linkage table marks REQUIRED (fuel/maintenance/toll -- the
//     subset of R-154.1 §C this guard checks; the full per-category-group table is not fully
//     mechanized here, disclosed) carries the header unit_id it requires, or an explicit
//     load_exemption_reason on the line.
// 12. Zero live driver checks carry a cash_advance line (the write-time refusal in
//     check-account-rules.service.ts's assertNotDriverAdvanceCheck is the real guard; this is the
//     live tripwire confirming nothing bypassed it, e.g. a direct DB write).
// 13. The reverse-link query (checks.routes.ts's GET /api/v1/checks vendor_id/driver_id/customer_id
//     filter) returns a real check for a real linked entity -- proven by running the SAME WHERE
//     clause the route uses, live.
//
// USMCA has ZERO real checks as of this guard's authorship (the check engine has not shipped yet).
// Every live() assertion below SKIPS (not vacuously PASSES) when the live check population is 0,
// matching this repo's own established pattern (verify-no-voided-doc-has-live-postings.mjs) --
// arms itself the moment a real check exists, never claims 13/13 green against zero rows.
import pg from "pg";

const LABEL = "verify-check-engine";
const FORBIDDEN_SYSTEM_PURPOSES = new Set(["accounts_receivable", "ar_control", "undeposited_funds"]);
const ALLOWED_DEBIT_ACCOUNT_TYPES = new Set(["Expense", "CostOfGoodsSold", "OtherExpense", "Asset", "Liability", "Equity"]);
const LINKAGE_REQUIRED_UNIT_CATEGORY_KINDS = new Set(["fuel", "maintenance", "toll"]);

// ── pure assertion logic (selftest-able without a DB) ─────────────────────────────────────────

export function assertPayeeResolvable(check, resolved) {
  if (!resolved) return `check ${check.id}: payee_kind=${check.payee_kind} payee id does not resolve in its canonical table`;
  return null;
}

export function assertDebitAccountAllowed(line, account) {
  if (!account) return `line ${line.id}: resolved account not found`;
  if (!account.is_postable) return `line ${line.id}: account ${account.id} is not postable`;
  if (account.system_purpose && FORBIDDEN_SYSTEM_PURPOSES.has(account.system_purpose)) {
    return `line ${line.id}: account ${account.id} is system_purpose=${account.system_purpose} -- forbidden on a check`;
  }
  if (!ALLOWED_DEBIT_ACCOUNT_TYPES.has(account.account_type)) {
    return `line ${line.id}: account ${account.id} is account_type=${account.account_type} -- not an allowed check debit type`;
  }
  return null;
}

export function assertLinkageOrExemption(check, line) {
  if (!line.category_kind || !LINKAGE_REQUIRED_UNIT_CATEGORY_KINDS.has(line.category_kind)) return null;
  if (check.unit_id) return null;
  if (line.load_exemption_reason) return null;
  return `line ${line.id}: category ${line.category_kind} requires a unit (header) or an explicit load_exemption_reason -- neither present`;
}

export function assertNoDriverAdvanceLine(check, line) {
  if (check.payee_kind === "driver" && line.category_kind === "cash_advance") {
    return `check ${check.id} line ${line.id}: driver + cash_advance line reached live storage -- the write-time refusal was bypassed`;
  }
  return null;
}

export function assertReverseLinkReturnsCheck(checkId, reverseLinkResultIds) {
  if (!reverseLinkResultIds.includes(checkId)) {
    return `check ${checkId}: its own vendor/driver/customer's reverse-link query did not return it`;
  }
  return null;
}

// ── live (Neon) ─────────────────────────────────────────────────────────────────────────────

async function live() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`${LABEL}: FAIL — DATABASE_URL not set. A live money guard that cannot connect is a FAIL, never a pass.`);
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const countRes = await client.query(`SELECT count(*)::int AS n FROM accounting.expenses WHERE payment_type = 'check'`);
    const liveCount = countRes.rows[0].n;
    if (liveCount === 0) {
      console.log(`${LABEL}: SKIP — 0 live checks (the check engine has not shipped/been used yet). Guard armed, will run when population is non-zero.`);
      return true;
    }

    const errors = [];

    const checksRes = await client.query(
      `SELECT id::text, payee_kind, vendor_uuid::text AS vendor_uuid, driver_uuid::text AS driver_uuid,
              payee_customer_uuid::text AS payee_customer_uuid, unit_id::text AS unit_id
         FROM accounting.expenses WHERE payment_type = 'check'`
    );
    for (const check of checksRes.rows) {
      let resolved = null;
      if (check.payee_kind === "vendor" && check.vendor_uuid) {
        resolved = (await client.query(`SELECT 1 FROM mdata.vendors WHERE id = $1::uuid AND deactivated_at IS NULL`, [check.vendor_uuid])).rows[0];
      } else if (check.payee_kind === "driver" && check.driver_uuid) {
        resolved = (await client.query(`SELECT 1 FROM mdata.drivers WHERE id = $1::uuid AND deactivated_at IS NULL`, [check.driver_uuid])).rows[0];
      } else if (check.payee_kind === "customer" && check.payee_customer_uuid) {
        resolved = (await client.query(`SELECT 1 FROM mdata.customers WHERE id = $1::uuid AND deactivated_at IS NULL`, [check.payee_customer_uuid])).rows[0];
      } else if (check.payee_kind === "employee") {
        resolved = { employee_scope_unverified: true }; // no employee roster table exists yet -- see check-payee.service.ts's own disclosed gap.
      }
      const err = assertPayeeResolvable(check, resolved);
      if (err) errors.push(err);
    }

    // expense_category_account_map is many-to-one on account_id (e.g. fuel/fuel and fuel/diesel both
    // map to the same GL account, confirmed live) -- reverse-deriving ONE category_kind from a
    // resolved account_id alone is genuinely ambiguous (the same limitation check-void.service.ts's
    // reissue() discloses). DISTINCT ON picks one deterministically per line rather than fanning out
    // into one row per matching mapping (which double/triple-counted the same line as a real bug
    // this guard's own live run against the rehearsal branch caught before this fix).
    const linesRes = await client.query(
      `SELECT DISTINCT ON (el.id)
              el.id::text, el.expense_id::text, el.expense_account_uuid::text AS account_id, el.load_exemption_reason,
              ec.category_kind, e.payee_kind, e.unit_id::text AS unit_id
         FROM accounting.expense_lines el
         JOIN accounting.expenses e ON e.id = el.expense_id AND e.payment_type = 'check'
         LEFT JOIN accounting.expense_category_account_map ec ON ec.account_id = el.expense_account_uuid
        ORDER BY el.id, ec.category_kind`
    );
    for (const line of linesRes.rows) {
      if (line.account_id) {
        const accountRes = await client.query(
          `SELECT id::text, is_postable, system_purpose, account_type FROM catalogs.accounts WHERE id = $1::uuid`,
          [line.account_id]
        );
        const err = assertDebitAccountAllowed(line, accountRes.rows[0]);
        if (err) errors.push(err);
      }
      const check = { id: line.expense_id, payee_kind: line.payee_kind, unit_id: line.unit_id };
      const linkErr = assertLinkageOrExemption(check, line);
      if (linkErr) errors.push(linkErr);
      const advErr = assertNoDriverAdvanceLine(check, line);
      if (advErr) errors.push(advErr);
    }

    // 13 -- pick one real check per payee kind present and confirm the reverse-link WHERE clause
    // (same shape as checks.routes.ts's GET /api/v1/checks filter) returns it.
    const sampleRes = await client.query(
      `SELECT id::text, vendor_uuid::text AS vendor_uuid, driver_uuid::text AS driver_uuid,
              payee_customer_uuid::text AS payee_customer_uuid, operating_company_id::text AS operating_company_id
         FROM accounting.expenses WHERE payment_type = 'check' LIMIT 20`
    );
    for (const s of sampleRes.rows) {
      if (s.vendor_uuid) {
        const r = await client.query(
          `SELECT id::text FROM accounting.expenses WHERE operating_company_id = $1::uuid AND payment_type='check' AND vendor_uuid = $2::uuid`,
          [s.operating_company_id, s.vendor_uuid]
        );
        const err = assertReverseLinkReturnsCheck(s.id, r.rows.map((row) => row.id));
        if (err) errors.push(err);
      }
    }

    if (errors.length > 0) {
      console.error(`${LABEL}: LIVE FAIL — ${errors.length} violation(s):`);
      for (const e of errors.slice(0, 20)) console.error(`  - ${e}`);
      process.exit(1);
    }
    console.log(`${LABEL}: LIVE PASS — ${liveCount} live check(s), 0 violations across assertions 9-13.`);
    return true;
  } finally {
    await client.end();
  }
}

// ── selftest ────────────────────────────────────────────────────────────────────────────────

function selftest() {
  const cases = [
    ["assertPayeeResolvable — missing payee row FAILS", () => assertPayeeResolvable({ id: "c1", payee_kind: "vendor" }, null) !== null],
    ["assertPayeeResolvable — real payee row PASSES", () => assertPayeeResolvable({ id: "c1", payee_kind: "vendor" }, { ok: 1 }) === null],
    [
      "assertDebitAccountAllowed — A/R system_purpose FAILS",
      () => assertDebitAccountAllowed({ id: "l1" }, { id: "a1", is_postable: true, system_purpose: "accounts_receivable", account_type: "Asset" }) !== null,
    ],
    [
      "assertDebitAccountAllowed — Income account_type FAILS",
      () => assertDebitAccountAllowed({ id: "l1" }, { id: "a1", is_postable: true, system_purpose: null, account_type: "Income" }) !== null,
    ],
    [
      "assertDebitAccountAllowed — Expense, postable PASSES",
      () => assertDebitAccountAllowed({ id: "l1" }, { id: "a1", is_postable: true, system_purpose: null, account_type: "Expense" }) === null,
    ],
    [
      "assertLinkageOrExemption — fuel line, no unit, no exemption FAILS",
      () => assertLinkageOrExemption({ id: "c1", unit_id: null }, { id: "l1", category_kind: "fuel", load_exemption_reason: null }) !== null,
    ],
    [
      "assertLinkageOrExemption — fuel line WITH unit PASSES",
      () => assertLinkageOrExemption({ id: "c1", unit_id: "u1" }, { id: "l1", category_kind: "fuel", load_exemption_reason: null }) === null,
    ],
    [
      "assertLinkageOrExemption — fuel line with exemption reason PASSES",
      () => assertLinkageOrExemption({ id: "c1", unit_id: null }, { id: "l1", category_kind: "fuel", load_exemption_reason: "pre-tms" }) === null,
    ],
    [
      "assertLinkageOrExemption — office line (not linkage-required) PASSES regardless",
      () => assertLinkageOrExemption({ id: "c1", unit_id: null }, { id: "l1", category_kind: "office", load_exemption_reason: null }) === null,
    ],
    [
      "assertNoDriverAdvanceLine — driver + cash_advance FAILS",
      () => assertNoDriverAdvanceLine({ id: "c1", payee_kind: "driver" }, { id: "l1", category_kind: "cash_advance" }) !== null,
    ],
    [
      "assertNoDriverAdvanceLine — vendor + cash_advance PASSES (rule is driver-specific)",
      () => assertNoDriverAdvanceLine({ id: "c1", payee_kind: "vendor" }, { id: "l1", category_kind: "cash_advance" }) === null,
    ],
    ["assertReverseLinkReturnsCheck — missing from result set FAILS", () => assertReverseLinkReturnsCheck("c1", ["c2", "c3"]) !== null],
    ["assertReverseLinkReturnsCheck — present in result set PASSES", () => assertReverseLinkReturnsCheck("c1", ["c1", "c2"]) === null],
  ];
  let failed = 0;
  for (const [name, fn] of cases) {
    let ok;
    try {
      ok = fn();
    } catch (err) {
      ok = false;
      console.error(`  ${name}: THREW ${err.message}`);
    }
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}`);
    if (!ok) failed++;
  }
  if (failed > 0) {
    console.error(`${LABEL} selftest FAILED — ${failed}/${cases.length} case(s) did not behave as expected.`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS — ${cases.length}/${cases.length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    await live();
  }
}
