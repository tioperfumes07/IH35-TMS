/**
 * WO -> bill: a bill line takes its work-order line ITEM's account (443.67 G3: line account = item account), never an
 * account guessed from the line's description keywords (real Postgres). A line described "Tire replacement" whose item
 * posts to the repair account must bill to the repair account — the old copy matched "tire" to the maintenance category
 * map's tires account. A line that names no item is refused by name (wo_line_item_required); nothing is guessed.
 * On the old code the first assertion fails (account = the keyword account) and the refusal never happens.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { createIsolatedOperatingCompany, deactivateIsolatedOperatingCompany, insertMaintenanceCategoryMap } from "../../../test-helpers/isolated-company.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { autoCreateBillFromWO, createWorkOrderWithLines, type TwoSectionHeader } from "../two-section-service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("WO -> bill line account = its item's account (real Postgres)", () => {
  it("bills the item's account, not the description-keyword account; refuses a line with no item", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    await ensureIntegrationPrerequisites();
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const opco = (await createIsolatedOperatingCompany({ codePrefix: "WBI", legalNamePrefix: "WO bill item account" })).companyId;
    const tag = `WBI${Date.now().toString(36).toUpperCase()}`;
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    const keywordAccount = (await db.query<{ id: string }>(
      `INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number, is_postable)
       VALUES ($1, 'WBI maintenance category map account', 'Expense', $2, true) RETURNING id::text AS id`,
      [opco, `${tag.slice(-5)}1`]
    )).rows[0]!.id;
    // every maintenance category code (incl. "tires") maps to keywordAccount — the old guess lands here
    await insertMaintenanceCategoryMap(db, opco, keywordAccount);
    await db.query("COMMIT");
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
      const itemAccount = (await one(
        `INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number, is_postable)
         VALUES ($1, 'WBI repair item account', 'Expense', $2, true) RETURNING id::text AS id`,
        [opco, `${tag.slice(-5)}2`]
      )).id;
      const unit = (await one(
        `INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
        [`${tag}-U1`, `VIN${tag}`.slice(0, 17), opco]
      )).id;
      const category = (await one(
        `INSERT INTO catalogs.qbo_categories (operating_company_id, code, display_name) VALUES ($1, 'wbi_repair', 'WBI repair') RETURNING id::text AS id`,
        [opco]
      )).id;
      const item = (await one(
        `INSERT INTO catalogs.items (operating_company_id, item_type, item_name, category_id, default_expense_account_id) VALUES ($1, 'Service', $2, $3, $4) RETURNING id::text AS id`,
        [opco, `${tag} tire service`, category, itemAccount]
      )).id;
      const vendor = (await one(
        `INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, 'WBI Tire Shop', 'other') RETURNING id::text AS id`,
        [opco]
      )).id;
      const header = (n: string): TwoSectionHeader => ({
        operating_company_id: opco,
        wo_type: "repair",
        source_type: "ES",
        unit_id: unit,
        repair_location: "WBI shop",
        bucket: "external",
        vendor_id: vendor,
        external_vendor_id: vendor,
        external_vendor_invoice_number: `${tag}-${n}`,
        description: "Tire replacement",
        payment_timing: "vendor_invoice",
        bill_terms: "Net 30",
        load_exemption_reason: "shop_repair_no_load",
      });

      const woWithItem = await createWorkOrderWithLines(db as never, TEST_OWNER_USER_ID, header("A"),
        [{ description: "Tire replacement", quantity: 1, amount: 400, expense_category_uuid: category, item_id: item }], []);
      const bill = await autoCreateBillFromWO(db as never, TEST_OWNER_USER_ID, woWithItem.woUuid);
      expect(bill?.uuid).toBeTruthy();
      const line = await one<{ account_id: string; item_id: string | null }>(
        `SELECT account_id::text, item_id::text FROM accounting.bill_lines WHERE bill_id = $1::uuid`, [bill!.uuid]
      );
      expect(line.account_id).toBe(itemAccount);
      expect(line.account_id).not.toBe(keywordAccount);
      expect(line.item_id).toBe(item);

      const woNoItem = await createWorkOrderWithLines(db as never, TEST_OWNER_USER_ID, header("B"),
        [{ description: "Tire replacement", quantity: 1, amount: 400, expense_category_uuid: category }], []);
      await db.query("SAVEPOINT no_item");
      const refused = await autoCreateBillFromWO(db as never, TEST_OWNER_USER_ID, woNoItem.woUuid).catch((e) => e);
      expect(String(refused?.message ?? refused)).toMatch(/wo_line_item_required/);
      await db.query("ROLLBACK TO SAVEPOINT no_item");
    } finally {
      await db.query("ROLLBACK");
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await deactivateIsolatedOperatingCompany(db, opco);
      await db.query("COMMIT");
      await db.end();
    }
  });
});
