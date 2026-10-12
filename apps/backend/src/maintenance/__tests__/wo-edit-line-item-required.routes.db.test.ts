/**
 * ACCT-F4431382 — the WO EDIT path (POST /api/v1/maintenance/work-orders/:id/line-items) writes the line's ITEM, and
 * refuses a line with no item by name (real Postgres, real route). The WO -> bill copy posts each bill line to its
 * work-order line's item account and refuses an itemless line (wo_line_item_required, #26704). On origin/main this
 * route ignored item_id: the line was written with item_id NULL (201), so billing that WO always failed later.
 *  1. no item            -> 422 wo_line_item_required, nothing written
 *  2. another company's  -> 422 wo_line_item_not_in_company, nothing written
 *  3. this company's     -> 201, work_order_lines.item_id = the item; the bill copy then posts the line to the
 *                           item's default expense account (bill_lines.account_id = item account, item_id = item)
 */
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { createIsolatedOperatingCompany, deactivateIsolatedOperatingCompany } from "../../../test-helpers/isolated-company.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { registerMaintenanceWorkOrderRoutes } from "../work-orders.routes.js";
import { autoCreateBillFromWO, createWorkOrderWithLines } from "../two-section-service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("WO edit line-items route writes the line's item; refuses an itemless line (real Postgres)", () => {
  let app: FastifyInstance;
  let db: pg.Client;
  let opco = "";
  let otherOpco = "";
  let woId = "";
  let item = "";
  let itemAccount = "";
  let foreignItem = "";

  async function bypass<T>(company: string, fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [company]);
    try {
      const out = await fn();
      await db.query("COMMIT");
      return out;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }
  const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;

  beforeAll(async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    opco = (await createIsolatedOperatingCompany({ codePrefix: "WEI", legalNamePrefix: "WO edit line item" })).companyId;
    otherOpco = (await createIsolatedOperatingCompany({ codePrefix: "WEX", legalNamePrefix: "WO edit line item other" })).companyId;
    const tag = `WEI${Date.now().toString(36).toUpperCase()}`;

    foreignItem = await bypass(otherOpco, async () => {
      const acct = (await one(
        `INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number, is_postable)
         VALUES ($1, 'WEX other company account', 'Expense', $2, true) RETURNING id::text AS id`,
        [otherOpco, `${tag.slice(-5)}9`]
      )).id;
      return (await one(
        `INSERT INTO catalogs.items (operating_company_id, item_type, item_name, default_expense_account_id)
         VALUES ($1, 'Service', $2, $3) RETURNING id::text AS id`,
        [otherOpco, `${tag} other company item`, acct]
      )).id;
    });

    await bypass(opco, async () => {
      itemAccount = (await one(
        `INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number, is_postable)
         VALUES ($1, 'WEI repair item account', 'Expense', $2, true) RETURNING id::text AS id`,
        [opco, `${tag.slice(-5)}1`]
      )).id;
      item = (await one(
        `INSERT INTO catalogs.items (operating_company_id, item_type, item_name, default_expense_account_id)
         VALUES ($1, 'Service', $2, $3) RETURNING id::text AS id`,
        [opco, `${tag} brake service`, itemAccount]
      )).id;
      const unit = (await one(
        `INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
        [`${tag}-U1`, `VIN${tag}`.slice(0, 17), opco]
      )).id;
      const vendor = (await one(
        `INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, 'WEI Brake Shop', 'other') RETURNING id::text AS id`,
        [opco]
      )).id;
      // A WO created with NO lines (in-house) — its cost lines arrive through the EDIT route under test.
      woId = (
        await createWorkOrderWithLines(
          db as never,
          TEST_OWNER_USER_ID,
          {
            operating_company_id: opco,
            wo_type: "repair",
            source_type: "ES",
            unit_id: unit,
            repair_location: "WEI shop",
            bucket: "external",
            vendor_id: vendor,
            external_vendor_id: vendor,
            external_vendor_invoice_number: `${tag}-INV`,
            description: "Brake job",
            payment_timing: "in_house",
            load_exemption_reason: "shop_repair_no_load",
          },
          [],
          []
        )
      ).woUuid;
    });

    app = await createIntegrationApp(async (a) => {
      await registerMaintenanceWorkOrderRoutes(a);
    });
  });

  afterAll(async () => {
    await app?.close();
    if (db) {
      for (const c of [opco, otherOpco].filter(Boolean)) {
        await bypass(c, () => deactivateIsolatedOperatingCompany(db, c));
      }
      await db.end();
    }
  });

  const post = (body: Record<string, unknown>) =>
    app.inject({
      method: "POST",
      url: `/api/v1/maintenance/work-orders/${woId}/line-items?operating_company_id=${opco}`,
      headers: testAuthHeaders(undefined, "Owner"),
      payload: { line_type: "parts", description: "Brake pads", quantity: 2, unit_cost: 40, amount: 80, ...body },
    });
  const lineCount = async () =>
    bypass(opco, async () =>
      Number((await one<{ n: string }>(`SELECT count(*)::text AS n FROM maintenance.work_order_lines WHERE work_order_uuid = $1::uuid`, [woId])).n)
    );

  it("a line with no item is refused by name — nothing written", async () => {
    const res = await post({});
    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: string }).error).toBe("wo_line_item_required");
    expect(await lineCount()).toBe(0);
  });

  it("another company's item is refused by name — nothing written", async () => {
    const res = await post({ item_id: foreignItem });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: string }).error).toBe("wo_line_item_not_in_company");
    expect(await lineCount()).toBe(0);
  });

  it("this company's item is written on the line, and the bill copy posts the line to the item's account", async () => {
    const res = await post({ item_id: item });
    expect(res.statusCode).toBeLessThan(300);
    const stored = await bypass(opco, () =>
      one<{ item_id: string | null }>(`SELECT item_id::text FROM maintenance.work_order_lines WHERE work_order_uuid = $1::uuid`, [woId])
    );
    expect(stored.item_id).toBe(item);

    // Bill it (rolled back): the edit-path line bills to its item's account — no wo_line_item_required.
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [opco]);
      const bill = await autoCreateBillFromWO(db as never, TEST_OWNER_USER_ID, woId);
      expect(bill?.uuid).toBeTruthy();
      const line = await one<{ account_id: string; item_id: string }>(
        `SELECT account_id::text, item_id::text FROM accounting.bill_lines WHERE bill_id = $1::uuid`,
        [bill!.uuid]
      );
      expect(line.account_id).toBe(itemAccount);
      expect(line.item_id).toBe(item);
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
