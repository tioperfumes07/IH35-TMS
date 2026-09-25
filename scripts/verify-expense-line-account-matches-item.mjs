#!/usr/bin/env node
// verify-expense-line-account-matches-item.mjs — ROUND 165 Guard A.
//
// seedExpense() (apps/backend/src/feed/seed-settlement-document.service.ts) used to insert
// accounting.expense_lines with no expense_account_uuid and no item_id at all, so every non-fuel
// settlement expense posted to whatever the JE poster defaulted to (measured live: 5000 Fuel &
// Diesel, for scales/tolls/washout/lumper/parking that belong on 5300/5320/5310). Fixed at the
// root in that file (resolveExpenseItem: resolve by catalogs.items.item_name, refuse rather than
// post to a default). This guard is the live proof that fix holds going forward: every USMCA
// expense line that carries an item_id posts to THAT item's own default_expense_account_id, never
// a different account.
//
// REPORT MODE (ROUND 165 order 6): the Lead's R-164 fixes the EXISTING August/September data
// under AUTH-021 — until that lands, this guard reads red against real, unfixed live rows by
// design. scripts/verify-expense-line-account-matches-item.gate.json controls blocking vs
// report-only; flip "blocking" to true only after AUTH-021/R-164 is CONSUMED (docs/bus/OWNER-
// AUTHORIZATIONS.md). Fail-closed on DB connectivity either way (ROUND 29.9-B) — only a MISMATCH
// finding is downgraded to a warning while report-only.
//
// `node scripts/verify-expense-line-account-matches-item.mjs --selftest` runs the comparison logic
// (findMismatches, pure, no DB) against a planted-red fixture (proves it catches a real mismatch)
// and a clean fixture (proves it does not false-positive) — this is the "planted-red selftest."
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB =
  "checks live accounting.expense_lines vs catalogs.items for USMCA; cannot be exercised without a live Neon connection";

const LABEL = "verify-expense-line-account-matches-item";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const GATE_PATH = path.join(ROOT, "scripts/verify-expense-line-account-matches-item.gate.json");

const SQL = `
  SELECT el.id::text AS line_id, el.expense_id::text, el.description, el.amount_cents,
         el.expense_account_uuid::text AS line_account, i.id::text AS item_id, i.item_name,
         i.default_expense_account_id::text AS item_account
    FROM accounting.expense_lines el
    JOIN accounting.expenses e ON e.id = el.expense_id
    JOIN catalogs.items i ON i.id = el.item_id
   WHERE e.operating_company_id = $1::uuid
     AND el.item_id IS NOT NULL
     AND e.voided_at IS NULL`;

/** Pure — no DB. A mismatch is a line whose own expense_account_uuid differs from its resolved
 * item's default_expense_account_id (including a line item posted with no account at all while
 * its item does have one). Exported for --selftest. */
export function findMismatches(rows) {
  return rows.filter((r) => (r.item_account ?? null) !== (r.line_account ?? null));
}

function readGate() {
  if (!fs.existsSync(GATE_PATH)) return { blocking: false };
  return JSON.parse(fs.readFileSync(GATE_PATH, "utf8"));
}

function selftest() {
  const clean = [
    { line_id: "l1", item_id: "i1", item_name: "OTR-Scale Expense", line_account: "acct-5300", item_account: "acct-5300" },
    { line_id: "l2", item_id: "i2", item_name: "Warehouse Lumper Expense", line_account: "acct-5310", item_account: "acct-5310" },
  ];
  const cleanMismatches = findMismatches(clean);
  if (cleanMismatches.length !== 0) {
    console.error(`${LABEL}: SELFTEST FAIL — clean fixture reported ${cleanMismatches.length} mismatch(es), expected 0`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest green fixture — 0 mismatches (expected 0). PASS`);

  const planted = [
    ...clean,
    // Planted red: posts to 5000 (the exact bug this guard exists to catch) instead of its own
    // item's 5300.
    { line_id: "l3", item_id: "i1", item_name: "OTR-Scale Expense", line_account: "acct-5000", item_account: "acct-5300" },
  ];
  const plantedMismatches = findMismatches(planted);
  if (plantedMismatches.length !== 1 || plantedMismatches[0].line_id !== "l3") {
    console.error(`${LABEL}: SELFTEST FAIL — planted-red fixture did not flag exactly the planted mismatch (got ${JSON.stringify(plantedMismatches)})`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest planted-red fixture — 1 mismatch flagged (l3, expected). red→green PASS`);
}

async function live() {
  const gate = readGate();
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const rows = (await client.query(SQL, [USMCA_COMPANY_ID])).rows;
    await client.query("COMMIT");

    const mismatches = findMismatches(rows);
    if (mismatches.length === 0) {
      console.log(`${LABEL}: LIVE PASS — ${rows.length} itemized USMCA expense line(s) checked, 0 mismatches.`);
      return;
    }

    console.error(`${LABEL}: ${mismatches.length} of ${rows.length} itemized expense line(s) post to an account other than their item's default_expense_account_id:`);
    for (const m of mismatches.slice(0, 20)) {
      console.error(`  ✗ line ${m.line_id} (expense ${m.expense_id}) "${m.description}" $${(Number(m.amount_cents) / 100).toFixed(2)} item="${m.item_name}" line_account=${m.line_account ?? "NULL"} item_account=${m.item_account}`);
    }

    if (!gate.blocking) {
      console.warn(`${LABEL}: REPORT MODE (${gate.note ?? "blocking flips true once R-164/AUTH-021 is CONSUMED"}) — not failing the gate.`);
      return;
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  await live();
}
