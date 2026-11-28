/**
 * ROUND L.31 M18 E3 — salespeople: a customer company has ONE live salesperson, reassigning keeps the history, and the sales / commission
 * by salesperson report reads the imported purchase history (and ScentsX invoices) by the customer's current salesperson. Real Postgres,
 * rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { importPurchaseHistory } from "./customer-ranking.service.js";
import { assignSalesperson, companySalesperson, createSalesperson, salesBySalesperson, salespersonCustomers, SalespersonInvalid, salesRepQuery, updateSalesperson } from "./salespeople.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("perfume salespeople (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("assign with history, refuse a duplicate name, report sales + commission by current salesperson", async () => {
    const u = TEST_OWNER_USER_ID;
    await db.query(`DELETE FROM perfume.customer_purchase_history`);
    const co = async (name: string) => (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source, role) VALUES ($1, 'test', 'customer') RETURNING id::text`, [name])).rows[0]!.id;
    const a = await co("ZZ SP Buyer A"); const b = await co("ZZ SP Buyer B"); const c = await co("ZZ SP Buyer C");
    const sonia = await createSalesperson(db, u, { name: "ZZ Sonia Test", commission_pct: 5 });
    const ivania = await createSalesperson(db, u, { name: "ZZ Ivania Test", commission_pct: 0 });
    await expect(createSalesperson(db, u, { name: "zz sonia   test", commission_pct: 1 })).rejects.toBeInstanceOf(SalespersonInvalid);
    expect(await assignSalesperson(db, u, { company_ids: [a, b], salesperson_id: sonia.id })).toEqual({ changed: 2, unchanged: 0 });
    expect(await assignSalesperson(db, u, { company_ids: [a], salesperson_id: sonia.id })).toEqual({ changed: 0, unchanged: 1 });
    expect(await assignSalesperson(db, u, { company_ids: [b], salesperson_id: ivania.id, reason: "moved to Ivania" })).toEqual({ changed: 1, unchanged: 0 });
    const hb = await companySalesperson(db, b);
    expect(hb.current?.salesperson).toBe("ZZ Ivania Test");
    expect(hb.history.map((h) => [h.salesperson, h.ended_at ? h.end_reason : null])).toEqual([["ZZ Ivania Test", null], ["ZZ Sonia Test", "moved to Ivania"]]);
    await db.query("SAVEPOINT dup_live");
    await expect(db.query(`INSERT INTO perfume.customer_salespeople (company_id, salesperson_id) VALUES ($1::uuid, $2::uuid)`, [b, sonia.id])).rejects.toThrow(/uq_perfume_customer_salesperson_live/);
    await db.query("ROLLBACK TO SAVEPOINT dup_live");

    const row = (no: string, name: string, cents: number, period: string) => ({ source: "usa_store" as const, customer_no: no, customer_name: name, period_kind: "month" as const,
      period_start: period, invoices: 1, amount_cents: cents, currency: "USD" as const });
    await importPurchaseHistory(db, u, [row("1", "ZZ SP Buyer A", 100000, "2026-10-01"), row("2", "ZZ SP Buyer B", 40000, "2026-10-01"),
      row("3", "ZZ SP Buyer C", 25000, "2026-10-01"), row("1", "ZZ SP Buyer A", 999900, "2025-01-01")]);
    const q = salesRepQuery.parse({ from: "2026-10-01", to: "2026-10-31", currency: "USD" });
    const rep = await salesBySalesperson(db, q);
    const by = (n: string) => rep.rows.find((r) => r.salesperson === n)!;
    expect(by("ZZ Sonia Test")).toMatchObject({ customers: 1, buying_customers: 1, history_sales_cents: 100000, sales_cents: 100000, commission_pct: 5, commission_cents: 5000 });
    expect(by("ZZ Ivania Test")).toMatchObject({ customers: 1, sales_cents: 40000, commission_cents: 0 });
    expect(by("Unassigned")).toMatchObject({ buying_customers: 1, sales_cents: 25000 });
    expect(rep.totals.sales_cents).toBe(165000);
    expect((await salespersonCustomers(db, sonia.id, q)).map((x) => [x.name, x.sales_cents])).toEqual([["ZZ SP Buyer A", 100000]]);
    expect((await salespersonCustomers(db, null, q)).map((x) => x.name)).toContain("ZZ SP Buyer C");
    await updateSalesperson(db, sonia.id, { commission_pct: 10 });
    expect((await salesBySalesperson(db, q)).rows.find((r) => r.salesperson === "ZZ Sonia Test")!.commission_cents).toBe(10000);
    void c;
  });
});
