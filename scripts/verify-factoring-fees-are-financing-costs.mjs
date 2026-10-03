#!/usr/bin/env node
/**
 * ROUND 355 R-3 — Factoring fees are financing costs, never bank charges.
 *
 * Owner 2026-10-03: "THEY SHOULD NOT SIT UNDER BANK CHARGES."
 * Faro is full recourse → secured borrowing. Under ASC 860 the fee is a FINANCING COST.
 *
 * Locked shape (USMCA catalogs.accounts):
 *   6400 Factoring Fees               → parent 6810, subtype NOT a bank-charge type
 *   6405 Factoring Transaction Fees   → parent 6400 (stays child of 6400)
 *   6830 Factoring Default Interest   → parent 6810
 *   6810 Interest & Financing Expense → the parent
 *   6820 Factoring Fees (duplicate)   → stays DEAD (deactivated_at IS NOT NULL). Never revive.
 *
 * Ceiling 0. Refuses any live factoring-fee / factoring-interest account whose subtype is a
 * bank-charge type OR whose parent is not 6810 (6405 is allowed as child of 6400).
 *
 * WIRE-FEE RULE (owner 2026-10-03: "FARO WIRE FEE IS A WIRE FEE"): the factor's WIRE fee is a bank charge, not a
 * financing cost. The account bound to the active role factor_wire_fee must carry a bank-charge subtype and must NOT sit
 * under 6810 — the inverse of the rule above, so a sweep cannot "fix" it onto the financing side. USMCA today:
 * 6300 Bank Service Charges & Wire Fees. Recorded in docs/bus/00-CLOSED-ASKED-AND-ANSWERED-NEVER-REOPEN.md.
 *
 * Read-only against Neon. No seed. No CoA rewrite here — Lead already executed the reclass on
 * prod (0 postings made it free); this guard locks the shape.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOW_OFFLINE_SKIP =
  "structural asserts account numbers/purposes; live Neon CoA shape only when DATABASE_URL is set";

const LABEL = "verify-factoring-fees-are-financing-costs";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const BANK_CHARGE_SUBTYPES = new Set([
  "Bank Charges",
  "BankCharges",
  "BankServiceCharges",
  "Bank Service Charges",
]);

/** Active fee/interest leaves that MUST parent under 6810 (6405 parents under 6400 instead). */
const MUST_PARENT_6810 = new Set(["6400", "6830"]);
const MUST_PARENT_6400 = new Set(["6405"]);
const MUST_BE_DEAD = new Set(["6820"]);

export function isBankChargeSubtype(subtype) {
  if (subtype == null) return false;
  const s = String(subtype).trim();
  if (BANK_CHARGE_SUBTYPES.has(s)) return true;
  return /bank\s*charge/i.test(s);
}

export function classifyRow(row) {
  const num = String(row.account_number ?? "");
  const dead = row.deactivated_at != null;
  const subtype = row.account_subtype ?? null;
  const parent = row.parent_number ?? null;
  const purpose = row.system_purpose ?? null;

  if (MUST_BE_DEAD.has(num)) {
    if (!dead) return { ok: false, why: `${num} must stay DEAD (duplicate Factoring Fees); deactivated_at is null` };
    return { ok: true, why: "dead-duplicate" };
  }

  if (dead) return { ok: true, why: "inactive-skipped" };

  if (isBankChargeSubtype(subtype)) {
    return { ok: false, why: `${num} subtype=${subtype} is a bank-charge type — financing cost required` };
  }

  if (MUST_PARENT_6810.has(num) && parent !== "6810") {
    return { ok: false, why: `${num} parent=${parent ?? "NULL"} — must be 6810 Interest & Financing Expense` };
  }
  if (MUST_PARENT_6400.has(num) && parent !== "6400") {
    return { ok: false, why: `${num} parent=${parent ?? "NULL"} — must be 6400 Factoring Fees` };
  }

  // Also catch any other live account that carries factoring_fees / factoring_default_interest purpose
  // but sits under a bank-charge parent or bank-charge subtype.
  if (
    (purpose === "factoring_fees" || purpose === "factoring_default_interest" || /factoring/i.test(String(row.account_name ?? ""))) &&
    num !== "6810" &&
    !MUST_PARENT_6810.has(num) &&
    !MUST_PARENT_6400.has(num) &&
    !MUST_BE_DEAD.has(num)
  ) {
    // Extra live factoring-named expense — still refuse bank-charge subtype (already checked) and
    // refuse parent that is itself a Bank Charges leaf (6300/6310).
    if (parent === "6300" || parent === "6310") {
      return { ok: false, why: `${num} parents under bank-charge account ${parent}` };
    }
  }

  return { ok: true, why: "ok" };
}

/** The account bound to factor_wire_fee: a wire fee is a bank charge — bank-charge subtype, never under 6810. */
export function classifyWireFeeAccount(row) {
  const num = String(row.account_number ?? "");
  if (!isBankChargeSubtype(row.account_subtype)) {
    return { ok: false, why: `factor_wire_fee -> ${num} subtype=${row.account_subtype ?? "NULL"} — a Faro wire fee is a WIRE FEE (bank charge), owner 2026-10-03` };
  }
  if (row.parent_number === "6810" || num === "6810") {
    return { ok: false, why: `factor_wire_fee -> ${num} sits under 6810 Interest & Financing Expense — a wire fee is not a financing cost` };
  }
  return { ok: true, why: "wire-fee-is-bank-charge" };
}

function selftest() {
  const cases = [
    [{ account_number: "6400", account_subtype: "OtherExpense", parent_number: "6810", deactivated_at: null }, true],
    [{ account_number: "6400", account_subtype: "Bank Charges", parent_number: "6810", deactivated_at: null }, false],
    [{ account_number: "6400", account_subtype: "OtherExpense", parent_number: "6300", deactivated_at: null }, false],
    [{ account_number: "6405", account_subtype: "OtherExpense", parent_number: "6400", deactivated_at: null }, true],
    [{ account_number: "6405", account_subtype: "OtherExpense", parent_number: "6810", deactivated_at: null }, false],
    [{ account_number: "6830", account_subtype: "OtherExpense", parent_number: "6810", deactivated_at: null }, true],
    [{ account_number: "6820", account_subtype: "OtherExpense", parent_number: null, deactivated_at: "2026-01-01" }, true],
    [{ account_number: "6820", account_subtype: "OtherExpense", parent_number: null, deactivated_at: null }, false],
  ];
  for (const [row, expectOk] of cases) {
    const r = classifyRow(row);
    if (r.ok !== expectOk) {
      console.error(`${LABEL}: SELFTEST FAIL on ${JSON.stringify(row)} → ${JSON.stringify(r)} expected ok=${expectOk}`);
      process.exit(1);
    }
  }
  const wire = [
    [{ account_number: "6300", account_subtype: "Bank Charges", parent_number: null }, true],
    [{ account_number: "6300", account_subtype: "OtherExpense", parent_number: "6810" }, false],
    [{ account_number: "6840", account_subtype: "Bank Charges", parent_number: "6810" }, false],
  ];
  for (const [row, expectOk] of wire) {
    if (classifyWireFeeAccount(row).ok !== expectOk) {
      console.error(`${LABEL}: SELFTEST FAIL wire-fee rule on ${JSON.stringify(row)} expected ok=${expectOk}`);
      process.exit(1);
    }
  }
  if (isBankChargeSubtype("Bank Charges") !== true || isBankChargeSubtype("OtherExpense") !== false) {
    console.error(`${LABEL}: SELFTEST FAIL — isBankChargeSubtype`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

if (!process.env.DATABASE_URL) {
  console.log(`${LABEL}: SKIP live — no DATABASE_URL (${ALLOW_OFFLINE_SKIP})`);
  process.exit(0);
}

const { Client } = await import("pg");
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("sslmode=") ? undefined : { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA]);

  const { rows } = await client.query(
    `SELECT a.account_number, a.account_name, a.account_subtype, a.system_purpose,
            a.deactivated_at, p.account_number AS parent_number
       FROM catalogs.accounts a
       LEFT JOIN catalogs.accounts p ON p.id = a.parent_account_id
      WHERE a.operating_company_id = $1::uuid
        AND (
          a.account_number IN ('6400','6405','6830','6810','6820')
          OR a.system_purpose IN ('factoring_fees','factoring_default_interest')
          OR (a.account_name ILIKE '%factoring%fee%' OR a.account_name ILIKE '%factoring%interest%')
        )
      ORDER BY a.account_number`,
    [USMCA]
  );

  const byNum = new Map(rows.map((r) => [String(r.account_number), r]));
  for (const required of ["6400", "6405", "6830", "6810", "6820"]) {
    if (!byNum.has(required)) {
      console.error(`${LABEL}: FAIL — required account ${required} missing on USMCA CoA`);
      process.exit(1);
    }
  }

  const failures = [];
  for (const row of rows) {
    const verdict = classifyRow(row);
    if (!verdict.ok) failures.push(verdict.why);
  }

  // 6810 itself must exist and must NOT be a bank-charge subtype.
  const parent = byNum.get("6810");
  if (isBankChargeSubtype(parent.account_subtype)) {
    failures.push(`6810 itself has bank-charge subtype ${parent.account_subtype}`);
  }

  // WIRE-FEE RULE — the active factor_wire_fee binding stays a bank charge.
  const wireRows = (await client.query(
    `SELECT a.account_number, a.account_subtype, p.account_number AS parent_number
       FROM accounting.chart_of_accounts_roles r
       JOIN catalogs.accounts a ON a.id = r.account_id
       LEFT JOIN catalogs.accounts p ON p.id = a.parent_account_id
      WHERE r.operating_company_id = $1::uuid AND r.role = 'factor_wire_fee' AND r.is_active`,
    [USMCA]
  )).rows;
  if (wireRows.length === 0) failures.push("factor_wire_fee has no active binding on USMCA (expected 6300 Bank Service Charges & Wire Fees)");
  for (const w of wireRows) {
    const v = classifyWireFeeAccount(w);
    if (!v.ok) failures.push(v.why);
  }

  await client.query("ROLLBACK");

  if (failures.length > 0) {
    console.error(`${LABEL}: FAIL — ${failures.length} defect(s):\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }

  console.log(
    `${LABEL}: PASS — USMCA 6400/6830→6810, 6405→6400, 6820 dead, 0 bank-charge subtypes on factoring fee/interest accounts (rows=${rows.length}); factor_wire_fee -> ${wireRows.map((w) => w.account_number).join(",")} stays a bank charge (wire fee)`
  );
} finally {
  await client.end();
}

// Keep the file discoverable next to this module for repo layout sanity.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!fs.existsSync(path.join(__dirname, "verify-factoring-fees-are-financing-costs.mjs"))) {
  console.error(`${LABEL}: FAIL — self path missing`);
  process.exit(1);
}
