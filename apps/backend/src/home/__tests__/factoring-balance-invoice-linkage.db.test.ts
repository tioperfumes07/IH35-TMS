/**
 * 0280-05 factoring-balance-invoice-linkage — real Postgres behavioral coverage.
 * Runs only in CI (GITHUB_ACTIONS=true) with a migrated DB.
 *
 * Covers: multi-invoice (no fanout), voided/reversed exclusion, collections /
 * reserve releases / recourse, cross-company isolation, empty, planted query failure.
 *
 * FORCED-RLS session law: seed under scoped bypass(companyId); assert under enforced RLS.
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
import { computeFactoringBalanceInvoiceLinkage } from "../factoring-balance-invoice-linkage.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("0280-05 factoring-balance-invoice-linkage (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  let isolated: IsolatedOperatingCompany;
  let otherIsolated: IsolatedOperatingCompany | null = null;
  let otherCompanyId: string | null = null;
  const suffix = randomUUID().slice(0, 8);
  const vendorId = randomUUID();
  const otherVendorId = randomUUID();
  const customerId = randomUUID();
  const otherCustomerId = randomUUID();

  const multiAdvanceId = randomUUID();
  const settledAdvanceId = randomUUID();
  const recourseAdvanceId = randomUUID();
  const voidedAdvanceId = randomUUID();
  const otherCompanyAdvanceId = randomUUID();

  const invA = randomUUID();
  const invB = randomUUID();
  const invC = randomUUID();
  const invSettled = randomUUID();
  const invRecourse = randomUUID();
  const invVoidedAdv = randomUUID();
  const invVoidedInvoice = randomUUID();
  const invOther = randomUUID();

  async function bypass<T>(scopeCompanyId: string, fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [scopeCompanyId]);
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
    await db.query(`SELECT set_config('app.bypass_rls', '', false)`);
    await db.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [companyId]);
    return db;
  }

  const n = () => String(Math.floor(10_000 + Math.random() * 89_999));

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    isolated = await createIsolatedOperatingCompany({
      codePrefix: "FBL",
      legalNamePrefix: "FactBal Primary",
      label: "factbal-primary",
    });
    companyId = isolated.companyId;
    otherIsolated = await createIsolatedOperatingCompany({
      codePrefix: "FBO",
      legalNamePrefix: "FactBal Other",
      label: "factbal-other",
    });
    otherCompanyId = otherIsolated.companyId;

    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");

    // Confirm additive view from HOLD migration is present on CI migrated DB.
    const viewOk = await db.query(
      `SELECT to_regclass('views.factoring_balance_invoice_linkage') IS NOT NULL AS ok`
    );
    if (!viewOk.rows[0]?.ok) {
      throw new Error(
        "views.factoring_balance_invoice_linkage missing — migration 202607600000 must apply in CI"
      );
    }

    await bypass(companyId, async () => {
      await db.query(
        `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type) VALUES ($1::uuid,$2::uuid,$3,'Other')`,
        [vendorId, companyId, `Faro FBL ${suffix}`]
      );
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`,
        [customerId, companyId, `FBL Cust ${suffix}`]
      );

      // Multi-invoice advance (open liability) — $10,000 face, $150 reserve (1.5%).
      // TWO invoices linked: fanout would double liability if JOIN-summed.
      await db.query(
        `INSERT INTO accounting.factoring_advances
           (id, operating_company_id, factoring_company_vendor_id, display_id, status,
            invoice_total_cents, advance_rate_pct, advance_amount_cents, reserve_pct, reserve_amount_cents,
            factor_fee_pct, factor_fee_cents, advanced_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'advanced',1000000,97,970000,1.5,15000,1.5,15000,now())`,
        [multiAdvanceId, companyId, vendorId, `FA-FBL-${n()}`]
      );
      await db.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date,
            subtotal_cents, tax_cents, total_cents, status, factoring_advance_id, factoring_status)
         VALUES
           ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,600000,0,600000,'factored',$5::uuid,'advanced'),
           ($6::uuid,$2::uuid,$3::uuid,$7,CURRENT_DATE,CURRENT_DATE,400000,0,400000,'factored',$5::uuid,'advanced')`,
        [invA, companyId, customerId, `INV-FBL-${n()}`, multiAdvanceId, invB, `INV-FBL-${n()}`]
      );

      // Settled by collection (reserve_held) — liability relieved; reserve still receivable.
      await db.query(
        `INSERT INTO accounting.factoring_advances
           (id, operating_company_id, factoring_company_vendor_id, display_id, status,
            invoice_total_cents, advance_rate_pct, advance_amount_cents, reserve_pct, reserve_amount_cents,
            factor_fee_pct, factor_fee_cents, advanced_at, collected_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'reserve_held',500000,97,485000,1.5,7500,1.5,7500,now(),now())`,
        [settledAdvanceId, companyId, vendorId, `FA-FBL-${n()}`]
      );
      await db.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date,
            subtotal_cents, tax_cents, total_cents, status, factoring_advance_id, factoring_status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,500000,0,500000,'paid',$5::uuid,'reserve_held')`,
        [invSettled, companyId, customerId, `INV-FBL-${n()}`, settledAdvanceId]
      );

      // Recourse buyback — liability relieved via buyback path.
      await db.query(
        `INSERT INTO accounting.factoring_advances
           (id, operating_company_id, factoring_company_vendor_id, display_id, status,
            invoice_total_cents, advance_rate_pct, advance_amount_cents, reserve_pct, reserve_amount_cents,
            factor_fee_pct, factor_fee_cents, advanced_at, recourse_returned_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'recourse_returned',200000,97,194000,1.5,3000,1.5,3000,now(),now())`,
        [recourseAdvanceId, companyId, vendorId, `FA-FBL-${n()}`]
      );
      await db.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date,
            subtotal_cents, tax_cents, total_cents, status, factoring_advance_id, factoring_status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,200000,0,200000,'factored',$5::uuid,'recourse_returned')`,
        [invRecourse, companyId, customerId, `INV-FBL-${n()}`, recourseAdvanceId]
      );

      // Voided advance — excluded entirely.
      await db.query(
        `INSERT INTO accounting.factoring_advances
           (id, operating_company_id, factoring_company_vendor_id, display_id, status,
            invoice_total_cents, advance_rate_pct, advance_amount_cents, reserve_pct, reserve_amount_cents,
            factor_fee_pct, factor_fee_cents, advanced_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'voided',999999,97,970000,1.5,15000,1.5,15000,now())`,
        [voidedAdvanceId, companyId, vendorId, `FA-FBL-${n()}`]
      );
      await db.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date,
            subtotal_cents, tax_cents, total_cents, status, factoring_advance_id, factoring_status, voided_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,999999,0,999999,'void',$5::uuid,'advanced',now())`,
        [invVoidedAdv, companyId, customerId, `INV-FBL-${n()}`, voidedAdvanceId]
      );

      // Voided invoice on open advance — excluded from invoice_count only.
      await db.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date,
            subtotal_cents, tax_cents, total_cents, status, factoring_advance_id, factoring_status, voided_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,1,0,1,'void',$5::uuid,'advanced',now())`,
        [invVoidedInvoice, companyId, customerId, `INV-FBL-${n()}`, multiAdvanceId]
      );

      // Third live invoice on multi advance for COUNT DISTINCT (invC) — still same advance money.
      await db.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date,
            subtotal_cents, tax_cents, total_cents, status, factoring_advance_id, factoring_status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,0,0,0,'factored',$5::uuid,'advanced')`,
        [invC, companyId, customerId, `INV-FBL-${n()}`, multiAdvanceId]
      );
    });

    await bypass(otherCompanyId!, async () => {
      await db.query(
        `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type) VALUES ($1::uuid,$2::uuid,$3,'Other')`,
        [otherVendorId, otherCompanyId, `Faro FBO ${suffix}`]
      );
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`,
        [otherCustomerId, otherCompanyId, `FBO Cust ${suffix}`]
      );
      await db.query(
        `INSERT INTO accounting.factoring_advances
           (id, operating_company_id, factoring_company_vendor_id, display_id, status,
            invoice_total_cents, advance_rate_pct, advance_amount_cents, reserve_pct, reserve_amount_cents,
            factor_fee_pct, factor_fee_cents, advanced_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'advanced',7777777,97,7500000,1.5,116666,1.5,116666,now())`,
        [otherCompanyAdvanceId, otherCompanyId, otherVendorId, `FA-FBO-${n()}`]
      );
      await db.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date,
            subtotal_cents, tax_cents, total_cents, status, factoring_advance_id, factoring_status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,7777777,0,7777777,'factored',$5::uuid,'advanced')`,
        [invOther, otherCompanyId, otherCustomerId, `INV-FBO-${n()}`, otherCompanyAdvanceId]
      );
    });
  }, 120_000);

  afterAll(async () => {
    // void-not-delete: mark advances voided (DELETE revoked on factoring_advances). Companies deactivated below.
    if (db) {
      try {
        await bypass(companyId, async () => {
          await db.query(
            `UPDATE accounting.factoring_advances SET status = 'voided' WHERE id = ANY($1::uuid[])`,
            [[multiAdvanceId, settledAdvanceId, recourseAdvanceId, voidedAdvanceId]]
          );
          await db.query(
            `UPDATE accounting.invoices SET voided_at = COALESCE(voided_at, now()), status = 'void'
             WHERE id = ANY($1::uuid[])`,
            [[invA, invB, invC, invSettled, invRecourse, invVoidedAdv, invVoidedInvoice]]
          );
        });
        if (otherCompanyId) {
          await bypass(otherCompanyId, async () => {
            await db.query(`UPDATE accounting.factoring_advances SET status = 'voided' WHERE id = $1::uuid`, [
              otherCompanyAdvanceId,
            ]);
            await db.query(
              `UPDATE accounting.invoices SET voided_at = COALESCE(voided_at, now()), status = 'void' WHERE id = $1::uuid`,
              [invOther]
            );
          });
        }
      } catch {
        /* best-effort cleanup */
      }
      await db.end().catch(() => {});
    }
    if (isolated) await deactivateIsolatedOperatingCompany(isolated).catch(() => {});
    if (otherIsolated) await deactivateIsolatedOperatingCompany(otherIsolated).catch(() => {});
  });

  it("multi-invoice: liability not multiplied; COUNT(DISTINCT invoice.id); reserve separate", async () => {
    const client = await scopedClient();
    const result = await computeFactoringBalanceInvoiceLinkage(client, { operatingCompanyId: companyId });
    expect(result.status).toBe("ok");
    // Funded = 1_000_000 (multi) + 500_000 (settled) + 200_000 (recourse) = 1_700_000
    // Settled = 500_000; Recourse = 200_000 → outstanding = 1_000_000 (multi only)
    // Voided advance excluded.
    expect(result.outstanding_liability_cents).toBe(1_000_000);
    // Reserve: multi 15_000 + settled(reserve_held) 7_500 + recourse 0 = 22_500
    expect(result.reserve_receivable_cents).toBe(22_500);
    // Invoices: invA, invB, invC, invSettled, invRecourse = 5 (voided invoices excluded)
    expect(result.invoice_count).toBe(5);
    // Fanout proof: 1_000_000 * 3 invoices would be 3_000_000 if JOIN-summed — must not.
    expect(result.outstanding_liability_cents).not.toBe(3_000_000);
    expect(result.outstanding_liability_cents).not.toBe(
      (result.outstanding_liability_cents ?? 0) + (result.reserve_receivable_cents ?? 0)
    );
  });

  it("cross-company isolation: other company liability never leaks", async () => {
    const client = await scopedClient();
    const result = await computeFactoringBalanceInvoiceLinkage(client, { operatingCompanyId: companyId });
    expect(result.outstanding_liability_cents).not.toBe(7_777_777);
    expect(result.outstanding_liability_cents).toBe(1_000_000);

    await db.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [otherCompanyId]);
    const other = await computeFactoringBalanceInvoiceLinkage(db, {
      operatingCompanyId: otherCompanyId!,
    });
    expect(other.outstanding_liability_cents).toBe(7_777_777);
    expect(other.invoice_count).toBe(1);
  });

  it("empty: company with no funded advances returns status empty (distinct from unverifiable)", async () => {
    const emptyIsolated = await createIsolatedOperatingCompany({
      codePrefix: "FBE",
      legalNamePrefix: "FactBal Empty",
      label: "factbal-empty",
    });
    try {
      await db.query(`SELECT set_config('app.bypass_rls', '', false)`);
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [
        emptyIsolated.companyId,
      ]);
      const result = await computeFactoringBalanceInvoiceLinkage(db, {
        operatingCompanyId: emptyIsolated.companyId,
      });
      expect(result.status).toBe("empty");
      expect(result.outstanding_liability_cents).toBe(0);
      expect(result.reserve_receivable_cents).toBe(0);
      expect(result.invoice_count).toBe(0);
      expect(result.unverifiable_reason).toBeNull();
    } finally {
      await deactivateIsolatedOperatingCompany(emptyIsolated).catch(() => {});
    }
  });

  it("planted query failure: view SELECT error propagates (no silent zero)", async () => {
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        if (sql.includes("to_regclass")) {
          return { rows: [{ advances_ok: true, invoices_ok: true, view_ok: true }] };
        }
        if (sql.includes("table_name = 'factoring_advances'")) {
          return {
            rows: [
              "id",
              "operating_company_id",
              "status",
              "invoice_total_cents",
              "reserve_amount_cents",
              "release_amount_cents",
              "advanced_at",
            ].map((column_name) => ({ column_name })),
          };
        }
        if (sql.includes("table_name = 'invoices'")) {
          return {
            rows: ["id", "operating_company_id", "factoring_advance_id", "voided_at"].map((column_name) => ({
              column_name,
            })),
          };
        }
        if (sql.includes("FROM views.factoring_balance_invoice_linkage")) {
          throw new Error("planted_query_failure");
        }
        return db.query(sql, values);
      },
    };
    await expect(
      computeFactoringBalanceInvoiceLinkage(client, { operatingCompanyId: companyId })
    ).rejects.toThrow(/planted_query_failure/);
  });

  it("FORCE RLS: factoring_advances relforcerowsecurity = true after migration", async () => {
    const rls = await db.query<{ forced: boolean }>(
      `
        SELECT c.relforcerowsecurity AS forced
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'accounting' AND c.relname = 'factoring_advances'
      `
    );
    expect(rls.rows[0]?.forced).toBe(true);
  });
});
