/**
 * 0280-02 revenue↔GL linkage — real Postgres behavioral coverage.
 * Runs only in CI (GITHUB_ACTIONS=true) with a migrated DB.
 *
 * ISOLATION: owns UNIQUE org.companies rows via createIsolatedOperatingCompany().
 * ROOT CAUSE of flake expected 28500 / received 368500: shared TRANSP company let
 * parallel CI forks' Income credits inflate gl_posted_revenue_cents for "today".
 *
 * FORCED-RLS session law: accounting.invoices WITH CHECK requires
 * operating_company_id = current_setting('app.operating_company_id') (no broad bypass escape).
 * Each company's seed/cleanup runs under THAT company's scoped GUC (canonical bypass(scope, fn)).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/isolated-company.js";
import { companyBusinessDate } from "../../lib/company-business-date.js";
import { computeRevenueGlLinkage } from "../revenue-gl-linkage.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("0280-02 revenue-gl-linkage (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  let isolated: IsolatedOperatingCompany;
  let otherIsolated: IsolatedOperatingCompany | null = null;
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
  const draftInvoiceId = randomUUID();
  const tslOnlyInvoiceId = randomUUID();
  const matchedJeId = randomUUID();
  const wrongJeId = randomUUID();
  const voidedJeId = randomUUID();
  const tslOnlyJeId = randomUUID();
  const reversedJeId = randomUUID();
  const compensatingJeId = randomUUID();
  const reversedBatchId = randomUUID();
  const compensatingBatchId = randomUUID();
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
    draft: `INV-2026-${n()}`,
    tsl: `INV-2026-${n()}`,
  };

  /**
   * Canonical scoped seed/cleanup: SET LOCAL company GUC (+ lucia where catalogs/org helpers need it).
   * Never insert company-B rows while GUC is company-A — invoices WITH CHECK rejects that.
   */
  async function bypass<T>(scopeCompanyId: string, fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [scopeCompanyId]);
    try {
      const result = await fn();
      await db.query("COMMIT");
      return result;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  /** Enforced RLS (bypass cleared) — mirrors withCompanyRls / production withCompanyScope. */
  async function withEnforcedCompanyRls<T>(scopeCompanyId: string, fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query(`SELECT set_config('app.bypass_rls', '', true)`);
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [scopeCompanyId]);
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
    // Restore target (primary) company scope before service assertions.
    await db.query(`SELECT set_config('app.bypass_rls', '', false)`);
    await db.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [companyId]);
    return db;
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    isolated = await createIsolatedOperatingCompany({
      codePrefix: "RGL",
      legalNamePrefix: "REVGL Primary",
      label: "revgl-primary",
    });
    companyId = isolated.companyId;
    otherIsolated = await createIsolatedOperatingCompany({
      codePrefix: "RGO",
      legalNamePrefix: "REVGL Other",
      label: "revgl-other",
    });
    otherCompanyId = otherIsolated.companyId;

    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");

    await bypass(companyId, async () => {
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

      // Draft exclusion plant — large draft must not enter invoice basis.
      await db.query(
        `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, issue_date, due_date, subtotal_cents, tax_cents, total_cents, status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$5::date,777777,0,777777,'draft')`,
        [draftInvoiceId, companyId, customerId, displayIds.draft, today]
      );

      // TSL-only link: no denormalized source_transaction_* on postings; link via transaction_source_links.
      await db.query(
        `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, issue_date, due_date, subtotal_cents, tax_cents, total_cents, status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$5::date,3500,0,3500,'sent')`,
        [tslOnlyInvoiceId, companyId, customerId, displayIds.tsl, today]
      );
      await db.query(
        `INSERT INTO accounting.journal_entries (id, operating_company_id, entry_date, memo, status, source)
         VALUES ($1::uuid,$2::uuid,$3::date,'revgl tsl-only','posted','auto')`,
        [tslOnlyJeId, companyId, today]
      );
      const tslDebit = await db.query<{ id: string }>(
        `INSERT INTO accounting.journal_entry_postings
           (operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit, amount_cents)
         VALUES ($1::uuid,$2::uuid,1,$3::uuid,'debit',3500)
         RETURNING id`,
        [companyId, tslOnlyJeId, arAccountId]
      );
      const tslCredit = await db.query<{ id: string }>(
        `INSERT INTO accounting.journal_entry_postings
           (operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit, amount_cents)
         VALUES ($1::uuid,$2::uuid,2,$3::uuid,'credit',3500)
         RETURNING id`,
        [companyId, tslOnlyJeId, incomeAccountId]
      );
      await db.query(
        `INSERT INTO accounting.transaction_source_links
           (operating_company_id, journal_entry_posting_id, linked_object_type, linked_object_id, relationship_role)
         VALUES ($1::uuid,$2::uuid,'invoice',$3,'source_transaction'),
                ($1::uuid,$4::uuid,'invoice',$3,'source_transaction')`,
        [companyId, tslDebit.rows[0]!.id, tslOnlyInvoiceId, tslCredit.rows[0]!.id]
      );

      // Reversed original + posted compensating same-day → net zero on Income (gate admits both).
      await db.query(
        `INSERT INTO accounting.posting_batches (id, operating_company_id, batch_status, source_transaction_type, source_transaction_id)
         VALUES ($1::uuid,$2::uuid,'reversed','manual','revgl-reversed-${suffix}'),
                ($3::uuid,$2::uuid,'posted','manual','revgl-comp-${suffix}')`,
        [reversedBatchId, companyId, compensatingBatchId]
      );
      await db.query(
        `INSERT INTO accounting.journal_entries (id, operating_company_id, entry_date, memo, status, source)
         VALUES ($1::uuid,$2::uuid,$3::date,'revgl reversed orig','posted','auto'),
                ($4::uuid,$2::uuid,$3::date,'revgl compensating','posted','auto')`,
        [reversedJeId, companyId, today, compensatingJeId]
      );
      await db.query(
        `INSERT INTO accounting.journal_entry_postings
           (operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit, amount_cents, posting_batch_id)
         VALUES
           ($1::uuid,$2::uuid,1,$3::uuid,'debit',4000,$4::uuid),
           ($1::uuid,$2::uuid,2,$5::uuid,'credit',4000,$4::uuid),
           ($1::uuid,$6::uuid,1,$5::uuid,'debit',4000,$7::uuid),
           ($1::uuid,$6::uuid,2,$3::uuid,'credit',4000,$7::uuid)`,
        [companyId, reversedJeId, arAccountId, reversedBatchId, incomeAccountId, compensatingJeId, compensatingBatchId]
      );
    });

    // Other-company plant MUST run under otherCompanyId GUC — invoices WITH CHECK is company-scoped.
    await bypass(otherCompanyId!, async () => {
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`,
        [otherCustomerId, otherCompanyId, `REVGL Other ${suffix}`]
      );
      await db.query(
        `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, issue_date, due_date, subtotal_cents, tax_cents, total_cents, status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$5::date,999999,0,999999,'sent')`,
        [otherCompanyInvoiceId, otherCompanyId, otherCustomerId, displayIds.other, today]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      if (otherCompanyId) {
        await bypass(otherCompanyId, async () => {
          await db.query(`DELETE FROM accounting.invoices WHERE id = $1::uuid`, [otherCompanyInvoiceId]);
          await db.query(`DELETE FROM mdata.customers WHERE id = $1::uuid`, [otherCustomerId]);
          if (otherIsolated) await deactivateIsolatedOperatingCompany(db, otherIsolated);
        });
      }
      await bypass(companyId, async () => {
        const invoiceIds = [
          matchedInvoiceId,
          missingJeInvoiceId,
          wrongAcctInvoiceId,
          voidedInvoiceId,
          draftInvoiceId,
          tslOnlyInvoiceId,
        ];
        const jeIds = [matchedJeId, wrongJeId, voidedJeId, tslOnlyJeId, reversedJeId, compensatingJeId];
        await db.query(`DELETE FROM accounting.transaction_source_links WHERE linked_object_id = ANY($1::text[])`, [
          invoiceIds.map(String),
        ]);
        await db.query(`DELETE FROM accounting.journal_entry_postings WHERE journal_entry_uuid = ANY($1::uuid[])`, [jeIds]);
        await db.query(`DELETE FROM accounting.journal_entries WHERE id = ANY($1::uuid[])`, [jeIds]);
        await db.query(`DELETE FROM accounting.posting_batches WHERE id = ANY($1::uuid[])`, [
          [reversedBatchId, compensatingBatchId],
        ]);
        await db.query(`DELETE FROM accounting.invoices WHERE id = ANY($1::uuid[])`, [invoiceIds]);
        await db.query(`DELETE FROM mdata.customers WHERE id = ANY($1::uuid[])`, [[customerId]]);
        await db.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [
          [incomeAccountId, expenseAccountId, arAccountId],
        ]);
        if (isolated) await deactivateIsolatedOperatingCompany(db, isolated);
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

  it("two-company FORCED-RLS setup: other-company invoice visible under its scope, hidden under primary", async () => {
    expect(otherCompanyId).toBeTruthy();
    await withEnforcedCompanyRls(otherCompanyId!, async () => {
      const seen = await db.query<{ id: string }>(
        `SELECT id::text AS id FROM accounting.invoices WHERE id = $1::uuid`,
        [otherCompanyInvoiceId]
      );
      expect(seen.rows).toHaveLength(1);
    });
    await withEnforcedCompanyRls(companyId, async () => {
      const hidden = await db.query<{ id: string }>(
        `SELECT id::text AS id FROM accounting.invoices WHERE id = $1::uuid`,
        [otherCompanyInvoiceId]
      );
      expect(hidden.rows).toHaveLength(0);
    });
    await scopedClient();
  });

  it("FORCED RLS: cross-company invoice insert without matching GUC still fails", async () => {
    expect(otherCompanyId).toBeTruthy();
    const probeId = randomUUID();
    const probeDisplay = `INV-2026-${n()}`;
    await expect(
      bypass(companyId, async () => {
        await db.query(
          `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, issue_date, due_date, subtotal_cents, tax_cents, total_cents, status)
           VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$5::date,1,0,1,'sent')`,
          [probeId, otherCompanyId, otherCustomerId, probeDisplay, today]
        );
      })
    ).rejects.toMatchObject({ code: "42501" });
    await scopedClient();
  });

  it("cross-entity isolation: other company invoice does not inflate this company's invoice basis", async () => {
    expect(otherCompanyId).toBeTruthy();
    const client = await scopedClient();
    const result = await computeRevenueGlLinkage(client, {
      operatingCompanyId: companyId,
      fromDate: today,
      toDate: today,
    });
    expect(result.drill.mismatched_invoices.some((d) => d.invoice_id === otherCompanyInvoiceId)).toBe(false);
    expect(result.invoice_basis_cents).toBeLessThan(999999);
  });

  it("draft exclusion: draft invoice does not inflate invoice basis", async () => {
    const client = await scopedClient();
    const result = await computeRevenueGlLinkage(client, {
      operatingCompanyId: companyId,
      fromDate: today,
      toDate: today,
    });
    expect(result.drill.mismatched_invoices.some((d) => d.invoice_id === draftInvoiceId)).toBe(false);
    expect(result.invoice_basis_cents).toBeLessThan(777777);
  });

  it("TSL-only link: invoice matched via transaction_source_links (not false unlinked)", async () => {
    const client = await scopedClient();
    const result = await computeRevenueGlLinkage(client, {
      operatingCompanyId: companyId,
      fromDate: today,
      toDate: today,
    });
    expect(result.drill.mismatched_invoices.some((d) => d.invoice_id === tslOnlyInvoiceId)).toBe(false);
    expect(
      result.drill.mismatched_journal_entries.some(
        (d) => d.journal_entry_id === tslOnlyJeId && d.reason === "unlinked_gl_revenue"
      )
    ).toBe(false);
  });

  it("reversed + posted compensating same-day nets zero on governed revenue (gate admits both)", async () => {
    const client = await scopedClient();
    const result = await computeRevenueGlLinkage(client, {
      operatingCompanyId: companyId,
      fromDate: today,
      toDate: today,
    });
    // Matched invoice (25000) + TSL-only (3500) contribute income credits; reversed+comp cancel.
    // Net must equal sum of non-cancelled Income credits from matched+tsl (voided JE excluded).
    expect(result.gl_posted_revenue_cents).toBe(revenueCents + 3500);
  });

  it("date boundary: tomorrow-recognized invoice excluded from today window", async () => {
    const tomorrowInv = randomUUID();
    const tomorrow = (() => {
      const [y, m, d] = today.split("-").map(Number);
      const dt = new Date(Date.UTC(y!, m! - 1, d!, 12));
      dt.setUTCDate(dt.getUTCDate() + 1);
      return companyBusinessDate(dt);
    })();
    await bypass(companyId, async () => {
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
      await bypass(companyId, async () => {
        await db.query(`DELETE FROM accounting.invoices WHERE id=$1::uuid`, [tomorrowInv]);
      });
    }
  });
});
