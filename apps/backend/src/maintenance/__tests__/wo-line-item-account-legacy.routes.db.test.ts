/**
 * ACCT-F4431382 follow-up (real Postgres, real routes):
 *  A. Legacy flat create (POST /api/v1/maintenance/work-orders, no header/sectionA): a PRICED line with no item is
 *     refused by name (422 wo_line_item_required) and no work order is written; a $0 line with no item (the server
 *     engines' placeholder, skipped by the bill copy) still saves; a priced line WITH its item saves the item.
 *  B. DEGH-03 — a category line's item must post to that category's account. The V5 create route (Section A) and the
 *     edit /line-items route (when it names a category) refuse a mismatch with 422 wo_line_item_account_mismatch,
 *     writing nothing; the matching item saves.
 * On origin/main every refusal case returned 201 and wrote the row.
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
import { createWorkOrderWithLines } from "../two-section-service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("WO line item: legacy priced-line refusal + category/item account match (real Postgres)", () => {
  let app: FastifyInstance;
  let db: pg.Client;
  let opco = "";
  let unit = "";
  let tiresAccount = "";
  let repairAccount = "";
  let tireItem = "";
  let repairItem = "";
  let woId = "";
  let tag = "";

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [opco]);
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
  const woCount = () =>
    bypass(async () => Number((await one<{ n: string }>(`SELECT count(*)::text AS n FROM maintenance.work_orders WHERE operating_company_id = $1::uuid`, [opco])).n));
  const lineCount = () =>
    bypass(async () => Number((await one<{ n: string }>(`SELECT count(*)::text AS n FROM maintenance.work_order_lines WHERE work_order_uuid = $1::uuid`, [woId])).n));

  beforeAll(async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    opco = (await createIsolatedOperatingCompany({ codePrefix: "WLA", legalNamePrefix: "WO line item account" })).companyId;
    tag = `WLA${Date.now().toString(36).toUpperCase()}`;
    await bypass(async () => {
      const acct = async (name: string, n: string) =>
        (await one(
          `INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number, is_postable)
           VALUES ($1, $2, 'Expense', $3, true) RETURNING id::text AS id`,
          [opco, name, `${tag.slice(-5)}${n}`]
        )).id;
      tiresAccount = await acct("WLA tires expense", "1");
      repairAccount = await acct("WLA repair expense", "2");
      const item = async (name: string, account: string) =>
        (await one(
          `INSERT INTO catalogs.items (operating_company_id, item_type, item_name, default_expense_account_id)
           VALUES ($1, 'Service', $2, $3) RETURNING id::text AS id`,
          [opco, `${tag} ${name}`, account]
        )).id;
      tireItem = await item("tire", tiresAccount);
      repairItem = await item("repair", repairAccount);
      unit = (await one(
        `INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
        [`${tag}-U1`, `VIN${tag}`.slice(0, 17), opco]
      )).id;
      woId = (
        await createWorkOrderWithLines(
          db as never,
          TEST_OWNER_USER_ID,
          { operating_company_id: opco, wo_type: "pm", source_type: "IS", unit_id: unit, repair_location: "in_house", description: "WLA edit target", payment_timing: "in_house" },
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
      if (opco) await bypass(() => deactivateIsolatedOperatingCompany(db, opco));
      await db.end();
    }
  });

  const inject = (url: string, payload: Record<string, unknown>) =>
    app.inject({ method: "POST", url, headers: testAuthHeaders(undefined, "Owner"), payload });
  const legacy = (lines: Array<Record<string, unknown>>) =>
    inject("/api/v1/maintenance/work-orders", {
      operating_company_id: opco,
      wo_type: "pm",
      source_type: "IS",
      unit_id: unit,
      repair_location: "in_house",
      description: "WLA legacy",
      payment_timing: "in_house",
      line_items: lines,
    });
  const v5 = (item: string) =>
    inject("/api/v1/maintenance/work-orders", {
      header: { operating_company_id: opco, wo_type: "pm", source_type: "IS", unit_id: unit, repair_location: "in_house", description: "WLA v5", payment_timing: "in_house" },
      sectionA: [{ description: "Steer tire", quantity: 1, amount: 300, expense_category_uuid: tiresAccount, item_id: item }],
      sectionB: [],
    });
  const priced = { line_type: "parts", description: "Brake pads", quantity: 2, unit_cost: 40, amount: 80 };

  it("A1 legacy: a priced line with no item -> 422 wo_line_item_required, no work order written", async () => {
    const before = await woCount();
    const res = await legacy([priced]);
    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: string }).error).toBe("wo_line_item_required");
    expect(await woCount()).toBe(before);
  });

  it("A2 legacy: a $0 line with no item still saves (the bill copy skips it)", async () => {
    const res = await legacy([{ line_type: "other", description: "placeholder", quantity: 1, unit_cost: 0, amount: 0 }]);
    expect(res.statusCode).toBe(201);
  });

  it("A3 legacy: a priced line WITH its item saves the item on the line", async () => {
    const res = await legacy([{ ...priced, item_id: repairItem }]);
    expect(res.statusCode).toBe(201);
    const id = String((res.json() as { id: string }).id);
    const line = await bypass(() => one<{ item_id: string }>(`SELECT item_id::text FROM maintenance.work_order_lines WHERE work_order_uuid = $1::uuid`, [id]));
    expect(line.item_id).toBe(repairItem);
  });

  it("B1 V5 create: a Section A item of another account than its category -> 422 wo_line_item_account_mismatch, nothing written", async () => {
    const before = await woCount();
    const res = await v5(repairItem);
    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: string }).error).toBe("wo_line_item_account_mismatch");
    expect(await woCount()).toBe(before);
  });

  it("B2 V5 create: the item that posts to the category account saves", async () => {
    const res = await v5(tireItem);
    expect(res.statusCode).toBe(201);
  });

  it("B3 edit /line-items: a category line whose item posts elsewhere -> 422 mismatch; the matching item saves", async () => {
    const url = `/api/v1/maintenance/work-orders/${woId}/line-items?operating_company_id=${opco}`;
    const bad = await inject(url, { ...priced, item_id: repairItem, expense_category_uuid: tiresAccount });
    expect(bad.statusCode).toBe(422);
    expect((bad.json() as { error: string }).error).toBe("wo_line_item_account_mismatch");
    expect(await lineCount()).toBe(0);
    const good = await inject(url, { ...priced, item_id: tireItem, expense_category_uuid: tiresAccount });
    expect(good.statusCode).toBeLessThan(300);
    expect(await lineCount()).toBe(1);
  });
});
