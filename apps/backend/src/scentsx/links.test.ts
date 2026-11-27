/**
 * SCENTSX B1-B3a — the company, its chart, and the two database walls, on real Postgres rolled back.
 * A ScentsX link is accepted; a link to a carrier's customer, or a link carrying a carrier's company id, is refused.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createLink, listLinks, scentsxChart, scentsxSummary, ScentsxLinkInvalid, voidLink } from "./links.service.js";

describe("ScentsX company, chart and walls (real Postgres, rolled back)", () => {
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

  it("ScentsX is its own distributor company with a goods chart and the poster's roles bound", async () => {
    const s = await scentsxSummary(db);
    expect(s).toMatchObject({ code: "SCENTSX", legal_name: "ScentsX LLC", short_name: "TIO Perfumes", company_type: "distributor" });
    expect(s!.accounts).toBeGreaterThanOrEqual(43);
    expect(s!.roles).toBeGreaterThanOrEqual(14);
    const roles = await db.query<{ role: string; account_number: string }>(
      `SELECT r.role, a.account_number FROM accounting.chart_of_accounts_roles r JOIN catalogs.accounts a ON a.id = r.account_id
        WHERE r.operating_company_id = scentsx.company_id() AND r.is_active AND r.role IN ('ar_control', 'ap_control', 'sales_tax_payable')
        ORDER BY r.role`
    );
    expect(roles.rows).toEqual([
      { role: "ap_control", account_number: "2000" },
      { role: "ar_control", account_number: "1100" },
      { role: "sales_tax_payable", account_number: "2100" },
    ]);
    const leak = await db.query(
      `SELECT 1 FROM accounting.chart_of_accounts_roles r JOIN catalogs.accounts a ON a.id = r.account_id
        WHERE r.operating_company_id = scentsx.company_id() AND a.operating_company_id <> r.operating_company_id`
    );
    expect(leak.rows).toHaveLength(0);
  });

  it("links a TIO Perfumes contact to a ScentsX customer, refuses a carrier's customer, and voids with a reason", async () => {
    const co = await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source) VALUES ('Wall test buyer', 'test') RETURNING id::text`);
    const sx = await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data) VALUES ('Wall test SX customer', scentsx.company_id(), true) RETURNING id::text`
    );
    const carrier = await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data)
       VALUES ('Wall test carrier customer', (SELECT id FROM org.companies WHERE code = 'TRANSP'), true) RETURNING id::text`
    );
    await db.query("SAVEPOINT carrier");
    await expect(createLink(db, TEST_OWNER_USER_ID, "customer", co.rows[0]!.id, carrier.rows[0]!.id)).rejects.toBeInstanceOf(ScentsxLinkInvalid);
    await db.query("ROLLBACK TO SAVEPOINT carrier");

    await db.query("SAVEPOINT wrongco");
    await expect(db.query(
      `INSERT INTO scentsx.customer_links (operating_company_id, contact_company_id, customer_id)
       VALUES ((SELECT id FROM org.companies WHERE code = 'USMCA'), $1::uuid, $2::uuid)`, [co.rows[0]!.id, sx.rows[0]!.id]
    )).rejects.toThrow(/must belong to SCENTSX/);
    await db.query("ROLLBACK TO SAVEPOINT wrongco");

    const link = await createLink(db, TEST_OWNER_USER_ID, "customer", co.rows[0]!.id, sx.rows[0]!.id);
    expect((await listLinks(db, "customer", { desk_id: co.rows[0]!.id }))[0]).toMatchObject({ id: link.id, engine_name: "Wall Test Sx Customer", voided_at: null });
    await expect(createLink(db, TEST_OWNER_USER_ID, "customer", co.rows[0]!.id, sx.rows[0]!.id)).rejects.toBeInstanceOf(ScentsxLinkInvalid);
    await voidLink(db, TEST_OWNER_USER_ID, "customer", link.id, "linked to the wrong customer");
    expect((await listLinks(db, "customer", { desk_id: co.rows[0]!.id }))[0]).toMatchObject({ void_reason: "linked to the wrong customer" });
  });

  it("the Books chart lists every ScentsX account with the poster role it plays", async () => {
    const chart = await scentsxChart(db);
    expect(chart.length).toBeGreaterThanOrEqual(43);
    expect(chart.find((a) => a.account_number === "1100")).toMatchObject({ account_name: "Accounts Receivable (A/R)", roles: ["ar_control"] });
    expect(chart.find((a) => a.account_number === "2100")!.roles).toContain("sales_tax_payable");
    expect(chart.every((a) => a.debit_cents === "0" && a.credit_cents === "0")).toBe(true);
  });
});
