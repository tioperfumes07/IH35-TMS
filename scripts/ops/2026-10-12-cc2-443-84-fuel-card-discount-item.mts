// LEAD 443.84 #3 (AUTH-443) — the item "Fuel Card Discount": the card bills less than the pump receipt (median 3.6%); on a bank
// accept the difference posts Dr the card payable / Cr this item's account, "Fuel & Diesel" (5000) — NO new account (Lead ruling).
// Same columns as POST /api/v1/catalogs/items (catalogs/items.routes.ts) + the category of "Fuel-Truck Diesel" (G3: every item
// carries a category and an account). Idempotent: an existing live item of that name is reused and checked.
//   default        dry run (refuses production; on a fork it commits — a fork is throwaway)
//   --apply --auth AUTH-443   production
// Run: node --env-file=<env> --import tsx scripts/ops/2026-10-12-cc2-443-84-fuel-card-discount-item.mts [--apply --auth AUTH-443]
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((i > 0 ? process.argv[i + 1] : "") !== "AUTH-443") throw new Error("--apply requires --auth AUTH-443");
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", "AUTH-443"], { stdio: "inherit" });
}
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
if (APPLY) await assertIsIntendedProduction(c, { label: "443.84 Fuel Card Discount item" });
else await assertNotProduction(c, { label: "443.84 Fuel Card Discount item (fork)" });
await c.query("BEGIN");
try {
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await c.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  const ref = (await c.query<{ account_id: string; category_id: string | null; number: string }>(
    `SELECT a.id::text AS account_id, i.category_id::text, a.account_number AS number FROM catalogs.items i JOIN catalogs.accounts a ON a.id = i.default_expense_account_id
      WHERE i.item_name = 'Fuel-Truck Diesel' AND i.deactivated_at IS NULL AND (i.operating_company_id = $1::uuid OR i.operating_company_id IS NULL)
      ORDER BY (i.operating_company_id = $1::uuid) DESC NULLS LAST LIMIT 1`, [USMCA])).rows[0];
  if (!ref || ref.number !== "5000") throw new Error(`REFUSE: "Fuel-Truck Diesel" must map to 5000 (found ${ref?.number})`);
  const existing = (await c.query<{ id: string; account_id: string | null; category_id: string | null }>(
    `SELECT id::text, default_expense_account_id::text AS account_id, category_id::text FROM catalogs.items
      WHERE operating_company_id = $1::uuid AND item_name = 'Fuel Card Discount' AND deactivated_at IS NULL`, [USMCA])).rows[0];
  let id = existing?.id;
  if (existing) {
    if (existing.account_id !== ref.account_id) throw new Error(`REFUSE: existing "Fuel Card Discount" maps to another account (${existing.account_id})`);
    console.log(`item exists ${id} — reused`);
  } else {
    id = (await c.query<{ id: string }>(
      `INSERT INTO catalogs.items (operating_company_id, item_name, item_code, item_type, description, default_expense_account_id, category_id,
                                   taxable, notes, created_by_user_id, updated_by_user_id)
       SELECT $1::uuid, 'Fuel Card Discount', 'FUEL-CARD-DISCOUNT', i.item_type,
              'Card price below the pump receipt — posted on a bank accept as Dr the card payable / Cr Fuel & Diesel (443.84)',
              $2::uuid, $3::uuid, false, 'LEAD 443.84 #3 / AUTH-443', $4::uuid, $4::uuid
         FROM catalogs.items i WHERE i.item_name = 'Fuel-Truck Diesel' AND i.deactivated_at IS NULL
          AND (i.operating_company_id = $1::uuid OR i.operating_company_id IS NULL)
        ORDER BY (i.operating_company_id = $1::uuid) DESC NULLS LAST LIMIT 1
       RETURNING id::text`, [USMCA, ref.account_id, ref.category_id, OWNER])).rows[0]?.id;
    if (!id) throw new Error("REFUSE: item not created");
    await c.query(`SELECT audit.append_event($1,'info',$2::jsonb,$3::uuid,$4)`, ["catalogs.item.created",
      JSON.stringify({ resource_type: "catalogs.items", resource_id: id, item_name: "Fuel Card Discount", account: "5000", operating_company_id: USMCA }), OWNER, "CC-2-AUTH-443"]);
    console.log(`item created ${id} -> 5000, category ${ref.category_id}`);
  }
  await c.query("COMMIT");
} catch (e) { await c.query("ROLLBACK"); throw e; }
await c.end();
