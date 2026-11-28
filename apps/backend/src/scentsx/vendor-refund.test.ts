/**
 * VENDOR REFUNDS (mirror of customer refunds; owner 2026-11-27 22:54 CT "all and total wiring … ar ap"). On ScentsX: a $50.00 vendor
 * credit against 5000 COGS left unapplied (the vendor owes us), then $30.00 of it refunded by the vendor's check into Operating Checking —
 *   · the refund posts Dr 1000 Operating Checking 3000 / Cr 2000 A/P 3000 through the posting engine (source vendor_refund);
 *   · the vendor credit has $20.00 left; a refund over what is left is refused; a replay with the same key makes no second posting;
 *   · voiding the refund reverses it and the $30.00 goes back to the vendor credit.
 * Real Postgres, rolled back. The writers are the product's own (createVendorCreditInClientTx, createVendorRefundInClientTx,
 * voidVendorRefundInClientTx) — no GL math here.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createVendorCreditInClientTx } from "../accounting/vendor-credits.service.js";
import { createVendorRefundInClientTx, liveRefundCentsForVendorCredit, voidVendorRefundInClientTx } from "../accounting/vendor-refunds.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("vendor refund of a vendor credit (ScentsX, real Postgres, rolled back)", () => {
  let db: pg.Client;
  let co: string;
  const acct = async (num: string) =>
    (await db.query<{ id: string }>(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = $2 AND deactivated_at IS NULL`, [co, num])).rows[0]!.id;
  const lines = async (id: string) =>
    (await db.query<{ num: string; side: string; cents: string; je: string }>(
      `SELECT a.account_number AS num, p.debit_or_credit AS side, p.amount_cents::text AS cents, j.id::text AS je
         FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
         JOIN catalogs.accounts a ON a.id = p.account_id
        WHERE j.operating_company_id = $1::uuid AND p.source_transaction_type = 'vendor_refund' AND p.source_transaction_id = $2
        ORDER BY j.created_at, p.debit_or_credit DESC, a.account_number`,
      [co, id]
    )).rows;
  const memo = async (id: string) =>
    (await db.query<{ left: string; status: string }>(`SELECT (amount_cents - amount_applied_cents)::text AS left, status FROM accounting.vendor_credits WHERE id = $1::uuid`, [id])).rows[0]!;

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
      [co, TEST_OWNER_USER_ID, ["GL_POSTING_ENABLED"]]
    );
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });

  it("vendor refund posts Dr bank / Cr A/P, consumes the vendor credit, refuses over-refund, replays once, and voids back", async () => {
    const u = TEST_OWNER_USER_ID;
    const vendor = (await db.query<{ id: string }>(
      `INSERT INTO mdata.vendors (vendor_name, vendor_type, operating_company_id) VALUES ('Refund test supplier', 'Other', $1::uuid) RETURNING id::text`, [co])).rows[0]!.id;
    const vc = await createVendorCreditInClientTx(db as never, { operatingCompanyId: co, vendorId: vendor, issueDate: "2026-11-27", amountCents: 5000,
      accountId: await acct("5000"), notes: "Returned 2 damaged bottles", userId: u });
    const vcId = String((vc as { id: string }).id);
    const bank = (await db.query<{ id: string }>(
      `SELECT b.id::text FROM banking.bank_accounts b JOIN catalogs.accounts a ON a.id = b.ledger_account_id
        WHERE b.operating_company_id = $1::uuid AND a.account_number = '1000' AND b.deactivated_at IS NULL LIMIT 1`, [co])).rows[0]!.id;

    const r = await createVendorRefundInClientTx(db as never, { operatingCompanyId: co, userId: u, input: {
      vendor_credit_id: vcId, bank_account_id: bank, amount_cents: 3000, method: "check", reference: "88123", idempotency_key: `test-vrefund-${vcId}` } });
    expect("error" in r ? r : r.code).toBe(201);
    const refund = (r as { data: { refund: { id: string; display_id: string; journal_entry_id: string; amount_cents: number; vendor_id: string } } }).data.refund;
    expect(refund.display_id).toMatch(/^VR-\d{4}-\d{5}$/);
    expect(refund.vendor_id).toBe(vendor);
    const posted = await lines(refund.id);
    expect(posted.map((l) => [l.side, l.num, Number(l.cents)])).toEqual([["debit", "1000", 3000], ["credit", "2000", 3000]]);
    expect(posted.every((l) => l.je === refund.journal_entry_id)).toBe(true);
    expect(await memo(vcId)).toEqual({ left: "2000", status: "open" });

    const again = await createVendorRefundInClientTx(db as never, { operatingCompanyId: co, userId: u, input: {
      vendor_credit_id: vcId, bank_account_id: bank, amount_cents: 3000, method: "check", reference: "88123", idempotency_key: `test-vrefund-${vcId}` } });
    expect((again as { data: { refund: { id: string }; replayed?: boolean } }).data).toMatchObject({ refund: { id: refund.id }, replayed: true });
    expect((await lines(refund.id)).length).toBe(2);

    const over = await createVendorRefundInClientTx(db as never, { operatingCompanyId: co, userId: u, input: {
      vendor_credit_id: vcId, bank_account_id: bank, amount_cents: 2001, method: "ach" } });
    expect(over).toMatchObject({ code: 422, error: "refund_exceeds_credit" });
    expect(await liveRefundCentsForVendorCredit(db as never, co, vcId)).toBe(3000);

    const v = await voidVendorRefundInClientTx(db as never, { operatingCompanyId: co, userId: u, refundId: refund.id, reason: "vendor check bounced" });
    expect("error" in v ? v : v.code).toBe(200);
    const after = await lines(refund.id);
    const net = new Map<string, number>();
    for (const l of after) net.set(l.num, (net.get(l.num) ?? 0) + (l.side === "debit" ? 1 : -1) * Number(l.cents));
    expect(Object.fromEntries(net)).toEqual({ "1000": 0, "2000": 0 });
    expect(after.length).toBe(4);
    expect(await memo(vcId)).toEqual({ left: "5000", status: "open" });
    expect(await liveRefundCentsForVendorCredit(db as never, co, vcId)).toBe(0);
  });
});
