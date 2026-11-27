/**
 * PERFUME B5 + B8 (owner 2026-11-26 20:21 / 20:28 / 21:24 CT): quarantine sites never ship, write-offs leave FIFO with a
 * second person over $500, month-end valuation both ways, PO approval at the owner's amount. Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import {
  addWriteoffLine, createWriteoff, getWriteoff, InvInvalid, postWriteoff, stockIn, stockOnHand, stockOut, submitWriteoff, valuation,
} from "./inventory.service.js";
import { addPurchaseLine, approvePurchase, createPurchaseOrder, getPurchaseOrder, PoInvalid, receivePurchase, setPoApprovalOverCents, updatePurchaseLine } from "./purchases.service.js";
import { createLink } from "../scentsx/links.service.js";
import { loadSanctionsList, screenParty } from "../scentsx/sanctions.service.js";
import { fixtureFetcher } from "../scentsx/__fixtures__/ofac-fixture.js";

const SECOND = "a0000000-0000-4000-8000-00000000c0df";
const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("ScentsX quarantine, write-offs, valuation, PO approval (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(`INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1, 'second.wo@test.invalid', 'Dispatcher', 'en') ON CONFLICT (id) DO NOTHING`, [SECOND]);
    await db.query(`INSERT INTO perfume.locations (code, name, sort_order, kind, own) VALUES ('ZQW', 'ZZ WO Warehouse', 900, 'warehouse', true), ('ZQQ', 'ZZ Quarantine', 901, 'quarantine', true)`);
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });
  const item = async (name: string) => (await db.query<{ id: string }>(
    `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, identity_key, loose_key, display_name) VALUES ('ZZW', $1, 100, 'EDP', 'M', $2, 'x', $3) RETURNING id`,
    [name, `ZZW|${name}|100|EDP|M|`, `ZZW · ${name}`])).rows[0].id;

  it("a quarantine site holds stock but never ships it; a write-off leaves FIFO; over $500 a second person posts", async () => {
    const it1 = await item("WO");
    await stockIn(db as never, TEST_OWNER_USER_ID, { kind: "opening", item_id: it1, location_code: "ZQQ", qty: 2, unit_cost_cents: 5000, source: "opening" });
    await expect(stockOut(db as never, TEST_OWNER_USER_ID, { kind: "shipment", item_id: it1, location_code: "ZQQ", qty: 1 })).rejects.toThrow(/quarantine site/);

    await stockIn(db as never, TEST_OWNER_USER_ID, { kind: "opening", item_id: it1, location_code: "ZQW", qty: 10, unit_cost_cents: 4000, source: "opening", received_on: "2026-01-02" });
    await stockIn(db as never, TEST_OWNER_USER_ID, { kind: "receipt", item_id: it1, location_code: "ZQW", qty: 10, unit_cost_cents: 7000, source: "receipt", received_on: "2026-02-02" });
    await expect(createWriteoff(db as never, TEST_OWNER_USER_ID, { location_code: "ZQW", reason: "other" })).rejects.toBeInstanceOf(InvInvalid);
    const wo = await createWriteoff(db as never, TEST_OWNER_USER_ID, { location_code: "ZQW", reason: "damaged", notes: "dropped carton" });
    expect(wo.number).toMatch(/^WO-\d{6}$/);
    await addWriteoffLine(db as never, wo.id, it1, 12);
    await expect(postWriteoff(db as never, TEST_OWNER_USER_ID, wo.id)).rejects.toThrow(/Submit/);
    // 10 × $40 + 2 × $70 = $540 → over $500.
    expect(await submitWriteoff(db as never, TEST_OWNER_USER_ID, wo.id)).toEqual({ value_cents: 54000, needs_second_person: true });
    await expect(postWriteoff(db as never, TEST_OWNER_USER_ID, wo.id)).rejects.toThrow(/second person/);
    expect(await postWriteoff(db as never, SECOND, wo.id)).toEqual({ cost_cents: 54000 });
    const g = await getWriteoff(db as never, wo.id);
    expect([g.status, g.moves.length, g.moves.reduce((t: number, m: { qty: number }) => t + m.qty, 0)]).toEqual(["posted", 2, -12]);
    expect((await stockOnHand(db as never, { item_id: it1, location: "ZQW" }))[0].qty).toBe(8);

    // Valuation at the close of today: ZQW 8 × $70 FIFO = $560; average (10×40+10×70)/20 = $55 × 8 = $440; quarantine 2 × $50.
    const today = (await db.query<{ d: string }>(`SELECT (now() AT TIME ZONE 'America/Chicago')::date::text AS d`)).rows[0].d;
    const v = await valuation(db as never, today);
    const w = v.rows.find((r) => r.location_code === "ZQW" && r.item_id === it1)!;
    const q = v.rows.find((r) => r.location_code === "ZQQ" && r.item_id === it1)!;
    expect([w.qty, w.fifo_cents, w.avg_cents]).toEqual([8, 56000, 44000]);
    expect([q.qty, q.fifo_cents, q.avg_cents]).toEqual([2, 10000, 10000]);
    // The day before anything moved, nothing was on hand.
    expect((await valuation(db as never, "2000-01-01")).rows.filter((r) => r.item_id === it1)).toEqual([]);
  });

  it("PO approval: over the owner's amount a PO is received only once approved; a later change takes the approval off", async () => {
    const it2 = await item("PO");
    const v = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZW Vendor', 'buy') RETURNING id`)).rows[0].id;
    const po = await createPurchaseOrder(db as never, TEST_OWNER_USER_ID, { vendor_id: v, location_code: "ZQW", terms: null, notes: null } as never);
    const l = await addPurchaseLine(db as never, TEST_OWNER_USER_ID, po.id, { item_id: it2, qty: 10, unit_cost_cents: 100000, description: null, upc: null, vendor_sku: null });
    await setPoApprovalOverCents(db as never, TEST_OWNER_USER_ID, 500000); // $5,000
    const g1 = await getPurchaseOrder(db as never, po.id);
    expect([g1.needs_approval, g1.awaiting_approval, g1.approval_over_cents]).toEqual([true, true, 500000]);
    await expect(receivePurchase(db as never, TEST_OWNER_USER_ID, po.id)).rejects.toThrow(/\$10,000\.00 — over your approval amount of \$5,000\.00/);
    await expect(receivePurchase(db as never, TEST_OWNER_USER_ID, po.id)).rejects.toBeInstanceOf(PoInvalid);
    // Owner 22:50 CT "over 50K": a PO exactly at the amount does not need approval.
    await setPoApprovalOverCents(db as never, TEST_OWNER_USER_ID, 1_000_000);
    expect((await getPurchaseOrder(db as never, po.id)).needs_approval).toBe(false);
    await setPoApprovalOverCents(db as never, TEST_OWNER_USER_ID, 500000);
    // SCENTSX B13: ScentsX approves no PO to a vendor that is not its vendor, or not screened clear against OFAC.
    await db.query("SAVEPOINT nolink");
    await expect(approvePurchase(db as never, TEST_OWNER_USER_ID, po.id)).rejects.toThrow(/not a ScentsX vendor yet/);
    await db.query("ROLLBACK TO SAVEPOINT nolink");
    const ev = (await db.query<{ id: string }>(
      `INSERT INTO mdata.vendors (vendor_name, vendor_type, operating_company_id, is_sample_data) VALUES ('ZZW Vendor', 'Other', scentsx.company_id(), true) RETURNING id::text`
    )).rows[0].id;
    await createLink(db as never, TEST_OWNER_USER_ID, "vendor", v, ev);
    await loadSanctionsList(db as never, TEST_OWNER_USER_ID, fixtureFetcher);
    await db.query("SAVEPOINT unscreened");
    await expect(approvePurchase(db as never, TEST_OWNER_USER_ID, po.id)).rejects.toThrow(/not been screened against the OFAC list/);
    await db.query("ROLLBACK TO SAVEPOINT unscreened");
    expect((await screenParty(db as never, TEST_OWNER_USER_ID, { kind: "vendor", id: ev })).result).toBe("clear");
    await approvePurchase(db as never, TEST_OWNER_USER_ID, po.id, "ok for Q4");
    await expect(approvePurchase(db as never, TEST_OWNER_USER_ID, po.id)).rejects.toBeInstanceOf(PoInvalid);
    await updatePurchaseLine(db as never, TEST_OWNER_USER_ID, l.id, { qty: 12 });
    expect((await getPurchaseOrder(db as never, po.id)).awaiting_approval).toBe(true);
    await approvePurchase(db as never, TEST_OWNER_USER_ID, po.id);
    await receivePurchase(db as never, TEST_OWNER_USER_ID, po.id);
    const g2 = await getPurchaseOrder(db as never, po.id);
    expect(g2.status).toBe("received");
    expect(g2.events.map((e) => e["kind"]).filter((k) => String(k).startsWith("approv"))).toEqual(["approved", "approval_removed", "approved"]);
    // No amount = no approval step.
    await setPoApprovalOverCents(db as never, TEST_OWNER_USER_ID, null);
    expect((await getPurchaseOrder(db as never, po.id)).needs_approval).toBe(false);
  });
});
