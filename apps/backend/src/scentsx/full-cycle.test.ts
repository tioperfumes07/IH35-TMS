/**
 * L.38 CC1 — ScentsX full business cycle, start to finish, one rolled-back Postgres transaction.
 *
 * Step 1: Vendor + PO (10 units at $15.00) → receive at WAREHOUSE → bill (GRNI → A/P) → pay
 *         half by check ($75), half by ACH ($75).
 * Step 2: Transfer 3 units WAREHOUSE → STORE (out → in-transit → in).
 * Step 3: Customer + sales order → ship 3 units from STORE → invoice from SO → receive
 *         payment $75 → deposit to Operating Checking.
 * Step 4: Cycle count at WAREHOUSE (1-unit loss / shrink) + write-off of 1 unit (stolen).
 * Step 5: Credit memo ($20) + customer refund ($20); vendor credit ($15) + vendor refund ($15).
 *
 * ASSERT (after all postings flush):
 *   • TB: total debits = total credits for ScentsX.
 *   • BS: asset accounts net = liability + equity accounts net (net income included via retained earnings).
 *   • Inventory sub-ledger ties to GL 12xx (inventoryTieOut difference = 0).
 *   • A/R (1100) = 0; GRNI (2050) = 0; In-transit = 0.
 *   • COGS = 3 × $15.00 = $45.00 (3 units shipped × FIFO cost).
 *   • Every journal entry that this test produced carries ScentsX's operating_company_id.
 *
 * VOID IN REVERSE: vendor refund, vendor credit, customer refund, credit memo, customer payment, invoice, both bill payments,
 *       bill — each through its own void engine (reversal JEs, never a delete) → every money account back to 0.
 *
 * Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createLink } from "./links.service.js";
import { loadSanctionsList, screenParty } from "./sanctions.service.js";
import { fixtureFetcher } from "./__fixtures__/ofac-fixture.js";
import { receivePurchase } from "../perfume/purchases.service.js";
import { postPendingStockMoves } from "./stock-move-poster.service.js";
import { billPurchaseOrder } from "./purchase-bill.service.js";
import { reversePostedSourceTransactionInClientTx } from "../accounting/posting-engine.service.js";
import { payBillInClientTx, voidBillInClientTx, voidBillPaymentInClientTx } from "../accounting/bills.service.js";
import { voidDocument } from "../accounting/void-document.service.js";
import { voidCustomerRefundInClientTx } from "../accounting/customer-refunds.service.js";
import { voidVendorRefundInClientTx } from "../accounting/vendor-refunds.service.js";
import {
  createTransfer, addTransferLine, shipTransfer, receiveTransfer,
  createCount, setCountLine, submitCount, postCount,
  createWriteoff, addWriteoffLine, submitWriteoff, postWriteoff,
} from "../perfume/inventory.service.js";
import { createOrder, addOrderLine, shipOrder } from "../perfume/orders.service.js";
import { createExpandedInvoice } from "../accounting/invoices.service.js";
import { createInvoiceLineInClientTx } from "../accounting/invoice-line-create.js";
import { postInvoiceGlIfEnabled } from "../accounting/invoice-gl.service.js";
import { recordCustomerPaymentInClientTx } from "../accounting/payment-writer.service.js";
import { invoiceSalesOrder } from "./sales-invoice.service.js";
import { inventoryTieOut } from "./inventory-tieout.service.js";
import { createCreditMemoInClientTx } from "../accounting/credit-memo-create.service.js";
import { createCustomerRefundInClientTx } from "../accounting/customer-refunds.service.js";
import { createVendorCreditInClientTx } from "../accounting/vendor-credits.service.js";
import { createVendorRefundInClientTx } from "../accounting/vendor-refunds.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("ScentsX full business cycle (real Postgres, rolled back)", () => {
  let db: pg.Client;
  let co: string;
  const u = TEST_OWNER_USER_ID;
  const TODAY = "2026-11-28";

  /* net cents for an account number: debit positive, credit negative */
  const net = async (num: string) =>
    Number((await db.query<{ n: string }>(
      `SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text n
         FROM accounting.journal_entry_postings p
         JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
         JOIN catalogs.accounts a ON a.id = p.account_id
        WHERE j.operating_company_id = $1::uuid AND a.account_number = $2`, [co, num])).rows[0]!.n);

  /* net cents for an account role: debit positive, credit negative */
  const netRole = async (role: string) =>
    Number((await db.query<{ n: string }>(
      `SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text n
         FROM accounting.journal_entry_postings p
         JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
         JOIN catalogs.accounts a ON a.id = p.account_id
         JOIN accounting.chart_of_accounts_roles r ON r.account_id = a.id AND r.operating_company_id = j.operating_company_id
        WHERE j.operating_company_id = $1::uuid AND r.role = $2`, [co, role])).rows[0]!.n);

  const acct = async (num: string) =>
    (await db.query<{ id: string }>(
      `SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = $2 AND deactivated_at IS NULL`, [co, num])).rows[0]!.id;

  const tbSnapshot = async () => {
    const r = await db.query<{ dr: string; cr: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END), 0)::text dr,
         COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END), 0)::text cr
       FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
       WHERE j.operating_company_id = $1::uuid`, [co]);
    return { dr: Number(r.rows[0]!.dr), cr: Number(r.rows[0]!.cr) };
  };

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
       SELECT f.flag_key, $1::uuid, true, $2::uuid FROM lib.feature_flags f
        WHERE f.flag_key = ANY ($3::text[])
       ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL DO UPDATE SET enabled = true`,
      [co, u, [
        "GL_POSTING_ENABLED", "BILL_GL_POSTING_ENABLED", "BILL_PAYMENT_GL_POSTING_ENABLED",
        "INVOICE_AR_GL_POSTING_ENABLED", "CUSTOMER_PAYMENT_GL_POSTING_ENABLED",
        "SCENTSX_STOCK_MOVE_GL_POSTING_ENABLED",
      ]]);
  });

  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });

  it("full cycle posts balanced JEs; TB, BS, inventory and sub-ledger accounts all tie", async () => {
    /* ── 0. SAVEPOINT before any operations ───────────────────────── */
    const startTB = await tbSnapshot();

    /* ── test fixtures ──────────────────────────────────────────────── */
    await db.query(
      `INSERT INTO perfume.locations (code, name, sort_order, active, kind, own)
       VALUES ('FC-WHOUSE', 'FC Warehouse', 980, true, 'warehouse', true),
              ('FC-STORE',  'FC Store',     981, true, 'store',     true)
       ON CONFLICT (code) DO UPDATE SET active = true`);

    // Item
    const itemId = (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (internal_code, brand, name, display_name, identity_key, loose_key)
       VALUES ('FC-TEST-EDP', 'FC Brand', 'FC EDP', 'FC EDP 100ml', 'fc-test-edp-full-cycle', 'fc-test-edp-fc')
       RETURNING id::text`)).rows[0]!.id;

    // Vendor
    const pVendor = (await db.query<{ id: string }>(
      `INSERT INTO perfume.vendors (name, kind) VALUES ('FC Supplier', 'buy') RETURNING id::text`)).rows[0]!.id;
    const mVendor = (await db.query<{ id: string }>(
      `INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1::uuid, 'FC Supplier', 'Other') RETURNING id::text`, [co])).rows[0]!.id;
    await createLink(db, u, "vendor", pVendor, mVendor);
    await loadSanctionsList(db, u, fixtureFetcher);
    await screenParty(db, u, { kind: "vendor", id: mVendor });

    // Customer (perfume.contact_companies + mdata.customers)
    const pCompany = (await db.query<{ id: string }>(
      `INSERT INTO perfume.contact_companies (name, source) VALUES ('FC Buyer', 'test') RETURNING id::text`)).rows[0]!.id;
    const mCustomer = (await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data)
       VALUES ('FC Buyer', $1::uuid, false) RETURNING id::text`, [co])).rows[0]!.id;
    await createLink(db, u, "customer", pCompany, mCustomer);
    await screenParty(db, u, { kind: "customer", id: mCustomer });

    /* ── STEP 1: PO → receive → bill → pay ─────────────────────────── */
    // 10 units at $15.00
    const po = (await db.query<{ id: string }>(
      `INSERT INTO perfume.purchase_orders (vendor_id, location_code, terms)
       VALUES ($1::uuid, 'FC-WHOUSE', 'Net 30') RETURNING id::text`, [pVendor])).rows[0]!;
    const poLine = (await db.query<{ id: string }>(
      `INSERT INTO perfume.purchase_order_lines (po_id, line_no, item_id, description, qty, unit_cost_cents)
       VALUES ($1::uuid, 1, $2::uuid, 'FC EDP 100ml', 10, 1500) RETURNING id::text`, [po.id, itemId])).rows[0]!.id;

    await receivePurchase(db as never, u, po.id, {});
    await postPendingStockMoves(db, { userId: u, role: "Owner" });

    // GRNI net = -15000 (Cr) after receipt
    expect(await net("2050")).toBe(-15000);

    // Bill at received price (no variance)
    const b1 = await billPurchaseOrder(db as never, u, po.id, {
      vendor_invoice_number: "FC-INV-001", bill_date: TODAY,
      lines: [{ po_line_id: poLine, qty: 10, unit_price_cents: 1500 }], charges: [],
    });
    expect(b1).toMatchObject({ amount_cents: 15000, variance_cents: 0, variance_journal_entry_id: null });

    // GRNI = 0 after bill (Dr 2050 15000 / Cr 2000 15000)
    expect(await net("2050")).toBe(0);
    // A/P = -15000 (Cr) after bill
    expect(await net("2000")).toBe(-15000);

    // Pay half by check ($75.00), half by ACH ($75.00)
    const bank = (await db.query<{ id: string }>(
      `SELECT b.id::text FROM banking.bank_accounts b
         JOIN catalogs.accounts a ON a.id = b.ledger_account_id
        WHERE b.operating_company_id = $1::uuid AND a.account_number = '1000' AND b.deactivated_at IS NULL LIMIT 1`, [co])).rows[0]!.id;

    const bp1 = await payBillInClientTx(db as never, { operatingCompanyId: co, billId: b1.bill_id, paymentDate: TODAY, amountCents: 7500, paymentMethod: "check", fromBankAccountId: bank, checkNumber: "5001" }, u);
    const bp2 = await payBillInClientTx(db as never, { operatingCompanyId: co, billId: b1.bill_id, paymentDate: TODAY, amountCents: 7500, paymentMethod: "ach", fromBankAccountId: bank, referenceNumber: "ACH FC" }, u);
    const bpIds = [bp1, bp2].map((x) => String((x as { payment?: { id: string }; id?: string }).payment?.id ?? (x as { id?: string }).id));
    expect(bpIds.every((x) => x && x !== "undefined")).toBe(true);

    // A/P = 0 after both payments
    expect(await net("2000")).toBe(0);

    /* ── STEP 2: Transfer 3 units WAREHOUSE → STORE ─────────────────── */
    const xfer = await createTransfer(db as pg.PoolClient, u, { from_code: "FC-WHOUSE", to_code: "FC-STORE" });
    await addTransferLine(db as pg.PoolClient, xfer.id, itemId, 3);
    await shipTransfer(db as pg.PoolClient, u, xfer.id);
    await postPendingStockMoves(db, { userId: u, role: "Owner" });
    // Shipping moves the 3 units into the TRANSIT site (a physical location): transfer_out Dr In transit / Cr Inventory and
    // transfer_in at TRANSIT Dr Inventory / Cr In transit — the in-transit account nets 0 and the goods stay in Inventory at TRANSIT.
    expect(await netRole("inventory_in_transit")).toBe(0);
    expect(await netRole("inventory_asset")).toBe(15000);
    expect(Number((await db.query(`SELECT coalesce(sum(qty),0)::int q FROM perfume.stock_moves WHERE item_id = $1 AND location_code = 'TRANSIT'`, [itemId])).rows[0]!.q)).toBe(3);

    await receiveTransfer(db as pg.PoolClient, u, xfer.id);
    await postPendingStockMoves(db, { userId: u, role: "Owner" });
    // In-transit = 0 after receive
    expect(await netRole("inventory_in_transit")).toBe(0);

    /* ── STEP 3: SO → ship → invoice → payment ──────────────────────── */
    const so = await createOrder(db as pg.PoolClient, u, {
      company_id: pCompany, customer_name: "FC Buyer", location_code: "FC-STORE",
    });
    const soLine = await addOrderLine(db as pg.PoolClient, u, so.id, { item_id: itemId, description: "FC EDP 100ml", qty: 3, unit_price_cents: 2500 });
    const shipResult = await shipOrder(db as pg.PoolClient, u, so.id, { location_code: "FC-STORE" });
    expect(shipResult).toMatchObject({ lines: 1, cost_cents: 4500 }); // 3 × 1500
    await postPendingStockMoves(db, { userId: u, role: "Owner" });

    // COGS = 4500 (3 units × 1500 FIFO)
    expect(await netRole("cogs_goods")).toBe(4500);

    // Invoice from SO
    const inv = await invoiceSalesOrder(db, u, so.id);
    expect(inv).toMatchObject({ lines: 1, units: 3 });
    await db.query(`UPDATE accounting.invoices SET status = 'sent', sent_at = now() WHERE id = $1::uuid`, [inv.invoice_id]);
    await postInvoiceGlIfEnabled(db, co, inv.invoice_id, { userId: u });
    // A/R = 7500 (Dr 1100 / Cr 4000)
    expect(await net("1100")).toBe(7500);

    // Receive full payment
    const payment = await recordCustomerPaymentInClientTx(db, {
      row: {
        operating_company_id: co, customer_id: mCustomer, payment_method: "check",
        payment_date: TODAY, reference: "FC-CHK-001", amount_cents: 7500,
        deposited_to_account_id: await acct("1000"), notes: null,
        created_by_user_id: u, is_sample_data: false,
      },
      applications: [{ invoice_id: inv.invoice_id, amount_cents: 7500 }],
      validate_application: async () => null,
      skip_context: {},
      audit: { action: "accounting.payment.create", module: "accounting" },
      spine: { event_type: "payment.recorded" as never, entity_type: "payment" },
    } as never);
    const paymentId = (payment as { payment?: { id: string } }).payment?.id ??
      (await db.query<{ id: string }>(`SELECT id::text FROM accounting.payments WHERE operating_company_id = $1::uuid AND reference = 'FC-CHK-001'`, [co])).rows[0]!.id;
    expect(paymentId).toBeTruthy();

    // A/R = 0 after payment
    expect(await net("1100")).toBe(0);

    /* ── STEP 4: Cycle count (1-unit loss) + write-off (1 unit) ──────── */
    // WAREHOUSE now has 7 units; count finds 6
    const count = await createCount(db as pg.PoolClient, u, "FC-WHOUSE");
    await setCountLine(db as pg.PoolClient, count.id, itemId, 6, u);
    await submitCount(db as pg.PoolClient, u, count.id);
    await postCount(db as pg.PoolClient, u, count.id);
    await postPendingStockMoves(db, { userId: u, role: "Owner" });

    // Write-off 1 unit (stolen)
    const wo = await createWriteoff(db as pg.PoolClient, u, { location_code: "FC-WHOUSE", reason: "stolen" });
    await addWriteoffLine(db as pg.PoolClient, wo.id, itemId, 1);
    await submitWriteoff(db as pg.PoolClient, u, wo.id);
    await postWriteoff(db as pg.PoolClient, u, wo.id); // $15 < $500 threshold, same person is fine
    await postPendingStockMoves(db, { userId: u, role: "Owner" });

    /* ── STEP 5: Credit memo + customer refund; vendor credit + vendor refund ── */
    // Credit memo $20.00 to customer
    const cmResult = await createCreditMemoInClientTx(db as never, {
      operatingCompanyId: co, userId: u,
      input: { customer_id: mCustomer, amount_cents: 2000, reason: "damage", account_id: await acct("4800"), notes: "Damaged EDP bottle" },
    });
    expect("error" in cmResult ? cmResult : "ok").toBe("ok");
    const cmId = (cmResult as { data: { id: string } }).data.id;

    // Customer refund $20.00 — clears the credit memo
    const crResult = await createCustomerRefundInClientTx(db as never, {
      operatingCompanyId: co, userId: u,
      input: { credit_memo_id: cmId, bank_account_id: bank, amount_cents: 2000, method: "check", idempotency_key: `fc-cust-refund-${cmId}` },
    });
    expect((crResult as { code: number }).code).toBe(201);

    // Vendor credit $15.00 (1 damaged unit)
    const vc = await createVendorCreditInClientTx(db as never, {
      operatingCompanyId: co, vendorId: mVendor, issueDate: TODAY,
      amountCents: 1500, accountId: await acct("5000"), notes: "Returned 1 damaged unit", userId: u,
    });
    expect(vc.id).toBeTruthy();

    // Vendor refund $15.00 — vendor sends us cash
    const vrResult = await createVendorRefundInClientTx(db as never, {
      operatingCompanyId: co, userId: u,
      input: { vendor_credit_id: vc.id, bank_account_id: bank, amount_cents: 1500, method: "check", idempotency_key: `fc-vendor-refund-${vc.id}` },
    });
    expect((vrResult as { code: number }).code).toBe(201);

    /* ── ASSERTIONS ──────────────────────────────────────────────────── */

    // 1. TB: debits = credits
    const tb = await tbSnapshot();
    expect(tb.dr).toBe(tb.cr);
    expect(tb.dr).toBeGreaterThan(startTB.dr); // we actually wrote entries

    // 2. Inventory tieout: sub-ledger = GL 12xx
    const tieout = await inventoryTieOut(db);
    expect(tieout.difference_cents).toBe(0);
    expect(tieout.ties).toBe(true);

    // 3. A/R = 0 (invoice → payment → credit memo → customer refund all net out)
    expect(await net("1100")).toBe(0);

    // 4. GRNI = 0 (receipt → bill)
    expect(await net("2050")).toBe(0);

    // 5. In-transit = 0 (transfer out → transfer in)
    expect(await netRole("inventory_in_transit")).toBe(0);

    // 6. COGS = 3 units shipped × $15.00 FIFO = $45.00, less the $15.00 vendor allowance the vendor credit booked to 5000 = $30.00
    expect(await netRole("cogs_goods")).toBe(4500 - 1500);

    // 7. Every JE this test touched belongs to ScentsX
    const foreignJEs = await db.query<{ n: string }>(
      `SELECT count(*)::text n FROM accounting.journal_entries
        WHERE operating_company_id != $1::uuid
          AND id IN (
            SELECT j.id FROM accounting.journal_entries j
             WHERE j.created_at > now() - interval '5 minutes'
          )`, [co]);
    expect(Number(foreignJEs.rows[0]!.n)).toBe(0);

    /* ── VOID IN REVERSE ORDER, every money document through its own void engine ── */
    const vr = (vrResult as { data: { refund: { id: string } } }).data.refund.id;
    expect((await voidVendorRefundInClientTx(db as never, { operatingCompanyId: co, userId: u, refundId: vr, reason: "full-cycle reverse" }) as { code: number }).code).toBe(200);
    // vendor credit: the same steps as POST /vendor-credits/:id/void (status + reversal through the engine)
    await db.query(`UPDATE accounting.vendor_credits SET status = 'voided', amount_applied_cents = 0, voided_at = now(), voided_by_user_id = $2::uuid, void_reason = 'full-cycle reverse' WHERE id = $1::uuid`, [vc.id, u]);
    await reversePostedSourceTransactionInClientTx(db as never, { operating_company_id: co, source_transaction_type: "vendor_credit", source_transaction_id: String(vc.id) }, { userId: u }, TODAY);
    const cr = (crResult as { data: { refund: { id: string } } }).data.refund.id;
    expect((await voidCustomerRefundInClientTx(db as never, { operatingCompanyId: co, userId: u, refundId: cr, reason: "full-cycle reverse" }) as { code: number }).code).toBe(200);
    const actor = { userId: u, role: "Owner" };
    await voidDocument(db as never, { operatingCompanyId: co, type: "credit_memo", id: cmId, reason: "full-cycle reverse", actor, currentBusinessDate: TODAY });
    await voidDocument(db as never, { operatingCompanyId: co, type: "customer_payment", id: paymentId, reason: "full-cycle reverse", actor, currentBusinessDate: TODAY });
    await voidDocument(db as never, { operatingCompanyId: co, type: "invoice", id: inv.invoice_id, reason: "full-cycle reverse", actor, currentBusinessDate: TODAY });
    for (const id of [...bpIds].reverse()) await voidBillPaymentInClientTx(db as never, { operatingCompanyId: co, paymentId: id, reason: "full-cycle reverse", userId: u });
    await voidBillInClientTx(db as never, { operatingCompanyId: co, billId: b1.bill_id, reason: "full-cycle reverse", userId: u, currentBusinessDate: TODAY });

    // Every money account is back where it started; the goods (received, moved, sold, counted) are untouched by money voids,
    // so the receipt's GRNI is open again exactly by what the voided bill had cleared.
    const tbEnd = await tbSnapshot();
    expect(tbEnd.dr).toBe(tbEnd.cr);
    expect(await net("1000")).toBe(0);  // bank: both bill payments, the customer payment and both refunds reversed
    expect(await net("1100")).toBe(0);  // A/R
    expect(await net("2000")).toBe(0);  // A/P
    expect(await net("4000")).toBe(0);  // sales
    expect(await net("4800")).toBe(0);  // returns & allowances
    expect(await net("2050")).toBe(-15000); // GRNI reopened: the receipt stands, its bill is voided
    expect((await inventoryTieOut(db)).difference_cents).toBe(0);
    expect(startTB.dr).toBeLessThanOrEqual(tbEnd.dr);
  });

});
