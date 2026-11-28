/**
 * SCENTSX — the whole perfume desk run end to end on ScentsX's books (owner 2026-11-28 13:24 CT "finish perfumes … complete
 * and done, fully wiring … double, reverse … ap, ar, sales, items, chart of accounts, sub accounts … balance sheet, assets,
 * liabilities, receive inventory, transfer between warehouses, stores, purchases, sales orders, purchase orders … data not mixed").
 *
 * One rolled-back transaction drives every desk writer the screens use, in order, and then proves the numbers tie:
 *   vendor + customer made ScentsX parties (link + OFAC screen) → PO (2 items, one on a category sub-account, one on the role
 *   account) → receive at the warehouse → bill the PO with landed freight → pay the bill → transfer warehouse → store (ship +
 *   receive) → sales order at the store → ship → invoice → send → customer payment → return 1 unit to stock (credit memo) →
 *   a second order from the warehouse left open on A/R.
 * Proven at the end: debits = credits; assets = liabilities + equity + net income; inventory sub-ledger = GL (difference 0,
 * nothing waiting); each inventory sub-account = the value on hand of its items; GRNI cleared by the bill; A/P aging = GL A/P;
 * A/R aging = GL A/R = the open invoice; revenue / returns / COGS / freight-in to the cent; stock by site; every journal entry
 * of the chain on ScentsX and nothing written for any other company.
 * Real Postgres. Only the engine's own writers (no GL math here).
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createLink } from "./links.service.js";
import { loadSanctionsList, screenParty } from "./sanctions.service.js";
import { fixtureFetcher } from "./__fixtures__/ofac-fixture.js";
import { addPurchaseLine, createPurchaseOrder, receivePurchase, returnToVendor } from "../perfume/purchases.service.js";
import { addOrderLine, createOrder, shipOrder } from "../perfume/orders.service.js";
import { addTransferLine, createCount, createTransfer, postCount, receiveTransfer, setCountLine, shipTransfer, submitCount } from "../perfume/inventory.service.js";
import { postPendingStockMoves } from "./stock-move-poster.service.js";
import { billPurchaseOrder, creditVendorReturn, purchaseBillSchema, vendorReturnCreditSchema } from "./purchase-bill.service.js";
import { payBillInClientTx } from "../accounting/bills.service.js";
import { invoiceSalesOrder } from "./sales-invoice.service.js";
import { sendDraftInvoice } from "../accounting/invoice-send.service.js";
import { recordCustomerPaymentInClientTx } from "../accounting/payment-writer.service.js";
import { createReturn } from "./returns.service.js";
import { inventoryTieOut } from "./inventory-tieout.service.js";
import { agingReport, agingQuery } from "./receivables.service.js";
import { makeItemsSchema, makeScentsxItems } from "./item-links.service.js";
import { payablesAging } from "./payables.service.js";

const FLAGS = ["GL_POSTING_ENABLED", "INVOICE_AR_GL_POSTING_ENABLED", "CUSTOMER_PAYMENT_GL_POSTING_ENABLED", "BILL_GL_POSTING_ENABLED",
  "BILL_PAYMENT_GL_POSTING_ENABLED", "SCENTSX_STOCK_MOVE_GL_POSTING_ENABLED", "TRANSFER_GL_POSTING_ENABLED", "MONEY_CONTROL_VOID_REVERSAL_ENABLED"];

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("ScentsX desk chain end to end (real Postgres, rolled back)", () => {
  let db: pg.Client;
  let co: string;
  const u = TEST_OWNER_USER_ID;
  const today = new Date().toISOString().slice(0, 10);
  const acct = async (num: string) =>
    (await db.query<{ id: string }>(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = $2 AND deactivated_at IS NULL`, [co, num])).rows[0]!.id;
  /** Posted balance (debit − credit) of one ScentsX account. */
  const bal = async (num: string) => Number((await db.query<{ b: string }>(
    `SELECT coalesce(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text AS b
       FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid JOIN catalogs.accounts a ON a.id = p.account_id
      WHERE j.operating_company_id = $1::uuid AND j.status = 'posted' AND a.account_number = $2`, [co, num])).rows[0]!.b);
  const post = () => postPendingStockMoves(db, { userId: u, role: "system" });
  let othersBefore = 0;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    co = (await db.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'SCENTSX'`)).rows[0]!.id;
    await db.query(`SELECT set_config('app.operating_company_id', $1, true)`, [co]);
    await db.query(
      `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled, set_by_user_uuid)
       SELECT f.flag_key, $1::uuid, true, $2::uuid FROM lib.feature_flags f WHERE f.flag_key = ANY ($3::text[])
       ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL DO UPDATE SET enabled = true`,
      [co, u, FLAGS]);
    othersBefore = Number((await db.query<{ n: string }>(`SELECT count(*)::text n FROM accounting.journal_entries WHERE operating_company_id <> $1::uuid`, [co])).rows[0]!.n);
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });

  it("vendor → PO → receive → bill (landed) → pay → transfer → SO → ship → invoice → payment → return → open order: every number ties", async () => {
    // ── Chart of accounts: a category sub-account pair under the role accounts (prod: 1201 / 5001 for Perfume) ──
    const parentInv = await acct("1200"), parentCogs = await acct("5000");
    const sub = async (num: string, name: string, type: string, subtype: string, parent: string) => (await db.query<{ id: string }>(
      `INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype, parent_account_id, is_postable)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid, true)
       ON CONFLICT DO NOTHING RETURNING id::text`, [co, num, name, type, subtype, parent])).rows[0]?.id ?? (await acct(num));
    const inv1201 = await sub("1201", "Inventory - Perfume", "Asset", "Inventory", parentInv);
    const cogs5001 = await sub("5001", "Cost of Goods Sold - Perfume", "CostOfGoodsSold", "Supplies & Materials - COGS", parentCogs);
    await db.query(`INSERT INTO scentsx.item_account_map (operating_company_id, scope, category, inventory_account_id, cogs_account_id, created_by)
      VALUES ($1::uuid, 'category', 'ZZChain Perfume', $2::uuid, $3::uuid, $4::uuid)`, [co, inv1201, cogs5001, u]);

    // ── Sites: one warehouse, one store (both ours) ──
    await db.query(`INSERT INTO perfume.locations (code, name, sort_order, active, kind, own) VALUES ('ZZWH', 'ZZ Warehouse', 990, true, 'warehouse', true),
      ('ZZST', 'ZZ Store', 991, true, 'store', true) ON CONFLICT (code) DO NOTHING`);

    // ── Parties: a vendor and a customer, each made a ScentsX party and screened ──
    await loadSanctionsList(db, u, fixtureFetcher);
    const pv = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('Chain test supplier', 'buy') RETURNING id::text`)).rows[0]!.id;
    const mv = (await db.query<{ id: string }>(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1::uuid, 'Chain test supplier', 'Other') RETURNING id::text`, [co])).rows[0]!.id;
    await createLink(db, u, "vendor", pv, mv);
    await screenParty(db, u, { kind: "vendor", id: mv });
    const buyer = (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source) VALUES ('Chain test buyer', 'test') RETURNING id::text`)).rows[0]!.id;
    const cust = (await db.query<{ id: string }>(`INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data) VALUES ('Chain test buyer', $1::uuid, false) RETURNING id::text`, [co])).rows[0]!.id;
    await createLink(db, u, "customer", buyer, cust);
    await screenParty(db, u, { kind: "customer", id: cust });

    // ── Items: A on the category sub-account, B on the role account (no category) ──
    const mkItem = async (code: string, name: string, category: string | null) => (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (internal_code, brand, name, display_name, identity_key, loose_key, category)
       VALUES ($1, 'Chain Brand', $2, $2, $3, $3, $4) RETURNING id::text`, [code, name, `chain-${code}`, category])).rows[0]!.id;
    const A = await mkItem("CHAIN-A", "Chain A EDP 100ml", "ZZChain Perfume");
    const B = await mkItem("CHAIN-B", "Chain B EDT 50ml", null);
    // Each becomes a ScentsX Products & Services item (income 4000, expense = its category COGS: A 5001, B 5000).
    expect((await makeScentsxItems(db, u, makeItemsSchema.parse({ item_ids: [A, B] }))).created).toBe(2);
    const product = async (item: string) => (await db.query<{ id: string }>(`SELECT catalog_item_id::text AS id FROM scentsx.item_links WHERE perfume_item_id = $1::uuid AND voided_at IS NULL`, [item])).rows[0]!.id;

    // ── 1. Purchase order → receive at the warehouse (Dr Inventory / Cr GRNI) ──
    const po = await createPurchaseOrder(db as never, u, { vendor_id: pv, location_code: "ZZWH" });
    const poA = await addPurchaseLine(db as never, u, po.id, { item_id: A, description: "Chain A EDP 100ml", qty: 10, unit_cost_cents: 1500 });
    const poB = await addPurchaseLine(db as never, u, po.id, { item_id: B, description: "Chain B EDT 50ml", qty: 4, unit_cost_cents: 1000 });
    await receivePurchase(db as never, u, po.id, {});
    expect((await post()).failed).toEqual([]);
    expect([await bal("1201"), await bal("1200"), await bal("2050")]).toEqual([15000, 4000, -19000]);

    // ── 2. Bill the PO with $14.00 freight spread over the 14 units on hand (Dr GRNI / Cr A/P; landed Dr Inventory / Cr 5100) ──
    const lineId = (x: unknown) => (x as { id: string }).id;
    const bill = await billPurchaseOrder(db as never, u, po.id, purchaseBillSchema.parse({ vendor_invoice_number: "CHAIN-INV-1", bill_date: today,
      lines: [{ po_line_id: lineId(poA), qty: 10 }, { po_line_id: lineId(poB), qty: 4 }],
      charges: [{ description: "Truck to Laredo", amount_cents: 1400, landed: "freight_in" }] }));
    expect(bill.amount_cents).toBe(19000 + 1400);
    expect(bill.landed).toMatchObject({ allocated_cents: 1400, capitalized_cents: 1400, expensed_cents: 0 });
    expect(await bal("2050")).toBe(0); // GRNI cleared
    expect(await bal("2000")).toBe(-20400); // A/P owes the vendor
    // Landed cost by value: A gets 1400 × 15000/19000 = 1105, B 295 → A $16.105/unit, B $10.7375/unit on hand.
    expect([await bal("1201"), await bal("1200")]).toEqual([15000 + 1105, 4000 + 295]);

    // ── 3. Pay the bill from Operating Checking (Dr A/P / Cr 1000) ──
    const bank = (await db.query<{ id: string }>(`SELECT id::text FROM banking.bank_accounts WHERE operating_company_id = $1::uuid AND account_name = 'Operating Checking'`, [co])).rows[0]!.id;
    await payBillInClientTx(db as never, { operatingCompanyId: co, billId: bill.bill_id, paymentDate: today, amountCents: 20400, paymentMethod: "ach", fromBankAccountId: bank, referenceNumber: "CHAIN ACH 1" }, u);
    expect(await bal("2000")).toBe(0);
    expect(await bal("1000")).toBe(-20400);

    // ── 4. Transfer 4 of A warehouse → store (ship + receive; value moves, books unchanged in total, nothing left in transit) ──
    const tr = await createTransfer(db as never, u, { from_code: "ZZWH", to_code: "ZZST" });
    await addTransferLine(db as never, tr.id, A, 4);
    await shipTransfer(db as never, u, tr.id);
    await receiveTransfer(db as never, u, tr.id);
    expect((await post()).failed).toEqual([]);
    expect([await bal("1201"), await bal("1290")]).toEqual([16105, 0]);

    // ── 5. Sales order at the store: 3 of A at $25.00 → ship (COGS 5001 at landed cost) → invoice → send → paid ──
    const so = await createOrder(db as never, u, { company_id: buyer, customer_name: "Chain test buyer", location_code: "ZZST" });
    const soA = await addOrderLine(db as never, u, so.id, { item_id: A, description: "Chain A EDP 100ml", qty: 3, unit_price_cents: 2500, price_override_reason: "chain test price" });
    await shipOrder(db as never, u, so.id);
    expect((await post()).failed).toEqual([]);
    const unitA = 16105 / 10; // 1610.5 → FIFO value per shipped unit, rounded per move
    const cogs3 = Math.round(3 * unitA);
    expect(await bal("5001")).toBe(cogs3);
    const inv1 = await invoiceSalesOrder(db, u, so.id);
    const sent = await sendDraftInvoice(db as never, { invoiceId: inv1.invoice_id, operatingCompanyId: co, userId: u, mode: "historical_backfill" });
    expect((sent as { ok: boolean }).ok).toBe(true);
    expect(await bal("4000")).toBe(-7500);
    expect(await bal("1100")).toBe(7500);
    // The invoice line names A's ScentsX product (Sales by product, the QuickBooks item).
    expect((await db.query<{ item_id: string | null }>(`SELECT item_id::text FROM accounting.invoice_lines WHERE invoice_id = $1::uuid`, [inv1.invoice_id])).rows)
      .toEqual([{ item_id: await product(A) }]);
    await recordCustomerPaymentInClientTx(db, {
      row: { operating_company_id: co, customer_id: cust, payment_method: "check", payment_date: today, reference: "CHAIN CHK 1", amount_cents: 7500,
        deposited_to_account_id: await acct("1000"), notes: null, created_by_user_id: u, is_sample_data: false },
      applications: [{ invoice_id: inv1.invoice_id, amount_cents: 7500 }], validate_application: async () => null, skip_context: {},
      audit: { action: "accounting.payment.create", module: "accounting" }, spine: { event_type: "payment.recorded" as never, entity_type: "payment" },
    } as never);
    expect(await bal("1100")).toBe(0);
    expect(await bal("1000")).toBe(-20400 + 7500);

    // ── 6. Reverse: the customer returns 1 of A to stock → credit memo to 4800 (customer credit, invoice is paid) + Dr Inventory / Cr COGS ──
    const ret = await createReturn(db as never, u, { invoice_id: inv1.invoice_id, reason: "wrong_item", lines: [{ so_line_id: lineId(soA), qty: 1, restock: true }] });
    expect(ret.merchandise_cents).toBe(2500);
    expect((await post()).failed).toEqual([]);
    expect(await bal("4800")).toBe(2500);

    // ── 7. A second order from the warehouse: 2 of B at $20.00, invoiced and sent, left open on A/R ──
    const so2 = await createOrder(db as never, u, { company_id: buyer, customer_name: "Chain test buyer", location_code: "ZZWH" });
    await addOrderLine(db as never, u, so2.id, { item_id: B, description: "Chain B EDT 50ml", qty: 2, unit_price_cents: 2000, price_override_reason: "chain test price" });
    await shipOrder(db as never, u, so2.id);
    expect((await post()).failed).toEqual([]);
    // Billed as a retail (store) sale: revenue 4010, the product still named on the line, the channel recorded as the reason.
    const inv2 = await invoiceSalesOrder(db, u, so2.id, "retail");
    expect((await db.query<{ item_id: string | null; acct: string; why: string | null }>(
      `SELECT l.item_id::text, a.account_number AS acct, l.item_account_override_reason AS why FROM accounting.invoice_lines l JOIN catalogs.accounts a ON a.id = l.account_id
        WHERE l.invoice_id = $1::uuid`, [inv2.invoice_id])).rows).toEqual([{ item_id: await product(B), acct: "4010", why: expect.stringMatching(/retail sale/) }]);
    await sendDraftInvoice(db as never, { invoiceId: inv2.invoice_id, operatingCompanyId: co, userId: u, mode: "historical_backfill" });

    // ── 8. Reverse a purchase: 1 of B goes back to the vendor after it was billed → vendor credit (Dr A/P / Cr GRNI); GRNI back to 0 ──
    await returnToVendor(db as never, u, lineId(poB), 1);
    expect((await post()).failed).toEqual([]);
    const vcr = await creditVendorReturn(db, u, po.id, vendorReturnCreditSchema.parse({ credit_date: today, lines: [{ po_line_id: lineId(poB), qty: 1 }] }));
    expect(vcr.amount_cents).toBe(1000);
    expect(await bal("2050")).toBe(0);
    expect(await bal("2000")).toBe(1000); // debit balance: the vendor owes us the credit

    // ── 9. Physical count at the warehouse finds 5 of A where the books say 6 → 1 out at FIFO cost (Dr 5200 shrink / Cr 1201) ──
    const cnt = await createCount(db as never, u, "ZZWH");
    await setCountLine(db as never, cnt.id, A, 5, u);
    await submitCount(db as never, u, cnt.id);
    await postCount(db as never, u, cnt.id);
    expect((await post()).failed).toEqual([]);
    expect(await bal("5200")).toBe(Math.round(unitA));

    // ════════ The numbers tie ════════
    // Debits = credits over every posted ScentsX entry.
    const tb = (await db.query<{ d: string; c: string }>(
      `SELECT coalesce(sum(p.amount_cents) FILTER (WHERE p.debit_or_credit = 'debit'), 0)::text d, coalesce(sum(p.amount_cents) FILTER (WHERE p.debit_or_credit = 'credit'), 0)::text c
         FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid WHERE j.operating_company_id = $1::uuid AND j.status = 'posted'`, [co])).rows[0]!;
    expect(Number(tb.d)).toBe(Number(tb.c));
    // Balance sheet: assets = liabilities + equity + (income − expenses), by account type.
    const byType = Object.fromEntries((await db.query<{ t: string; b: string }>(
      `SELECT a.account_type t, sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END)::text b
         FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid JOIN catalogs.accounts a ON a.id = p.account_id
        WHERE j.operating_company_id = $1::uuid AND j.status = 'posted' GROUP BY 1`, [co])).rows.map((r) => [r.t, Number(r.b)]));
    const assets = byType["Asset"] ?? 0, liabilities = -(byType["Liability"] ?? 0), equity = -(byType["Equity"] ?? 0);
    const income = -((byType["Income"] ?? 0) + (byType["OtherIncome"] ?? 0)), expenses = (byType["CostOfGoodsSold"] ?? 0) + (byType["Expense"] ?? 0) + (byType["OtherExpense"] ?? 0);
    expect(Object.keys(byType).every((t) => ["Asset", "Liability", "Equity", "Income", "OtherIncome", "CostOfGoodsSold", "Expense", "OtherExpense"].includes(t))).toBe(true);
    expect(assets).toBe(liabilities + equity + (income - expenses));

    // Inventory: sub-ledger = GL, nothing waiting; each sub-account = what its items have on hand.
    const tie = await inventoryTieOut(db);
    expect(tie).toMatchObject({ difference_cents: 0, waiting_moves: 0, ties: true });
    const onHand = async (item: string) => Number((await db.query<{ v: string }>(
      `SELECT coalesce(sum(round(qty_left * unit_cost_cents)), 0)::text v FROM perfume.inventory_lots WHERE item_id = $1::uuid`, [item])).rows[0]!.v);
    // Each move is valued round(|qty| × unit cost); the landed cost left A at $16.105 a unit, so valuing the lots on hand rounds
    // per lot — at most ½¢ per lot apart (A sits in 3 lots, B in 1). The sub-ledger above (moves) ties exactly.
    const lotsOf = async (item: string) => Number((await db.query<{ n: string }>(`SELECT count(*)::text n FROM perfume.inventory_lots WHERE item_id = $1::uuid AND qty_left > 0`, [item])).rows[0]!.n);
    expect(Math.abs((await bal("1201")) - (await onHand(A)))).toBeLessThanOrEqual(await lotsOf(A));
    expect(Math.abs((await bal("1200")) - (await onHand(B)))).toBeLessThanOrEqual(await lotsOf(B));
    // Stock by site: warehouse A 6, B 2; store A 4 − 3 sold + 1 returned = 2; nothing in transit.
    const stock = Object.fromEntries((await db.query<{ k: string; q: number }>(
      `SELECT location_code || ':' || CASE item_id WHEN $1::uuid THEN 'A' ELSE 'B' END AS k, sum(qty_left)::int q
         FROM perfume.inventory_lots WHERE item_id IN ($1::uuid, $2::uuid) GROUP BY 1`, [A, B])).rows.map((r) => [r.k, r.q]));
    expect(stock).toMatchObject({ "ZZWH:A": 5, "ZZWH:B": 1, "ZZST:A": 2 });
    expect(stock["TRANSIT:A"] ?? 0).toBe(0);

    // A/P: the aging total = the GL A/P balance = 0 (the bill is paid).
    const ap = await payablesAging(db, { as_of: today } as never);
    expect(await bal("2000")).toBe(1000);
    // A/P aging (what we owe, credit-positive) = −(GL debit balance): the unapplied vendor credit shows as −$10.00.
    expect(ap.vendors.filter((v) => v.vendor_id === mv).reduce((s, v) => s + v.total, 0)).toBe(-1000);
    // A/R: invoice 1 is paid; invoice 2 ($40.00) is open; the return made a $25.00 customer credit (Cr A/R) not yet used.
    // GL A/R = 4000 − 2500 = 1500, and the aging (open invoices less unapplied credits) must show the same.
    const ar = await agingReport(db, agingQuery.parse({ as_of: today }));
    const arTotal = (ar as { customers: Array<{ total: number }> }).customers.reduce((s, c) => s + c.total, 0);
    expect(await bal("1100")).toBe(1500);
    expect(arTotal).toBe(1500);

    // Income statement lines to the cent.
    // B: 2 shipped at $10.7375 (2148) + the returned unit's freight share (74) that the vendor credit does not cover → COGS.
    const cogsB = Math.round(2 * (4295 / 4)) + (Math.round(4295 / 4) - 1000);
    expect([await bal("4000"), await bal("4010"), await bal("4800"), await bal("5000"), await bal("5100")]).toEqual([-7500, -4000, 2500, cogsB, 0]);
    expect(await bal("5001")).toBe(cogs3 - Math.round(unitA));

    // Data not mixed: every posting of the chain is ScentsX's, on ScentsX accounts; nothing written for any other company.
    const foreign = (await db.query<{ n: string }>(
      `SELECT count(*)::text n FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id = p.account_id
        JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
       WHERE j.operating_company_id = $1::uuid AND a.operating_company_id <> $1::uuid`, [co])).rows[0]!.n;
    expect(Number(foreign)).toBe(0);
    const othersAfter = Number((await db.query<{ n: string }>(`SELECT count(*)::text n FROM accounting.journal_entries WHERE operating_company_id <> $1::uuid`, [co])).rows[0]!.n);
    expect(othersAfter).toBe(othersBefore);
  });
});
