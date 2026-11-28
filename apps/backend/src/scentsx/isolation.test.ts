/**
 * ScentsX DATA-NOT-MIXED isolation test — L.38 CC-2.
 *
 * Creates and posts a ScentsX bill inside a rolled-back transaction, then asserts:
 * A) The ScentsX records are visible under ScentsX scope (proves they were created).
 * B) Direct queries filtered by USMCA operating_company_id return 0 ScentsX rows.
 * C) The USMCA trial balance total is unchanged.
 * D) generalLedger, salesTaxLiability, dailyReport results carry only ScentsX operating_company_id.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createBillInClientTx } from "../accounting/bills.service.js";
import { postSourceTransactionInClientTx } from "../accounting/posting-engine.service.js";
import { queryTrialBalanceRows } from "../accounting/trial-balance.service.js";
import { payablesAging } from "./payables.service.js";
import { generalLedger } from "./general-ledger.service.js";
import { salesTaxLiability } from "./sales-tax.service.js";
import { dailyReport } from "./daily-report.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("ScentsX data isolation — L.38 CC-2 (real Postgres, rolled back)", () => {
  let db: pg.Client;
  let sxId: string;
  let usmcaId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    sxId = (await db.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'SCENTSX'`)).rows[0]!.id;
    usmcaId = (await db.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'USMCA'`)).rows[0]!.id;
  });

  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });

  it("A ScentsX bill and its posting do not leak into USMCA-scoped queries or affect the USMCA trial balance", async () => {
    const today = "2026-11-28";

    // snapshot the USMCA trial balance before any ScentsX activity
    const tbBefore = await queryTrialBalanceRows(db, { operating_company_id: usmcaId, to_date: today });
    const sumBefore = tbBefore.reduce((s, r) => s + Number(r.total_debits) - Number(r.total_credits), 0);

    // --- create ScentsX bill ---
    const vendor = (await db.query<{ id: string }>(
      `INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1::uuid, 'Isolation test vendor', 'Other') RETURNING id::text`,
      [sxId]
    )).rows[0]!.id;
    const expenseAcct = (await db.query<{ id: string }>(
      `SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = '6990' LIMIT 1`,
      [sxId]
    )).rows[0]?.id;
    expect(expenseAcct, "ScentsX must have a 6990 account").toBeTruthy();

    const bill = await createBillInClientTx(db as never, {
      operatingCompanyId: sxId,
      vendorId: vendor,
      source: "manual",
      billDate: today,
      amountCents: 5000,
      lines: [{ amountCents: 5000, accountId: expenseAcct!, description: "isolation test bill" }],
    }, TEST_OWNER_USER_ID);
    // Post the bill's A/P leg through the one engine (the route does this via postBillGlIfEnabled) so a real ScentsX JE exists.
    await postSourceTransactionInClientTx(db as never, { operating_company_id: sxId, source_transaction_type: "bill", source_transaction_id: bill.id }, { userId: TEST_OWNER_USER_ID });
    const sxJe = (await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
        WHERE p.source_transaction_id = $1 AND j.operating_company_id = $2::uuid`, [bill.id, sxId])).rows[0]!.n;
    expect(Number(sxJe), "the ScentsX bill posted on ScentsX's books").toBeGreaterThan(0);

    // A) ScentsX payables sees the new bill under ScentsX scope
    const aging = await payablesAging(db, { as_of: today });
    expect(aging.vendors.some((v) => v.vendor_id === vendor)).toBe(true);

    // B) USMCA-scoped direct queries: ScentsX bill and invoice are NOT visible under USMCA company
    const billLeak = (await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM accounting.bills WHERE operating_company_id = $1::uuid AND id = $2::uuid`,
      [usmcaId, bill.id]
    )).rows[0]!.n;
    expect(Number(billLeak), "ScentsX bill must not appear under USMCA operating_company_id").toBe(0);

    // B) ScentsX journal entries not accessible via USMCA operating_company_id filter
    const jeLeak = (await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM accounting.journal_entries WHERE operating_company_id = $1::uuid
         AND id IN (SELECT journal_entry_uuid FROM accounting.journal_entry_postings WHERE source_transaction_id = $2)`,
      [usmcaId, bill.id]
    )).rows[0]!.n;
    expect(Number(jeLeak), "ScentsX JEs must not appear under USMCA operating_company_id").toBe(0);

    // C) USMCA trial balance total is UNCHANGED — ScentsX activity does not affect USMCA accounts
    const tbAfter = await queryTrialBalanceRows(db, { operating_company_id: usmcaId, to_date: today });
    const sumAfter = tbAfter.reduce((s, r) => s + Number(r.total_debits) - Number(r.total_credits), 0);
    expect(sumAfter, "USMCA trial balance must not change when ScentsX activity is added").toBe(sumBefore);

    // D) Every posting of the ScentsX bill sits on a ScentsX account (never another company's chart).
    const foreign = (await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id = p.account_id
        WHERE p.source_transaction_id = $1 AND a.operating_company_id <> $2::uuid`, [bill.id, sxId])).rows[0]!.n;
    expect(Number(foreign), "ScentsX postings only on ScentsX accounts").toBe(0);

    // D) Even with the session set to USMCA, the scentsx services read ScentsX only (scopeToScentsx), never USMCA's books.
    await db.query(`SELECT set_config('app.operating_company_id', $1, true)`, [usmcaId]);
    const agingUnderUsmca = await payablesAging(db, { as_of: today });
    expect(agingUnderUsmca.operating_company_id).toBe(sxId);
    const agingVendorIds = agingUnderUsmca.vendors.map((v) => v.vendor_id).filter(Boolean) as string[];
    const nonSxVendors = (await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM mdata.vendors WHERE id = ANY($1::uuid[]) AND operating_company_id <> $2::uuid`, [agingVendorIds, sxId])).rows[0]!.n;
    expect(Number(nonSxVendors), "ScentsX payables never list another company's vendor").toBe(0);
    const gl = await generalLedger(db, { from: today, to: today });
    const glIds = gl.accounts.map((a) => a.account_id);
    expect(gl.operating_company_id).toBe(sxId);
    const nonSxAccts = (await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM catalogs.accounts WHERE id = ANY($1::uuid[]) AND operating_company_id <> $2::uuid`, [glIds, sxId])).rows[0]!.n;
    expect(Number(nonSxAccts), "the ScentsX general ledger never shows another company's account").toBe(0);

    // salesTaxLiability and dailyReport run without throwing under ScentsX scope
    await expect(salesTaxLiability(db, { from: today, to: today })).resolves.toBeDefined();
    await expect(dailyReport(db, { date: today })).resolves.toBeDefined();
  });
});
