/**
 * SCENTSX payables (read only): A/P aging by vendor and the vendor account tie to the books' own A/P aging reconstruction
 * (accounting/ap-aging.service.ts AP_AGING_OPEN_BILLS_SQL) to the cent — through a real bill (createBillInClientTx) and a real
 * partial payment (payBillInClientTx). Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createBillInClientTx, payBillInClientTx } from "../accounting/bills.service.js";
import { AP_AGING_OPEN_BILLS_SQL } from "../accounting/ap-aging.service.js";
import { postSourceTransactionInClientTx } from "../accounting/posting-engine.service.js";
import { createVendorCreditInClientTx } from "../accounting/vendor-credits.service.js";
import { apBucketOf, payablesAging, ScentsxVendorNotOnBooks, vendorAccount } from "./payables.service.js";

describe("A/P bucket (the books' ladder: days past due)", () => {
  it("not yet due is Current; 1–30, 31–60, 61–90, 90+", () => {
    expect([-5, 0, 1, 30, 31, 60, 61, 90, 91].map(apBucketOf)).toEqual(["current", "current", "d1_30", "d1_30", "d31_60", "d31_60", "d61_90", "d61_90", "d90_plus"]);
  });
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("ScentsX payables (real Postgres, rolled back)", () => {
  let db: pg.Client;
  let co: string;
  const u = TEST_OWNER_USER_ID;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    co = (await db.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'SCENTSX'`)).rows[0]!.id;
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });

  it("aging by vendor and the vendor account tie to the books' A/P aging; a partial payment leaves the rest open", async () => {
    const asOf = "2026-11-27";
    const vendor = (await db.query<{ id: string }>(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1::uuid, 'AP test vendor', 'Other') RETURNING id::text`, [co])).rows[0]!.id;
    const acct = (await db.query<{ id: string }>(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = '6990'`, [co])).rows[0]!.id;
    const bank = (await db.query<{ id: string }>(
      `SELECT b.id::text FROM banking.bank_accounts b JOIN catalogs.accounts a ON a.id = b.ledger_account_id WHERE b.operating_company_id = $1::uuid AND a.account_number = '1000'`, [co])).rows[0]!.id;
    const mk = async (no: string, billDate: string, due: string, cents: number) => (await createBillInClientTx(db as never, {
      operatingCompanyId: co, source: "manual", vendorId: vendor, billNumber: no, autoDisplayId: true, billDate, dueDate: due, amountCents: cents,
      lines: [{ amountCents: cents, accountId: acct, description: no }] }, u)).id;
    // The bill's A/P leg posts through the one engine (the route does this via postBillGlIfEnabled, flag ON for ScentsX live).
    const post = async (billId: string) => { await postSourceTransactionInClientTx(db as never, { operating_company_id: co, source_transaction_type: "bill", source_transaction_id: billId }, { userId: u }); return billId; };
    const notDue = await post(await mk("AP-1", "2026-11-20", "2026-12-20", 10000)); // Current
    const late45 = await post(await mk("AP-2", "2026-09-01", "2026-10-13", 25000)); // 45 days past due → 31–60
    await payBillInClientTx(db as never, { operatingCompanyId: co, billId: late45, paymentDate: "2026-11-25", amountCents: 5000, paymentMethod: "ach", fromBankAccountId: bank, referenceNumber: "ACH 1" }, u);

    const aging = await payablesAging(db, { as_of: asOf });
    const mine = aging.vendors.find((v) => v.vendor_id === vendor)!;
    expect(mine).toMatchObject({ current: 10000, d31_60: 20000, total: 30000, bills: 2, oldest_past_due: 45 });

    // Ties to the books' A/P aging SQL to the cent — every ScentsX vendor and the grand total.
    const books = await db.query<{ vendor_id: string | null; outstanding_cents: string }>(AP_AGING_OPEN_BILLS_SQL, [co, asOf]);
    const booksTotal = books.rows.reduce((s, r) => s + Number(r.outstanding_cents), 0);
    expect(aging.totals.total).toBe(booksTotal);
    expect(books.rows.filter((r) => r.vendor_id === vendor).reduce((s, r) => s + Number(r.outstanding_cents), 0)).toBe(30000);

    const acc = await vendorAccount(db, vendor, { as_of: asOf });
    expect(acc.buckets).toMatchObject({ current: 10000, d31_60: 20000, total: 30000 });
    expect(acc.open_bills.map((b) => [b.id, b.open_cents, b.past_due])).toEqual([[late45, 20000, 45], [notDue, 10000, -23]]);
    expect(acc.payments).toEqual([expect.objectContaining({ bill_id: late45, amount_cents: 5000, method: "ach", reference_number: "ACH 1", paid_from: "Operating Checking", voided: false })]);
    expect(acc.bank_accounts.map((b) => b.account_number)).toContain("1000");

    // As of before the payment: the full $250.00 is open on AP-2.
    expect((await vendorAccount(db, vendor, { as_of: "2026-11-24" })).buckets.total).toBe(35000);

    // LEAD item 26: an open vendor credit shows on the vendor account with what is left to apply (applied through the one engine).
    const vc = await createVendorCreditInClientTx(db as never, { operatingCompanyId: co, vendorId: vendor, issueDate: "2026-11-26", amountCents: 4000, accountId: acct, notes: "returned 2 units", userId: u });
    const withCredit = await vendorAccount(db, vendor, { as_of: asOf });
    expect(withCredit.credits).toEqual([expect.objectContaining({ id: String(vc.id), amount_cents: 4000, applied_cents: 0, unapplied_cents: 4000, notes: "returned 2 units" })]);
  });

  it("L.37 red: a supplier's own id opens its linked ScentsX vendor; an unlinked supplier is refused as not on the books (never a bare error)", async () => {
    const v = (await db.query<{ id: string }>(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1::uuid, 'AP linked vendor', 'Other') RETURNING id::text`, [co])).rows[0]!.id;
    const linked = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('AP linked supplier', 'buy') RETURNING id::text`)).rows[0]!.id;
    await db.query(`INSERT INTO scentsx.vendor_links (operating_company_id, perfume_vendor_id, vendor_id) VALUES ($1::uuid, $2::uuid, $3::uuid)`, [co, linked, v]);
    const bySupplier = await vendorAccount(db, linked, { as_of: "2026-11-27" });
    expect(bySupplier.vendor).toMatchObject({ id: v, perfume_vendor_id: linked });

    const unlinked = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('AP unlinked supplier', 'buy') RETURNING id::text`)).rows[0]!.id;
    const err = await vendorAccount(db, unlinked, { as_of: "2026-11-27" }).catch((e) => e);
    expect(err).toBeInstanceOf(ScentsxVendorNotOnBooks);
    expect((err as ScentsxVendorNotOnBooks).supplierName).toBe("AP unlinked supplier");
  });
});
