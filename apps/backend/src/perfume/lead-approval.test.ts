/** Owner 2026-11-28 14:30 CT: a lead is not a customer or vendor until approved. Real Postgres, rolled back, as the app role. */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { approveCompanies, unapproveCompanies } from "./lead-approval.service.js";
import { contactCounts, listContacts } from "./contacts.service.js";
import { companyHistory } from "./leads.events.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("lead approval (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SET LOCAL ROLE ih35_app");
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("an imported 'customer' stays a lead until approved; approve moves it to Customers; send back returns it; business on file stays", async () => {
    const mk = async (name: string) => (await db.query<{ id: string }>(
      `INSERT INTO perfume.contact_companies (name, source, role) VALUES ($1, 'test', 'customer') RETURNING id::text`, [name])).rows[0]!.id;
    const a = await mk("ZZ Approval Lead A");
    const b = await mk("ZZ Approval Lead B");
    const inList = async (stage: "lead" | "approved", id: string) =>
      (await listContacts(db as never, { stage, q: "ZZ Approval Lead", limit: 50 })).rows.some((r: { id: string }) => r.id === id);
    expect(await inList("lead", a)).toBe(true);
    expect(await inList("approved", a)).toBe(false); // an import's role alone never makes it a customer
    const before = await contactCounts(db as never);

    expect(await approveCompanies(db as never, TEST_OWNER_USER_ID, [a, b], "both")).toMatchObject({ approved: 2, not_found: 0 });
    expect(await inList("approved", a)).toBe(true);
    expect(await inList("lead", a)).toBe(false);
    expect((await db.query(`SELECT role, approved_by::text FROM perfume.contact_companies WHERE id = $1`, [a])).rows[0]).toMatchObject({ role: "both", approved_by: TEST_OWNER_USER_ID });
    const after = await contactCounts(db as never);
    expect(after.leads).toBe(before.leads - 2);
    expect(after.approved_customers).toBe(before.approved_customers + 2);
    expect(after.approved_vendors).toBe(before.approved_vendors + 2);

    await db.query(`INSERT INTO perfume.quotes (company_id, customer_name) VALUES ($1::uuid, 'ZZ Approval Lead B')`, [b]); // B has a quote
    const r = await unapproveCompanies(db as never, TEST_OWNER_USER_ID, [a, b]);
    expect(r.sent_back).toBe(1);
    expect(r.kept.map((k) => k.id)).toEqual([b]);
    expect(await inList("lead", a)).toBe(true);
    const acts = (await companyHistory(db as never, a)).map((e: { action: string }) => e.action);
    expect(acts).toEqual(expect.arrayContaining(["approved", "unapproved"]));
  });
});
