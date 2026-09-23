#!/usr/bin/env node
/** ROUND 115: every load cost is an itemized, accountable line. */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATION = "db/migrations/202614310201_validate_load_cost_line_amount_contract.sql";

export function validateLine(line) {
  const values = [line.item_id, line.quantity, line.rate_cents, line.unit_of_measure];
  if (values.some((value) => value == null)) return false;
  if (!(Number(line.quantity) > 0) || !(Number(line.rate_cents) > 0)) return false;
  if (!/^[a-z][a-z_]*$/.test(String(line.unit_of_measure))) return false;
  return Math.round(Number(line.quantity) * Number(line.rate_cents)) === Number(line.amount_cents);
}

function requireToken(file, token) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (!src.includes(token)) throw new Error(`${file} missing ${token}`);
}

function staticContract() {
  requireToken("apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx", 'entityType="item"');
  requireToken("apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx", "lineAmountCents(row)");
  requireToken("apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx", "unit_of_measure: row.unitOfMeasure");
  requireToken("apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx", 'aria-label="Rate per unit"');
  requireToken("apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx", 'step="0.0001"');
  requireToken("apps/backend/src/accounting/expenses.routes.ts", "expense_line_item_qty_rate_amount_mismatch");
  requireToken("apps/backend/src/accounting/bills.service.ts", "bill_line_item_qty_rate_amount_mismatch");
  requireToken(MIGRATION, "VALIDATE CONSTRAINT bill_lines_item_qty_rate_amount_check");
  requireToken(MIGRATION, "VALIDATE CONSTRAINT expense_lines_item_qty_rate_amount_check");
  requireToken(MIGRATION, "bill_lines_load_cost_item_contract_check");
  requireToken(MIGRATION, "expense_lines_load_cost_item_contract_check");
}

async function liveContract() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL required");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("SELECT set_config('app.bypass_rls','lucia',false)");
    const constraints = await client.query(`
      SELECT conname, convalidated
      FROM pg_constraint
      WHERE conname IN (
        'bill_lines_item_qty_rate_amount_check',
        'expense_lines_item_qty_rate_amount_check',
        'bill_lines_load_cost_item_contract_check',
        'expense_lines_load_cost_item_contract_check'
      )
    `);
    if (constraints.rows.length !== 4 || constraints.rows.some((row) => row.convalidated !== true)) {
      throw new Error(`load-cost item/amount CHECKs are not all validated: ${JSON.stringify(constraints.rows)}`);
    }
    const bad = await client.query(`
      SELECT count(*)::int AS count
      FROM (
        SELECT bl.item_id, bl.quantity, bl.rate_cents, bl.unit_of_measure,
               round(bl.amount * 100)::bigint AS amount_cents
        FROM accounting.bill_lines bl
        JOIN accounting.bills b ON b.id = bl.bill_id
        WHERE b.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
          AND bl.load_id IS NOT NULL AND bl.voided_at IS NULL
        UNION ALL
        SELECT el.item_id, el.quantity, el.rate_cents, el.unit_of_measure, el.amount_cents
        FROM accounting.expense_lines el
        JOIN accounting.expenses e ON e.id = el.expense_id
        WHERE e.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
          AND el.load_id IS NOT NULL AND e.voided_at IS NULL
      ) line
      WHERE item_id IS NULL OR quantity IS NULL OR rate_cents IS NULL OR unit_of_measure IS NULL
         OR quantity <= 0 OR rate_cents <= 0
         OR round(quantity * rate_cents)::bigint <> amount_cents
    `);
    if (Number(bad.rows[0]?.count ?? -1) !== 0) throw new Error(`${bad.rows[0].count} invalid active USMCA load-cost line(s)`);
    console.log("verify-load-cost-lines-item-quantity-rate: PASS — constraints validated; invalid active USMCA load-cost lines=0");
  } finally {
    await client.end();
  }
}

function selftest() {
  const valid = { item_id: "item", quantity: 10, rate_cents: 425, unit_of_measure: "gallon", amount_cents: 4250 };
  const cases = [
    ["valid quantity × rate", valid, true],
    ["valid fractional-cent fuel rate", { ...valid, quantity: 10, rate_cents: 522.9, amount_cents: 5229 }, true],
    ["planted contradictory amount", { ...valid, amount_cents: 4249 }, false],
    ["planted missing item", { ...valid, item_id: null }, false],
    ["planted missing account-independent unit", { ...valid, unit_of_measure: null }, false],
  ];
  let failures = 0;
  for (const [name, line, expected] of cases) {
    const ok = validateLine(line) === expected;
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  }
  if (failures) process.exit(1);
  console.log("verify-load-cost-lines-item-quantity-rate --selftest PASS 5/5");
}

if (process.argv.includes("--selftest")) selftest();
else {
  staticContract();
  await liveContract();
}
