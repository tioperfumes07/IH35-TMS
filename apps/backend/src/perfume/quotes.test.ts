/**
 * PERFUME-QUOTES (owner 2026-11-26 18:13 CT: quotations with history, Excel and PDF). Real Postgres, one transaction rolled back.
 */
import pg from "pg";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import {
  addLine, copyQuote, createQuote, getQuote, listQuotes, quoteHtml, QuoteInvalid, quotesOfCompany, quotesOfItem, quoteXlsx, removeLine, searchQuoteItems, setQuoteStatus, updateLine,
} from "./quotes.service.js";
import { getRules } from "./desk.service.js";
import { priceFromCost } from "./pricing.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("quotations (real Postgres, rolled back)", () => {
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

  it("numbers a quote, takes the customer from Contacts, prices a line from the best supplier cost, keeps every change, links both ways", async () => {
    const co = (await db.query<{ id: string }>(
      `INSERT INTO perfume.contact_companies (name, role, phone, source) VALUES ('ZZQ Perfumes', 'customer', '+52 867 000 0000', 'QUOTETEST') RETURNING id`)).rows[0].id;
    await db.query(`INSERT INTO perfume.contact_people (company_id, name, email) VALUES ($1, 'Ana', 'ana@zzq.test')`, [co]);
    const item = (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, identity_key, loose_key, display_name) VALUES ('ZZQ', 'NIGHT', 100, 'EDP', 'M', 'ZZQ|NIGHT|100|EDP|M|', 'x', 'ZZQ · NIGHT · 100 ml') RETURNING id`)).rows[0].id;
    await db.query(`INSERT INTO perfume.item_upcs (upc, item_id) VALUES ('8099911122334', $1)`, [item]);
    const v = async (name: string, kind: string, cents: number) => {
      const vid = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ($1, $2) RETURNING id`, [name, kind])).rows[0].id;
      const l = (await db.query<{ id: string }>(
        `INSERT INTO perfume.price_lists (vendor_id, list_date, file_name, source_kind, rows_read, rows_saved, rows_skipped, price_total_file_cents, price_total_saved_cents, is_current)
         VALUES ($1, '2026-11-26', 'q.xlsx', 'xlsx', 1, 1, 0, $2, $2, true) RETURNING id`, [vid, cents])).rows[0].id;
      await db.query(`INSERT INTO perfume.price_list_rows (list_id, row_no, raw, description, price_cents, identity_key, loose_key, item_id, match_method, match_status)
        VALUES ($1, 1, '{}', 'ZZQ NIGHT', $2, 'x', 'x', $3, 'upc', 'matched')`, [l, cents, item]);
      return vid;
    };
    const cheap = await v("ZZQ Supplier A", "buy", 1000);
    await v("ZZQ Supplier B", "buy", 1200);
    await v("ZZQ Competitor", "sell", 800); // a competitor's price is never my cost

    const q = await createQuote(db as never, TEST_OWNER_USER_ID, { company_id: co, valid_until: "2027-12-31" });
    expect(q.number).toMatch(/^QT-\d{6}$/);
    const line = await addLine(db as never, TEST_OWNER_USER_ID, q.id, { item_id: item, qty: 12 });
    // $10.00 (the cheapest supplier, never the competitor's $8.00) + the owner's first wholesale target — exact cents.
    const pct = (await getRules(db as never)).wholesale_targets_pct[0]!;
    expect(line.unit_price_cents).toBe(priceFromCost(1000, pct, "markup"));
    await expect(addLine(db as never, TEST_OWNER_USER_ID, q.id, { description: "Gift bag", qty: 1 })).rejects.toBeInstanceOf(QuoteInvalid);
    const bag = await addLine(db as never, TEST_OWNER_USER_ID, q.id, { description: "Gift bag", qty: 1, unit_price_cents: 250 });
    await updateLine(db as never, TEST_OWNER_USER_ID, line.id, { qty: 24, unit_price_cents: 1150 });
    await removeLine(db as never, TEST_OWNER_USER_ID, bag.id);
    await setQuoteStatus(db as never, TEST_OWNER_USER_ID, q.id, "sent");

    const full = await getQuote(db as never, q.id);
    expect([full.customer_name, full.customer_email, full.customer_phone, full.status]).toEqual(["ZZQ Perfumes", "ana@zzq.test", "+52 867 000 0000", "sent"]);
    expect(full.lines.map((l) => [l.description, l.upc, l.qty, l.unit_price_cents, l.cost_cents, l.cost_vendor_id])).toEqual([["ZZQ · NIGHT · 100 ml", "8099911122334", 24, 1150, 1000, cheap]]);
    expect(Number(full["total_cents"])).toBe(27600);
    expect(full.events.map((e) => e["kind"])).toEqual(["created", "line_added", "line_added", "line_changed", "line_removed", "status"]);

    expect((await quotesOfCompany(db as never, co)).map((x) => x["number"])).toEqual([q.number]);
    expect((await quotesOfItem(db as never, item)).map((x) => x["number"])).toEqual([q.number]);

    // Search: every word, plain bottles first.
    const found = await searchQuoteItems(db as never, "zzq night");
    expect(found[0]?.id).toBe(item);
    expect(found[0]?.best?.cents).toBe(1000);
    const copy = await copyQuote(db as never, TEST_OWNER_USER_ID, q.id);
    const cf = await getQuote(db as never, copy.id);
    expect([cf.status, cf.lines.length, cf.lines[0]!.unit_price_cents]).toEqual(["draft", 1, 1150]);
    expect((await listQuotes(db as never, { status: "draft" })).some((x) => x["id"] === copy.id)).toBe(true);

    const x = await quoteXlsx(db as never, TEST_OWNER_USER_ID, q.id);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(x.buffer as never);
    const ws = wb.worksheets[0]!;
    const cells: string[] = []; ws.eachRow((r) => r.eachCell((c) => cells.push(JSON.stringify(c.value))));
    expect(cells.join(" ")).toContain(`"formula":"D8*E8"`);
    expect((await getQuote(db as never, q.id)).events.at(-1)!["kind"]).toBe("exported_xlsx");
    expect(quoteHtml(full)).toContain("$276.00");
  });
});
