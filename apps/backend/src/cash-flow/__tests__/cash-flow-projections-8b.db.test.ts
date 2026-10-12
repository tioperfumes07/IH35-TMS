/**
 * LEAD 443.140 #8(b) — CASH-FLOW PROJECTIONS. CC-2 owns these tests and the guard; CC-1 owns the engine
 * (cash-flow.service.ts + projected-cash-date.ts). Lead spec, verbatim:
 *   "customer receipts on the invoice due date (or the Faro funding date when factored), driver bills on their due
 *    date (= projected delivery, 289d317c), card payables 2510 on the card payment date, Relay wallet top-ups; a late
 *    load moves its bill and its receipt; uses your 8c basis engine."
 *
 * Real Postgres, ONE transaction, rolled back (each rule runs under its own savepoint so one rule's failure cannot
 * poison the next). Every rule is read through BOTH public projection surfaces, called the way their routes call them:
 *   - getDailyPrediction(client, company, date, cashFollowsEta)  — GET /api/v1/cash-flow/daily-prediction
 *     cashFollowsEta = true: CASH_FOLLOWS_ETA_ENABLED is ON for every live entity (lib.feature_flag_overrides), and the
 *     flag-OFF branch is the raw scheduled-delivery bucket this item retires;
 *   - getRollingLedger(client, company, from, to)               — GET /api/v1/cash-flow/rolling-ledger (<= 120 days).
 * One cash item must land on ONE date in both, so each `it` checks both with expect.soft and reports every miss.
 *
 * Fixture dates sit ~200 days ahead of the company business date so nothing rolls to "today" and no live row shares a
 * date. Amounts are odd-cent values so a daily-prediction expense line (which carries no document id for an expense
 * or a Relay deposit today) is still identifiable by amount.
 *
 * Reading (d): "the card payment date" of a 2510 card payable is taken as the expense's own payment terms
 * (accounting.expenses.payment_term_id -> catalogs.payment_terms.days_until_due) from its transaction date — the only
 * card-payment-date the schema carries today. If the Lead means a card statement / autopay calendar instead, only
 * the expected date in (d) changes.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationLoadId, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { insertInvoiceLine } from "../../../test-helpers/load-born-invoice.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { addBusinessDateDays, companyBusinessDate } from "../../lib/company-business-date.js";
import { resolveRoleAccountOptional } from "../../accounting/coa-roles/resolver.service.js";
import { getDailyPrediction, getRollingLedger, type DailyPredictionResult, type RollingLedgerRow } from "../cash-flow.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("443.140 #8(b) cash-flow projections land on the right date (real Postgres)", () => {
  let db: pg.Client;
  let company = "";
  let trailerEquipmentId = "";
  let net30 = "";
  let net7 = "";
  let nonFactoredCustomer = "";
  let factoredCustomer = "";
  const today = companyBusinessDate();
  const B = addBusinessDateDays(today, 200);
  const day = (n: number) => addBusinessDateDays(B, n);
  const noonUtc = (iso: string) => `${iso} 17:00:00+00`;
  const sfx = randomUUID().slice(0, 6);

  const daily = (date: string): Promise<DailyPredictionResult> => getDailyPrediction(db as never, company, date, true);
  const ledgerRows = async (): Promise<RollingLedgerRow[]> =>
    (await getRollingLedger(db as never, company, addBusinessDateDays(B, -10), addBusinessDateDays(B, 100))).rows;

  async function rule(name: string, fn: () => Promise<void>): Promise<void> {
    await db.query(`SAVEPOINT rule_${name}`);
    try {
      await fn();
    } finally {
      await db.query(`ROLLBACK TO SAVEPOINT rule_${name}`).catch(() => {});
    }
  }

  async function customer(tag: string, factored: boolean, termsId: string): Promise<string> {
    return (await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (operating_company_id, customer_name, factoring_eligible, payment_terms_id)
       VALUES ($1::uuid, $2, $3, $4::uuid) RETURNING id::text`,
      [company, `CF8B ${tag} ${sfx}`, factored, termsId]
    )).rows[0]!.id;
  }

  async function load(opts: {
    customerId: string;
    status: string;
    rateCents: number;
    deliveryIso: string;
    predicted?: boolean;
    driverId?: string | null;
  }): Promise<string> {
    const loadId = randomUUID();
    await db.query(
      `INSERT INTO mdata.loads (id, operating_company_id, load_number, customer_id, status, rate_total_cents, dispatcher_user_id,
                                load_trailer_equipment_id, assigned_primary_driver_id, predicted_delivery_date)
       VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::mdata.load_status_enum, $6, $7::uuid, $8::uuid, $9::uuid, $10::timestamptz)`,
      [
        loadId,
        company,
        `CF8B-${randomUUID().slice(0, 8)}`,
        opts.customerId,
        opts.status,
        opts.rateCents,
        TEST_OWNER_USER_ID,
        trailerEquipmentId,
        opts.driverId ?? null,
        opts.predicted ? noonUtc(opts.deliveryIso) : null,
      ]
    );
    await db.query(
      `INSERT INTO mdata.load_stops (load_id, sequence_number, stop_type, appointment_start_at, scheduled_arrival_at)
       VALUES ($1::uuid, 1, 'pickup', $2::timestamptz, $2::timestamptz),
              ($1::uuid, 2, 'delivery', $3::timestamptz, $3::timestamptz)`,
      [loadId, noonUtc(addBusinessDateDays(opts.deliveryIso, -2)), noonUtc(opts.deliveryIso)]
    );
    return loadId;
  }

  async function driver(): Promise<string> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone) VALUES ($1::uuid, $2::uuid, 'CF8B', $3, $4)`,
      [id, company, sfx, `+1004${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`]
    );
    return id;
  }

  async function driverBill(loadId: string, driverId: string, grossCents: number): Promise<string> {
    const id = randomUUID();
    const n = `CF8B-DB-${randomUUID().slice(0, 8)}`;
    await db.query(
      `INSERT INTO driver_finance.driver_bills (id, operating_company_id, load_id, load_number, bill_number, driver_id, gross_amount_cents, status)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $4, $5::uuid, $6, 'open')`,
      [id, company, loadId, n, driverId, grossCents]
    );
    return id;
  }

  const incomeOn = (r: DailyPredictionResult, loadId: string) => r.income_items.find((i) => i.load_id === loadId);

  beforeAll(async () => {
    const fixtureLoadId = await ensureIntegrationLoadId();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    await db.query("SET ROLE ih35_app");
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    company = (await db.query<{ c: string }>(`SELECT operating_company_id::text AS c FROM mdata.loads WHERE id = $1::uuid`, [fixtureLoadId]))
      .rows[0]!.c;
    await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [company]);
    trailerEquipmentId = await prepareCompanyForLoadInserts(db, company);
    const terms = async (name: string, days: number) =>
      (await db.query<{ id: string }>(
        `INSERT INTO catalogs.payment_terms (operating_company_id, terms_name, days_until_due) VALUES ($1::uuid, $2, $3) RETURNING id::text`,
        [company, `${name} ${sfx}`, days]
      )).rows[0]!.id;
    net30 = await terms("CF8B NET 30", 30);
    net7 = await terms("CF8B NET 7", 7);
    nonFactoredCustomer = await customer("net30", false, net30);
    factoredCustomer = await customer("factored", true, net30);
  });

  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });

  it("(a) a non-factored invoice's receipt lands on the invoice due date", async () => {
    await rule("a", async () => {
      // Delivered B, invoiced B+2 on NET-30 -> due B+32. Delivery + terms (B+30) is NOT the receipt date.
      const loadId = await load({ customerId: nonFactoredCustomer, status: "delivered", rateCents: 111_117, deliveryIso: B });
      const invoiceId = randomUUID();
      await db.query(
        `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, issue_date, due_date, total_cents, status, source_load_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::date, $6::date, 111117, 'draft', $7::uuid)`,
        [invoiceId, company, nonFactoredCustomer, `INV-2027-${String(Math.floor(10000 + Math.random() * 89999))}`, day(2), day(32), loadId]
      );
      await insertInvoiceLine(db, company, invoiceId, 111_117, { loadId, status: "sent" });

      const row = (await ledgerRows()).find((r) => r.row_kind === "income" && r.load_id === loadId);
      expect.soft(row, "rolling ledger: the receipt row for the invoiced load").toMatchObject({ document_id: invoiceId, due_date: day(32) });

      expect.soft(incomeOn(await daily(day(32)), loadId), `daily prediction ${day(32)} (invoice due date): receipt present`).toBeDefined();
      expect.soft(incomeOn(await daily(day(30)), loadId), `daily prediction ${day(30)} (delivery + terms): receipt must not be here`).toBeUndefined();
    });
  });

  it("(b) a factored customer's receipt lands on the Faro funding date (= delivery, lag 0)", async () => {
    await rule("b", async () => {
      // Factored customer on NET-30 terms, delivered B, not yet invoiced: Faro funds at delivery -> B, never B+30.
      const loadId = await load({ customerId: factoredCustomer, status: "delivered", rateCents: 222_227, deliveryIso: B });

      const row = (await ledgerRows()).find((r) => r.row_kind === "income" && r.load_id === loadId);
      expect.soft(row, "rolling ledger: the factored load's receipt row").toMatchObject({ due_date: B });

      expect.soft(incomeOn(await daily(B), loadId), `daily prediction ${B} (delivery = funding): receipt present`).toBeDefined();
      expect.soft(incomeOn(await daily(day(30)), loadId), `daily prediction ${day(30)} (customer terms): receipt must not be here`).toBeUndefined();
    });
  });

  it("(c) a driver bill lands on its due date = the load's projected delivery", async () => {
    await rule("c", async () => {
      const driverId = await driver();
      const loadId = await load({ customerId: nonFactoredCustomer, status: "in_transit", rateCents: 300_000, deliveryIso: day(5), predicted: true, driverId });
      const billId = await driverBill(loadId, driverId, 33_331);

      const stamped = (await db.query<{ due: string | null; basis: string | null }>(
        `SELECT due_date::text AS due, due_date_basis AS basis FROM driver_finance.driver_bills WHERE id = $1::uuid`,
        [billId]
      )).rows[0]!;
      expect(stamped, "fixture: the mint trigger stamps the projected delivery (289d317c)").toEqual({ due: day(5), basis: "projected" });

      const row = (await ledgerRows()).find((r) => r.document_kind === "driver_bill" && r.document_id === billId);
      expect.soft(row, "rolling ledger: the driver bill row").toMatchObject({ row_kind: "expense", due_date: day(5), amount_cents: 33_331 });

      const out = (await daily(day(5))).expense_items.find((e) => e.load_id === loadId);
      expect.soft(out, `daily prediction ${day(5)}: the driver bill outflow for the load`).toMatchObject({ amount_cents: 33_331 });
    });
  });

  it("(d) a card payable on 2510 lands on the card's payment date", async () => {
    await rule("d", async () => {
      let card = await resolveRoleAccountOptional(db as never, company, "fuel_card_payable_dreamline");
      if (!card) {
        card = (await db.query<{ id: string }>(
          `INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype)
           VALUES ($1::uuid, '2510', 'Dreamline Diesel Card Payable', 'Liability', 'CreditCard') RETURNING id::text`,
          [company]
        )).rows[0]!.id;
        await db.query(
          `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id) VALUES ($1::uuid, 'fuel_card_payable_dreamline', $2::uuid)`,
          [company, card]
        );
      }
      const vendorId = (await db.query<{ id: string }>(
        `INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type, payment_terms_id) VALUES ($1::uuid, $2, 'Other', $3::uuid) RETURNING id::text`,
        [company, `CF8B Dreamline ${sfx}`, net7]
      )).rows[0]!.id;
      const expenseId = randomUUID();
      // Fuel bought on the card on B; the card is paid on its 7-day terms -> the cash leaves on B+7, not B.
      await db.query(
        `INSERT INTO accounting.expenses (id, operating_company_id, vendor_uuid, transaction_date, payment_account_uuid, payment_term_id,
                                          total_amount_cents, status, memo)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5::uuid, $6::uuid, 44417, 'posted', 'CF8B 2510 card fuel')`,
        [expenseId, company, vendorId, B, card, net7]
      );

      const row = (await ledgerRows()).find((r) => r.document_id === expenseId);
      expect.soft(row, "rolling ledger: the 2510 card payable row").toMatchObject({ row_kind: "expense", due_date: day(7) });

      const out = (await daily(day(7))).expense_items.find((e) => e.amount_cents === 44_417);
      expect.soft(out, `daily prediction ${day(7)} (card payment date): the 2510 outflow`).toBeDefined();
      const early = (await daily(B)).expense_items.find((e) => e.amount_cents === 44_417);
      expect.soft(early, `daily prediction ${B} (purchase date): the 2510 outflow must not be here`).toBeUndefined();
    });
  });

  it("(e) a Relay wallet top-up appears as an outflow on its date", async () => {
    await rule("e", async () => {
      const depositId = randomUUID();
      await db.query(
        `INSERT INTO integrations.relay_deposits (id, operating_company_id, deposit_id, relay_created_at, status, total_amount_cents,
                                                  funding_card_last4, classification, raw_payload, ingest_source)
         VALUES ($1::uuid, $2::uuid, $3, $4::timestamptz, 'completed', 55519, '0680', 'company', '{}'::jsonb, 'csv_import')`,
        [depositId, company, `CF8B-RD-${randomUUID().slice(0, 8)}`, noonUtc(day(3))]
      );

      const row = (await ledgerRows()).find((r) => r.document_id === depositId);
      expect.soft(row, "rolling ledger: the Relay top-up row").toMatchObject({ row_kind: "expense", due_date: day(3), amount_cents: 55_519 });

      const out = (await daily(day(3))).expense_items.find((e) => e.amount_cents === 55_519);
      expect.soft(out, `daily prediction ${day(3)}: the Relay top-up outflow`).toBeDefined();
    });
  });

  it("(f) a late load (predicted_delivery_date moved later) moves BOTH its driver bill and its receipt", async () => {
    await rule("f", async () => {
      const driverId = await driver();
      // Factored customer (lag 0) so the receipt date IS the projected delivery: B+10, then late to B+14.
      const loadId = await load({ customerId: factoredCustomer, status: "in_transit", rateCents: 666_667, deliveryIso: day(10), predicted: true, driverId });
      const billId = await driverBill(loadId, driverId, 66_661);
      expect(incomeOn(await daily(day(10)), loadId), "fixture: before the delay the receipt is on B+10").toBeDefined();

      await db.query(`UPDATE mdata.loads SET predicted_delivery_date = $2::timestamptz WHERE id = $1::uuid`, [loadId, noonUtc(day(14))]);

      // Receipt moved.
      expect.soft(incomeOn(await daily(day(14)), loadId), `daily prediction ${day(14)}: receipt moved to the new ETA`).toBeDefined();
      expect.soft(incomeOn(await daily(day(10)), loadId), `daily prediction ${day(10)}: receipt left the old ETA`).toBeUndefined();

      // Driver bill moved.
      const row = (await ledgerRows()).find((r) => r.document_kind === "driver_bill" && r.document_id === billId);
      expect.soft(row, "rolling ledger: the late load's driver bill follows the new ETA").toMatchObject({ due_date: day(14) });
      const out = (await daily(day(14))).expense_items.find((e) => e.load_id === loadId);
      expect.soft(out, `daily prediction ${day(14)}: the late load's driver bill outflow`).toMatchObject({ amount_cents: 66_661 });
    });
  });
});
