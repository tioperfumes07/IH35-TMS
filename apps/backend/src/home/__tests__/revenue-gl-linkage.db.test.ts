/**
 * 0280-02 revenue↔GL linkage — real Postgres behavioral coverage.
 * Runs only in CI (GITHUB_ACTIONS=true) with a migrated DB.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../../test-helpers/db-fixture.js";
import { companyBusinessDate } from "../../lib/company-business-date.js";
import { computeRevenueGlLinkage } from "../revenue-gl-linkage.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("0280-02 revenue-gl-linkage (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  let otherCompanyId: string | null = null;
  const suffix = randomUUID().slice(0, 8);
  const incomeAccountId = randomUUID();
  const expenseAccountId = randomUUID();
  const arAccountId = randomUUID();
  const customerId = randomUUID();
  const otherCustomerId = randomUUID();
  const matchedInvoiceId = randomUUID();
  const missingJeInvoiceId = randomUUID();
  const wrongAcctInvoiceId = randomUUID();
  const voidedInvoiceId = randomUUID();
  const otherCompanyInvoiceId = randomUUID();
  const matchedJeId = randomUUID();
  const wrongJeId = randomUUID();
  const voidedJeId = randomUUID();
  const today = companyBusinessDate();
  const revenueCents = 25_000;
  const n = () => String(Math.floor(10_000 + Math.random() * 89_999));
  const displayIds = {
    matched: `INV-2026-${n()}`,
    missing: `INV-2026-${n()}`,
    wrong: `INV-2026-${n()}`,
    voided: `INV-2026-${n()}`,
    other: `INV-2026-${n()}`,
    tomorrow: `INV-2026-${n()}`,
  };

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try {
      const result = await fn();
      await db.query("COMMIT");
      return result;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function scopedClient(): Promise<pg.Client> {
    // Reuse connection with company GUC set (mirrors withCompanyScope).
    await db.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [companyId]);
    return db;
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();

    await bypass(async () => {
      // Prefer a second real company for cross-entity isolation when available.
      const other = await db.query<{ id: string }>(
        `SELECT id::text AS id FROM org.companies WHERE id <> $1::uuid ORDER BY created_at ASC NULLS LAST LIMIT 1`,
        [companyId]
      );
      otherCompanyId = other.rows[0]?.id ?? null;

      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$2::uuid,$3,'REVGL Income','Income',true)`,
        [incomeAccountId, companyId, `RI${suffix}`]
      );
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$2::uuid,$3,'REVGL Expense','Expense',true)`,
        [expenseAccountId, companyId, `RE${suffix}`]
      );
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$2::uuid,$3,'REVGL AR','Asset',true)`,
        [arAccountId, companyId, `RA${suffix}`]
      );
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`,
        [customerId, companyId, `REVGL Cust ${suffix}`]
      );

      // Matched invoice + balanced JE (Dr AR / Cr Income) with source spine.
      await db.query(
        `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, issue_date, due_date, subtotal_cents, tax_cents, total_cents, status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$5::date,$6,0,$6,'sent')`,
        [matchedInvoiceId, companyId, customerId, displayIds.matched, today, revenueCents]
      );
      await db.query(
        `INSERT INTO accounting.journal_entries (id, operating_company_id, entry_date, memo, status, source)
         VALUES ($1::uuid,$2::uuid,$3::date,'revgl matched','posted','auto')`,
        [matchedJeId, companyId, today]
      );
      const pDebit = await db.query<{ id: string }>(
        `INSERT INTO accounting.journal_entry_postings
           (operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit, amount_cents,
            source_transaction_type, source_transaction_id)
         VALUES ($1::uuid,$2::uuid,1,$3::uuid,'debit',$4,'invoice',$5)
         RETURNING id`,
        [companyId, matchedJeId, arAccountId, revenueCents, matchedInvoiceId]
      );
      const pCredit = await db.query<{ id: string }>(
        `INSERT INTO accounting.journal_entry_postings
           (operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit, amount_cents,
            source_transaction_type, source_transaction_id)
         VALUES ($1::uuid,$2::uuid,2,$3::uuid,'credit',$4,'invoice',$5)
         RETURNING id`,
        [companyId, matchedJeId, incomeAccountId, revenueCents, matchedInvoiceId]
      );
      await db.query(
        `INSERT INTO accounting.transaction_source_links
           (operating_company_id, journal_entry_posting_id, linked_object_type, linked_object_id, relationship_role)
         VALUES ($1::uuid,$2::uuid,'invoice',$3,'source_transaction'),
                ($1::uuid,$4::uuid,'invoice',$3,'source_transaction')`,
        [companyId, pDebit.rows[0]!.id, matchedInvoiceId, pCredit.rows[0]!.id]
      );

      // Missing JE invoice.
      await db.query(
        `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, issue_date, due_date, subtotal_cents, tax_cents, total_cents, status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$5::date,12000,0,12000,'sent')`,
        [missingJeInvoiceId, companyId, customerId, displayIds.missing, today]
      );

      // Wrong account: credit landed on Expense.
      await db.query(
        `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, issue_date, due_date, subtotal_cents, tax_cents, total_cents, status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$5::date,9000,0,9000,'sent')`,
        [wrongAcctInvoiceId, companyId, customerId, displayIds.wrong, today]
      );
      await db.query(
        `INSERT INTO accounting.journal_entries (id, operating_company_id, entry_date, memo, status, source)
         VALUES ($1::uuid,$2::uuid,$3::date,'revgl wrong acct','posted','auto')`,
        [wrongJeId, companyId, today]
      );
      await db.query(
        `INSERT INTO accounting.journal_entry_postings
           (operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit, amount_cents,
            source_transaction_type, source_transaction_id)
         VALUES ($1::uuid,$2::uuid,1,$3::uuid,'debit',9000,'invoice',$4),
                ($1::uuid,$2::uuid,2,$5::uuid,'credit',9000,'invoice',$4)`,
        [companyId, wrongJeId, arAccountId, wrongAcctInvoiceId, expenseAccountId]
      );

      // Voided JE for an invoice.
      await db.query(
        `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, issue_date, due_date, subtotal_cents, tax_cents, total_cents, status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$5::date,6000,0,6000,'sent')`,
        [voidedInvoiceId, companyId, customerId, displayIds.voided, today]
      );
      await db.query(
        `INSERT INTO accounting.journal_entries (id, operating_company_id, entry_date, memo, status, source, voided_at)
         VALUES ($1::uuid,$2::uuid,$3::date,'revgl voided','voided','auto',now())`,
        [voidedJeId, companyId, today]
      );
      await db.query(
        `INSERT INTO accounting.journal_entry_postings
           (operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit, amount_cents,
            source_transaction_type, source_transaction_id)
         VALUES ($1::uuid,$2::uuid,1,$3::uuid,'debit',6000,'invoice',$4),
                ($1::uuid,$2::uuid,2,$5::uuid,'credit',6000,'invoice',$4)`,
        [companyId, voidedJeId, arAccountId, voidedInvoiceId, incomeAccountId]
      );

      if (otherCompanyId) {
        await db.query(
          `INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`,
          [otherCustomerId, otherCompanyId, `REVGL Other ${suffix}`]
        );
        await db.query(
          `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, issue_date, due_date, subtotal_cents, tax_cents, total_cents, status)
           VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$5::date,999999,0,999999,'sent')`,
          [otherCompanyInvoiceId, otherCompanyId, otherCustomerId, displayIds.other, today]
        );
      }
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        const invoiceIds = [matchedInvoiceId, missingJeInvoiceId, wrongAcctInvoiceId, voidedInvoiceId, otherCompanyInvoiceId];
        const jeIds = [matchedJeId, wrongJeId, voidedJeId];
        await db.query(`DELETE FROM accounting.transaction_source_links WHERE linked_object_id = ANY($1::text[])`, [
          invoiceIds.map(String),
        ]);
        await db.query(`DELETE FROM accounting.journal_entry_postings WHERE journal_entry_uuid = ANY($1::uuid[])`, [jeIds]);
        await db.query(`DELETE FROM accounting.journal_entries WHERE id = ANY($1::uuid[])`, [jeIds]);
        await db.query(`DELETE FROM accounting.invoices WHERE id = ANY($1::uuid[])`, [invoiceIds]);
        await db.query(`DELETE FROM mdata.customers WHERE id = ANY($1::uuid[])`, [[customerId, otherCustomerId]]);
        await db.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [
          [incomeAccountId, expenseAccountId, arAccountId],
        ]);
      });
    } catch {
      /* best-effort */
    }
    await db.end();
  });

  it("matched + missing JE + wrong account + voided JE are classified with drill hrefs", async () => {
    const client = await scopedClient();
    const result = await computeRevenueGlLinkage(client, {
      operatingCompanyId: companyId,
      fromDate: today,
      toDate: today,
    });
    expect(result.status).toBe("ok");
    expect(result.basis.invoice.label).toBe("invoice_basis");
    expect(result.basis.gl.label).toBe("gl_posted");
    expect(result.revenue_cents).not.toBeNull();

    const byInv = new Map(result.drill.mismatched_invoices.map((d) => [d.invoice_id, d]));
    expect(byInv.get(missingJeInvoiceId)?.reason).toBe("missing_je");
    expect(byInv.get(wrongAcctInvoiceId)?.reason).toBe("wrong_account");
    expect(byInv.get(voidedInvoiceId)?.reason).toBe("voided_je");
    expect(byInv.has(matchedInvoiceId)).toBe(false);

    expect(result.drill.mismatched_invoices.every((d) => d.href.includes(d.invoice_id))).toBe(true);
    expect(result.gl_posted_revenue_cents).toBeGreaterThanOrEqual(revenueCents);
  });

  it("cross-entity isolation: other company invoice does not inflate this company's invoice basis", async () => {
    if (!otherCompanyId) return; // skip soft when only one company seeded
    const client = await scopedClient();
    const result = await computeRevenueGlLinkage(client, {
      operatingCompanyId: companyId,
      fromDate: today,
      toDate: today,
    });
    expect(result.drill.mismatched_invoices.some((d) => d.invoice_id === otherCompanyInvoiceId)).toBe(false);
    expect(result.invoice_basis_cents).toBeLessThan(999999);
  });

  it("date boundary: tomorrow-recognized invoice excluded from today window", async () => {
    const tomorrowInv = randomUUID();
    const tomorrow = (() => {
      const [y, m, d] = today.split("-").map(Number);
      const dt = new Date(Date.UTC(y!, m! - 1, d!, 12));
      dt.setUTCDate(dt.getUTCDate() + 1);
      return companyBusinessDate(dt);
    })();
    await bypass(async () => {
      await db.query(
        `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, issue_date, due_date, subtotal_cents, tax_cents, total_cents, status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$5::date,1111,0,1111,'sent')`,
        [tomorrowInv, companyId, customerId, displayIds.tomorrow, tomorrow]
      );
    });
    try {
      const client = await scopedClient();
      const result = await computeRevenueGlLinkage(client, {
        operatingCompanyId: companyId,
        fromDate: today,
        toDate: today,
      });
      expect(result.drill.mismatched_invoices.some((d) => d.invoice_id === tomorrowInv)).toBe(false);
    } finally {
      await bypass(async () => {
        await db.query(`DELETE FROM accounting.invoices WHERE id=$1::uuid`, [tomorrowInv]);
      });
    }
  });
});
