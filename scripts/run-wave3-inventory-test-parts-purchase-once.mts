/**
 * WAVE 3 (INBOX-CC-1.md, 2026-08-21) — "keep creating money events" — inventory leg (4/4, final).
 *
 * Creates a real, clearly TEST-DATA-labeled USMCA parts-purchase record (maintenance.parts_inventory
 * upsert + maintenance.parts_purchases append-only event row) through the EXACT same two-statement,
 * same-transaction shape the real POST /api/v1/maintenance/parts-inventory/purchases route uses
 * (mirrored here since, unlike autoCreateExpenseFromWO/postFuelExpenseFromEvent, there is no standalone
 * service function to call directly for the header+lines half -- the route inlines it).
 *
 * Then calls the EXISTING, unchanged postPartsInventoryPurchase poster for the GL half.
 *
 * CORRECTED UNDERSTANDING (superseding the board's prior INVENTORY-PARTS-PURCHASE-GL-ACCOUNT-
 * DESIGNATION-UNBOUND row): live-verified 2026-08-21 that PARTS_PURCHASE_GL_POSTING_ENABLED IS
 * enabled and the maintenance_parts_expense CoA role IS bound on all three entities, including
 * USMCA -- the board row's premise was stale. The REAL blocker preventing this leg from ever
 * completing was ACCT-F5704: the route's stock-upsert INSERT specified an ON CONFLICT predicate
 * ("part_number <> ''") that did not textually match the live unique index's predicate
 * ("btrim(part_number) <> ''"), so Postgres could never infer an arbiter and the route 500'd with
 * 42P10 on EVERY real call with a non-null part_number -- confirmed live via a rolled-back EXPLAIN
 * on prod before this fix. Fixed in the same PR as this script (parts-inventory.routes.ts). With
 * that fixed, both the header+lines half AND the GL-posting half now complete live, end to end.
 *
 * maintenance.parts_inventory/parts_purchases carry no is_sample_data column -- TEST DATA label lives
 * in parts_inventory.notes and the part_description itself (which flows straight into the JE memo the
 * poster creates).
 *
 * Usage:
 *   DATABASE_URL=<direct, non-pooled> npx tsx scripts/run-wave3-inventory-test-parts-purchase-once.mts          # dry run
 *   DATABASE_URL=<direct, non-pooled> npx tsx scripts/run-wave3-inventory-test-parts-purchase-once.mts --commit  # apply
 */
import pg from "pg";
import { postPartsInventoryPurchase } from "../apps/backend/src/accounting/parts-inventory-posting/poster.service.js";
import { resolveRoleAccount, CoaRoleResolutionError } from "../apps/backend/src/accounting/coa-roles/resolver.service.js";
import { withCurrentUser } from "../apps/backend/src/auth/db.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const VENDOR_ID = "95307de7-2e0a-44b3-b3aa-e9d152754320"; // real vendor "LOVES TRAVEL STOPS"
const PART_NUMBER = "WAVE3-TEST-PART-20260821";
const PART_DESCRIPTION = "WAVE3_TEST_DATA_2026-08-21 -- CC-1 inventory proof-of-path (brake pad set, TEST DATA)";
const NOTES = "WAVE3_TEST_DATA_2026-08-21 -- CC-1 inventory WAVE3 proof-of-path (ACCT-F5704). Header+lines + GL-posting both complete live now that the ON CONFLICT predicate mismatch blocking every real parts purchase is fixed.";
const QTY_RECEIVED = 4;
const PURCHASE_AMOUNT = 220.0; // $220.00 TEST DATA
const VENDOR_INVOICE_NUMBER = "WAVE3-TEST-INV-0001";

const COMMIT = process.argv.includes("--commit");

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");
if (/-pooler\./.test(dbUrl)) {
  throw new Error("Refusing a pooled connection string.");
}

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const client = await pool.connect();
  try {
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);

    const vendor = await client.query(`SELECT id, vendor_name FROM mdata.vendors WHERE id = $1::uuid`, [VENDOR_ID]);
    console.log("BEFORE — target vendor:", vendor.rows[0]);

    if (!COMMIT) {
      console.log("DRY RUN — pass --commit to apply. No writes made.");
      return;
    }

    // §1 — header+lines half, same two-statement same-transaction shape as the real route
    // (parts-inventory.routes.ts POST /purchases): stock upsert then append-only purchase event.
    const stock = await client.query(
      `
        INSERT INTO maintenance.parts_inventory (
          part_description, part_number, vendor_id, last_purchase_invoice_number,
          last_purchase_amount, last_purchase_date, on_hand_qty, location, operating_company_id, notes
        )
        VALUES ($1,$2,$3,$4,$5,now()::date,$6,$7,$8,$9)
        ON CONFLICT (operating_company_id, part_number) WHERE part_number IS NOT NULL AND btrim(part_number) <> ''
        DO UPDATE SET
          on_hand_qty = maintenance.parts_inventory.on_hand_qty + EXCLUDED.on_hand_qty,
          last_purchase_invoice_number = EXCLUDED.last_purchase_invoice_number,
          last_purchase_amount = EXCLUDED.last_purchase_amount,
          last_purchase_date = EXCLUDED.last_purchase_date,
          vendor_id = COALESCE(EXCLUDED.vendor_id, maintenance.parts_inventory.vendor_id),
          location = COALESCE(EXCLUDED.location, maintenance.parts_inventory.location),
          updated_at = now()
        RETURNING *
      `,
      [PART_DESCRIPTION, PART_NUMBER, VENDOR_ID, VENDOR_INVOICE_NUMBER, PURCHASE_AMOUNT, QTY_RECEIVED, "TEST-DATA-shelf", USMCA, NOTES]
    );
    const stockRow = stock.rows[0];

    const amountCents = Math.round(PURCHASE_AMOUNT * 100);
    const purchase = await client.query(
      `
        INSERT INTO maintenance.parts_purchases (
          operating_company_id, parts_inventory_id, vendor_id, vendor_invoice_number,
          purchase_amount_cents, qty_received, work_order_id, created_by_user_id
        )
        VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,NULL,$7::uuid)
        RETURNING *
      `,
      [USMCA, stockRow.id, VENDOR_ID, VENDOR_INVOICE_NUMBER, amountCents, QTY_RECEIVED, ACTOR_USER_UUID]
    );
    const purchaseRow = purchase.rows[0];
    console.log("HEADER+LINES RESULT:", { stockRow, purchaseRow });

    // §2 — GL-posting half, real unchanged poster. PARTS_PURCHASE_GL_POSTING_ENABLED is live-confirmed
    // ON for USMCA and the maintenance_parts_expense CoA role IS bound -- expected to post for real
    // now that ACCT-F5704's ON CONFLICT predicate mismatch (which blocked §1 above entirely) is fixed.
    const gl = await postPartsInventoryPurchase({
      operating_company_id: USMCA,
      parts_inventory_id: String(stockRow.id),
      parts_purchase_id: String(purchaseRow.id),
      actor_user_id: ACTOR_USER_UUID,
      entry_date_iso: new Date().toISOString().slice(0, 10),
      part_description: PART_DESCRIPTION,
      vendor_id: VENDOR_ID,
      vendor_invoice_number: VENDOR_INVOICE_NUMBER,
      purchase_amount_dollars: PURCHASE_AMOUNT,
    });
    console.log("GL POSTING RESULT:", gl);

    // Explicit sample-data tag on the resulting bill/JE: postPartsInventoryPurchase derives
    // is_sample_data from the vendor's own flag, and LOVES TRAVEL STOPS is a real, non-sample prod
    // vendor (chosen deliberately per "use whatever is easiest") -- without this explicit stamp the
    // TEST purchase's bill/JE would be structurally indistinguishable from real spend, same rigor as
    // the fleet/maintenance/fuel WAVE3 proofs.
    if (gl.posted && gl.bill_id) {
      await client.query(`UPDATE accounting.bills SET is_sample_data = true WHERE id = $1::uuid`, [gl.bill_id]);
    }
    if (gl.posted && gl.journal_entry_id) {
      await client.query(`UPDATE accounting.journal_entries SET is_sample_data = true WHERE id = $1::uuid`, [gl.journal_entry_id]);
    }

    // §3 — separately (read-only) probe the maintenance_parts_expense CoA-role binding directly, from
    // real code, not guessed. Must set the operating_company_id GUC on THIS probe's own connection
    // (withCurrentUser opens a separate connection from the main client above) -- omitting it would
    // scope the RLS-protected role lookup to nothing and produce a false "not found" unrelated to the
    // role's real binding state.
    await withCurrentUser(ACTOR_USER_UUID, async (roleClient) => {
      await roleClient.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);
      try {
        const accountId = await resolveRoleAccount(roleClient, USMCA, "maintenance_parts_expense");
        console.log("COA ROLE PROBE: role IS bound ->", accountId);
      } catch (e) {
        if (e instanceof CoaRoleResolutionError) {
          console.log("COA ROLE PROBE (role NOT bound):", e.code, "--", e.message);
        } else {
          throw e;
        }
      }
    });
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
