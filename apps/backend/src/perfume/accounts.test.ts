/**
 * PERFUME-PRICE-LEVELS + CUSTOMER-ACCOUNTS (owner 2026-11-26 20:21 / 20:28 CT). Real Postgres, one transaction rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { AcctInvalid, decideApplication, getAccount, levelPriceFor, listLevels, saveAccount, saveLevel, setHold, setLevelItem, submitApplication } from "./accounts.service.js";
import { addLine, createQuote } from "./quotes.service.js";
import { addOrderLine, createOrder, OrderInvalid, shipOrder } from "./orders.service.js";
import { stockIn } from "./inventory.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("price levels and customer accounts (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(`INSERT INTO perfume.locations (code, name, sort_order, kind, own) VALUES ('ZAC', 'ZZ Accounts site', 900, 'warehouse', true)`);
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });

  it("the four levels exist with no % until the owner sets one; a level prices from the average cost, a fixed price wins at its quantity", async () => {
    const levels = await listLevels(db as never);
    expect(levels.map((l) => l.name).slice(0, 4)).toEqual(["Retail", "Wholesale", "Distributor", "Export Mexico"]);
    expect(levels.slice(0, 4).every((l) => l.pct === null)).toBe(true);
    const wholesale = levels.find((l) => l.name === "Wholesale")!;
    await saveLevel(db as never, TEST_OWNER_USER_ID, wholesale.id, { pct: 20, method: "markup", cost_basis: "avg" });
    await expect(saveLevel(db as never, TEST_OWNER_USER_ID, wholesale.id, { method: "margin", pct: 100 })).rejects.toBeInstanceOf(AcctInvalid);

    const item = (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, identity_key, loose_key, display_name) VALUES ('ZZA', 'LEVEL', 100, 'EDP', 'M', 'ZZA|LEVEL|100|EDP|M|', 'x', 'ZZA · LEVEL') RETURNING id`)).rows[0].id;
    await stockIn(db as never, TEST_OWNER_USER_ID, { kind: "opening", item_id: item, location_code: "ZAC", qty: 10, unit_cost_cents: 1000, source: "opening" });
    const co = (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, role, source) VALUES ('ZZA Customer', 'customer', 'ACCTTEST') RETURNING id`)).rows[0].id;
    expect(await levelPriceFor(db as never, co, item, 1, 900)).toBeNull(); // no account yet → the desk's own rule applies
    await saveAccount(db as never, TEST_OWNER_USER_ID, co, { price_level_id: wholesale.id });
    expect(await levelPriceFor(db as never, co, item, 1, 900)).toMatchObject({ cents: 1200, level: "Wholesale", how: "avg" });
    await setLevelItem(db as never, TEST_OWNER_USER_ID, wholesale.id, item, 12, 1100);
    expect((await levelPriceFor(db as never, co, item, 11, 900))!.cents).toBe(1200);
    expect((await levelPriceFor(db as never, co, item, 12, 900))).toMatchObject({ cents: 1100, how: "fixed" });

    // A quote and an order for this customer take the level's price when none is typed.
    const q = await createQuote(db as never, TEST_OWNER_USER_ID, { company_id: co });
    expect((await addLine(db as never, TEST_OWNER_USER_ID, q.id, { item_id: item, qty: 12 })).unit_price_cents).toBe(1100);
    const o = await createOrder(db as never, TEST_OWNER_USER_ID, { company_id: co, location_code: "ZAC" } as never);
    expect((await addOrderLine(db as never, TEST_OWNER_USER_ID, o.id, { item_id: item, qty: 2 })).unit_price_cents).toBe(1200);

    // A hold stops shipping (with the reason), never ordering; the release is recorded.
    await setHold(db as never, TEST_OWNER_USER_ID, co, true, "two invoices past 60 days");
    await expect(shipOrder(db as never, TEST_OWNER_USER_ID, o.id)).rejects.toThrow(/on hold: two invoices past 60 days/);
    await expect(shipOrder(db as never, TEST_OWNER_USER_ID, o.id)).rejects.toBeInstanceOf(OrderInvalid);
    await setHold(db as never, TEST_OWNER_USER_ID, co, false, "paid");
    expect((await shipOrder(db as never, TEST_OWNER_USER_ID, o.id)).cost_cents).toBe(2000);
  });

  it("credit only through an approved application; a limit by hand is refused; rejecting needs a reason; history keeps every step", async () => {
    const co = (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, role, source) VALUES ('ZZA Credit', 'customer', 'ACCTTEST') RETURNING id`)).rows[0].id;
    await saveAccount(db as never, TEST_OWNER_USER_ID, co, {});
    await expect(saveAccount(db as never, TEST_OWNER_USER_ID, co, { credit_limit_cents: 500000 })).rejects.toBeInstanceOf(AcctInvalid);
    const a1 = await submitApplication(db as never, TEST_OWNER_USER_ID, co, { legal_name: "ZZA Credit SA de CV", tax_number: "ZZA010101AAA", requested_limit_cents: 3_000_000, requested_terms_days: 30 });
    await expect(decideApplication(db as never, TEST_OWNER_USER_ID, a1.id, { decision: "rejected", note: " " })).rejects.toBeInstanceOf(AcctInvalid);
    await decideApplication(db as never, TEST_OWNER_USER_ID, a1.id, { decision: "approved", limit_cents: 2_600_000, terms_days: 15, note: "trade refs good" });
    await expect(decideApplication(db as never, TEST_OWNER_USER_ID, a1.id, { decision: "withdrawn" })).rejects.toBeInstanceOf(AcctInvalid);
    const g = await getAccount(db as never, co);
    expect([g.account!.account_type, g.account!.credit_limit_cents, g.account!.terms_days, g.account!.tax_number]).toEqual(["credit", 2_600_000, 15, "ZZA010101AAA"]);
    expect(g.events.map((e) => e["kind"])).toEqual(["created", "application", "approved"]);
    expect((g.events.at(-1)!["detail"] as Record<string, unknown>)["over_25000"]).toBe(true);
    // Back to cash clears the limit and terms.
    await saveAccount(db as never, TEST_OWNER_USER_ID, co, { account_type: "cash" });
    const g2 = await getAccount(db as never, co);
    expect([g2.account!.account_type, g2.account!.credit_limit_cents, g2.account!.terms_days]).toEqual(["cash", null, null]);
  });
});
