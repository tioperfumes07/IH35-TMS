/**
 * SCENTSX B7 (books side) — credit exposure = open A/R + draft invoices + shipped-not-billed + open orders, against the limit.
 * Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createLink } from "./links.service.js";
import { invoiceSalesOrder } from "./sales-invoice.service.js";
import { creditExposure } from "./credit-exposure.service.js";
import { loadSanctionsList, screenParty } from "./sanctions.service.js";
import { fixtureFetcher } from "./__fixtures__/ofac-fixture.js";

describe("ScentsX credit exposure (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });

  it("counts open orders, shipped-not-billed and draft invoices against the credit limit", async () => {
    const co = await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source) VALUES ('Credit test buyer', 'test') RETURNING id::text`);
    const companyId = co.rows[0]!.id;
    await db.query(
      `INSERT INTO perfume.customer_accounts (company_id, account_type, terms_days, credit_limit_cents, approved_by, approved_at)
       VALUES ($1::uuid, 'credit', 30, 30000, $2::uuid, now())`, [companyId, TEST_OWNER_USER_ID]
    );
    const so = await db.query<{ id: string }>(
      `INSERT INTO perfume.sales_orders (company_id, customer_name) VALUES ($1::uuid, 'Credit test buyer') RETURNING id::text`, [companyId]
    );
    await db.query(
      `INSERT INTO perfume.sales_order_lines (order_id, line_no, description, qty, qty_shipped, unit_price_cents) VALUES ($1::uuid, 1, 'Test EDP', 10, 4, 2500)`,
      [so.rows[0]!.id]
    );

    const before = await creditExposure(db, companyId);
    expect(before).toMatchObject({
      customer_id: null, account_type: "credit", credit_limit_cents: 30000, open_ar_cents: 0, draft_invoice_cents: 0,
      shipped_not_billed_cents: 10000, open_order_cents: 15000, exposure_cents: 25000, available_cents: 5000, over_limit: false,
    });

    const cust = await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data) VALUES ('Credit test buyer', scentsx.company_id(), false) RETURNING id::text`
    );
    await createLink(db, TEST_OWNER_USER_ID, "customer", companyId, cust.rows[0]!.id);
    await loadSanctionsList(db, TEST_OWNER_USER_ID, fixtureFetcher);
    await screenParty(db, TEST_OWNER_USER_ID, { kind: "customer", id: cust.rows[0]!.id });
    await invoiceSalesOrder(db, TEST_OWNER_USER_ID, so.rows[0]!.id);
    // The 4 billed units move from "shipped not billed" to "draft invoices"; the exposure total does not change.
    const after = await creditExposure(db, companyId);
    expect(after).toMatchObject({ shipped_not_billed_cents: 0, draft_invoice_cents: 10000, open_order_cents: 15000, exposure_cents: 25000 });

    await db.query(`UPDATE perfume.sales_order_lines SET qty_shipped = 10 WHERE order_id = $1::uuid`, [so.rows[0]!.id]);
    await db.query(`UPDATE perfume.customer_accounts SET credit_limit_cents = 10000 WHERE company_id = $1::uuid`, [companyId]);
    const over = await creditExposure(db, companyId);
    expect(over).toMatchObject({ shipped_not_billed_cents: 15000, draft_invoice_cents: 10000, open_order_cents: 0, exposure_cents: 25000, credit_limit_cents: 10000, over_limit: true, available_cents: -15000 });
  });
});
