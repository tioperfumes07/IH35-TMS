/** ROUND L.31 M18 E2 — the companies the bulk "Make ScentsX customer" offers: live customer companies with an email, no ScentsX link. */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { eligibleForScentsxCustomer } from "./links.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("eligible for Make ScentsX customer (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("offers a live customer with an email; leaves out no-email, archived, merged and vendor-only companies", async () => {
    const co = async (name: string, role: string) => (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source, role) VALUES ($1, 'test', $2) RETURNING id::text`, [name, role])).rows[0]!.id;
    const person = (company: string, email: string | null) => db.query(`INSERT INTO perfume.contact_people (company_id, name, email) VALUES ($1::uuid, 'Test person', $2)`, [company, email]);
    const ok = await co("ZZ E2 ok", "customer"); await person(ok, "ok@example.com");
    const both = await co("ZZ E2 both", "both"); await person(both, "both@example.com");
    const noEmail = await co("ZZ E2 no email", "customer"); await person(noEmail, null);
    const archived = await co("ZZ E2 archived", "customer"); await person(archived, "a@example.com");
    await db.query(`UPDATE perfume.contact_companies SET archived_at = now() WHERE id = $1::uuid`, [archived]);
    const merged = await co("ZZ E2 merged", "customer"); await person(merged, "m@example.com");
    await db.query(`UPDATE perfume.contact_companies SET merged_into_id = $2::uuid WHERE id = $1::uuid`, [merged, ok]);
    const vendor = await co("ZZ E2 vendor", "vendor"); await person(vendor, "v@example.com");
    const r = await eligibleForScentsxCustomer(db, 500);
    const ids = new Set(r.contacts.map((x) => x.id));
    expect(ids.has(ok) && ids.has(both)).toBe(true);
    for (const x of [noEmail, archived, merged, vendor]) expect(ids.has(x)).toBe(false);
    expect(r.contacts.find((x) => x.id === ok)).toMatchObject({ name: "ZZ E2 ok", email: "ok@example.com" });
    expect(r.total).toBeGreaterThanOrEqual(2);
  });
});
