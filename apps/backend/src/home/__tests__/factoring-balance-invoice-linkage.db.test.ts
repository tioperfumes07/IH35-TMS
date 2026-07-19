/**
 * 0280-05 factoring-balance-invoice-linkage — real Postgres behavioral coverage.
 * Runs only in CI (GITHUB_ACTIONS=true) with a migrated DB.
 *
 * Covers: multi-invoice (no fanout), status-without-artifact must NOT clear liability,
 * reserve release only via JE, recourse_returned alone must NOT zero reserve,
 * cross-company isolation, Faro identity fail-closed, empty, planted query failure,
 * FORCE RLS + Owner/Admin write policies, canonical invoice display_id contract.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/isolated-company.js";
import {
  computeFactoringBalanceInvoiceLinkage,
  isCanonicalInvoiceDisplayId,
  INVOICE_DISPLAY_ID_RE,
} from "../factoring-balance-invoice-linkage.service.js";

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

  const liabAcct = randomUUID();
  const reserveAcct = randomUUID();
  const cashAcct = randomUUID();
  const arAcct = randomUUID();
  const recoursedAcct = randomUUID();

  const multiAdvanceId = randomUUID();
  const settledAdvanceId = randomUUID();
  const recourseAdvanceId = randomUUID();
  const statusOnlyAdvanceId = randomUUID();
  const voidedAdvanceId = randomUUID();
  const otherCompanyAdvanceId = randomUUID();

  const invA = randomUUID();
  const invB = randomUUID();
  const invC = randomUUID();
  const invSettled = randomUUID();
  const invRecourse = randomUUID();
  const invStatusOnly = randomUUID();
  const invVoidedAdv = randomUUID();
  const invVoidedInvoice = randomUUID();
  const invOther = randomUUID();

  const fundingJeMulti = randomUUID();
  const fundingJeSettled = randomUUID();
  const fundingJeRecourse = randomUUID();
  const fundingJeStatusOnly = randomUUID();
  const paymentJeSettled = randomUUID();
  const chargebackJeRecourse = randomUUID();
  const reserveReleaseJe = randomUUID();

  let invoiceSeq = 10_000 + Math.floor(Math.random() * 40_000);
  const canonicalInvoiceDisplayId = (): string => {
    invoiceSeq += 1;
    const id = `INV-2026-${String(invoiceSeq).padStart(5, "0")}`;
    if (!isCanonicalInvoiceDisplayId(id)) {
      throw new Error(`fixture contract: malformed invoice display_id ${id}`);
    }
    return id;
  };
  const n = () => String(Math.floor(10_000 + Math.random() * 89_999));
  const displayIds = {
    invA: canonicalInvoiceDisplayId(),
    invB: canonicalInvoiceDisplayId(),
    invC: canonicalInvoiceDisplayId(),
    invSettled: canonicalInvoiceDisplayId(),
    invRecourse: canonicalInvoiceDisplayId(),
    invStatusOnly: canonicalInvoiceDisplayId(),
    invVoidedAdv: canonicalInvoiceDisplayId(),
    invVoidedInvoice: canonicalInvoiceDisplayId(),
    invOther: canonicalInvoiceDisplayId(),
  };

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

  async function scopedClient(opco: string = companyId): Promise<pg.Client> {
    // Match withCompanyScope: clear bypass, set opco + Owner user so
    // org.user_accessible_company_ids() includes the isolated company (customers/vendors RLS).
    await db.query(`SELECT set_config('app.bypass_rls', '', false)`);
    await db.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [opco]);
    await db.query(`SELECT set_config('app.current_user_id', $1::text, false)`, [TEST_OWNER_USER_ID]);
    return db;
  }

  async function seedRoles(opco: string) {
    await db.query(
      `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
       VALUES
         ($1::uuid,$6::uuid,'2150','Factoring Advance','Liability',true),
         ($2::uuid,$6::uuid,'1230','Factoring Reserves','Asset',true),
         ($3::uuid,$6::uuid,'1000','Cash','Asset',true),
         ($4::uuid,$6::uuid,'1100','A/R','Asset',true),
         ($5::uuid,$6::uuid,'1105','Factoring Recoursed','Asset',true)`,
      [liabAcct, reserveAcct, cashAcct, arAcct, recoursedAcct, opco]
    );
    for (const [role, acct] of [
      ["factoring_advance_liability", liabAcct],
      ["factor_reserve_held", reserveAcct],
      ["cash_clearing", cashAcct],
      ["ar_control", arAcct],
      ["factoring_recoursed_ar", recoursedAcct],
    ] as const) {
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles
           (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid,$2,$3::uuid,true)`,
        [opco, role, acct]
      );
    }
  }

  async function insertBalancedJe(opts: {
    jeId: string;
    opco: string;
    memo: string;
    lines: Array<{
      accountId: string;
      side: "debit" | "credit";
      cents: number;
      sourceAdvanceId?: string;
      seq: number;
    }>;
  }) {
    await db.query(
      `INSERT INTO accounting.journal_entries
         (id, operating_company_id, entry_date, memo, status, source)
       VALUES ($1::uuid,$2::uuid,CURRENT_DATE,$3,'posted','auto')`,
      [opts.jeId, opts.opco, opts.memo]
    );
    for (const line of opts.lines) {
      await db.query(
        `INSERT INTO accounting.journal_entry_postings
           (operating_company_id, journal_entry_uuid, line_sequence, account_id,
            debit_or_credit, amount_cents, description,
            source_transaction_type, source_transaction_id, idempotency_key)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5,$6,$7,$8,$9,$10)`,
        [
          opts.opco,
          opts.jeId,
          line.seq,
          line.accountId,
          line.side,
          line.cents,
          opts.memo,
          line.sourceAdvanceId ? "factoring_advance" : null,
          line.sourceAdvanceId ?? null,
          `${opts.jeId}:${line.seq}`,
        ]
      );
    }
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    // TRANSP prefix satisfies Faro contract entity gate (no hard-coded UUID).
    isolated = await createIsolatedOperatingCompany({
      codePrefix: "TRANSP",
      legalNamePrefix: "IH 35 TRANSPORTATION FactBal",
      label: "factbal-primary",
    });
    companyId = isolated.companyId;
    otherIsolated = await createIsolatedOperatingCompany({
      codePrefix: "USMCA",
      legalNamePrefix: "USMCA Other Factor",
      label: "factbal-other",
    });
    otherCompanyId = otherIsolated.companyId;

    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");

    const viewOk = await db.query(
      `SELECT to_regclass('views.factoring_balance_invoice_linkage') IS NOT NULL AS ok`
    );
    if (!viewOk.rows[0]?.ok) {
      throw new Error(
        "views.factoring_balance_invoice_linkage missing — migration 202607600000 must apply in CI"
      );
    }

    await bypass(companyId, async () => {
      await seedRoles(companyId);
      await db.query(
        `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type)
         VALUES ($1::uuid,$2::uuid,$3,'Other')`,
        [vendorId, companyId, `Faro Factoring LLC ${suffix}`]
      );
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name, factoring_company_vendor_id)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid)`,
        [customerId, companyId, `FBL Cust ${suffix}`, vendorId]
      );

      // Multi-invoice open liability: $10,000 face, $150 reserve — TWO invoices (fanout ban).
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
        [invA, companyId, customerId, displayIds.invA, multiAdvanceId, invB, displayIds.invB]
      );
      await insertBalancedJe({
        jeId: fundingJeMulti,
        opco: companyId,
        memo: `Factoring funding FA-multi`,
        lines: [
          { accountId: cashAcct, side: "debit", cents: 985000, sourceAdvanceId: multiAdvanceId, seq: 1 },
          { accountId: reserveAcct, side: "debit", cents: 15000, sourceAdvanceId: multiAdvanceId, seq: 2 },
          { accountId: liabAcct, side: "credit", cents: 1000000, sourceAdvanceId: multiAdvanceId, seq: 3 },
        ],
      });

      // Settled via customer-payment JE (status also reserve_held — status alone insufficient).
      await db.query(
        `INSERT INTO accounting.factoring_advances
           (id, operating_company_id, factoring_company_vendor_id, display_id, status,
            invoice_total_cents, advance_rate_pct, advance_amount_cents, reserve_pct, reserve_amount_cents,
            factor_fee_pct, factor_fee_cents, advanced_at, collected_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'reserve_held',500000,97,485000,1.5,7500,1.5,7500,now(),now())`,
        [settledAdvanceId, companyId, vendorId, `FA-SET-${n()}`]
      );
      await db.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date,
            subtotal_cents, tax_cents, total_cents, status, factoring_advance_id, factoring_status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,500000,0,500000,'paid',$5::uuid,'reserve_held')`,
        [invSettled, companyId, customerId, displayIds.invSettled, settledAdvanceId]
      );
      await insertBalancedJe({
        jeId: fundingJeSettled,
        opco: companyId,
        memo: `Factoring funding settled`,
        lines: [
          { accountId: cashAcct, side: "debit", cents: 492500, sourceAdvanceId: settledAdvanceId, seq: 1 },
          { accountId: reserveAcct, side: "debit", cents: 7500, sourceAdvanceId: settledAdvanceId, seq: 2 },
          { accountId: liabAcct, side: "credit", cents: 500000, sourceAdvanceId: settledAdvanceId, seq: 3 },
        ],
      });
      await insertBalancedJe({
        jeId: paymentJeSettled,
        opco: companyId,
        memo: `Factoring customer payment settled`,
        lines: [
          { accountId: liabAcct, side: "debit", cents: 500000, sourceAdvanceId: settledAdvanceId, seq: 1 },
          { accountId: arAcct, side: "credit", cents: 500000, sourceAdvanceId: settledAdvanceId, seq: 2 },
        ],
      });
      // Reserve release JE for settled advance (structural reserve reduction).
      await insertBalancedJe({
        jeId: reserveReleaseJe,
        opco: companyId,
        memo: `Factoring reserve release settled`,
        lines: [
          { accountId: cashAcct, side: "debit", cents: 7500, sourceAdvanceId: settledAdvanceId, seq: 1 },
          { accountId: reserveAcct, side: "credit", cents: 7500, sourceAdvanceId: settledAdvanceId, seq: 2 },
        ],
      });

      // Recourse: status recourse_returned + chargeback JE with recoursed_ar leg.
      await db.query(
        `INSERT INTO accounting.factoring_advances
           (id, operating_company_id, factoring_company_vendor_id, display_id, status,
            invoice_total_cents, advance_rate_pct, advance_amount_cents, reserve_pct, reserve_amount_cents,
            factor_fee_pct, factor_fee_cents, advanced_at, recourse_returned_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'recourse_returned',200000,97,194000,1.5,3000,1.5,3000,now(),now())`,
        [recourseAdvanceId, companyId, vendorId, `FA-REC-${n()}`]
      );
      await db.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date,
            subtotal_cents, tax_cents, total_cents, status, factoring_advance_id, factoring_status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,200000,0,200000,'factored',$5::uuid,'recourse_returned')`,
        [invRecourse, companyId, customerId, displayIds.invRecourse, recourseAdvanceId]
      );
      await insertBalancedJe({
        jeId: fundingJeRecourse,
        opco: companyId,
        memo: `Factoring funding recourse`,
        lines: [
          { accountId: cashAcct, side: "debit", cents: 197000, sourceAdvanceId: recourseAdvanceId, seq: 1 },
          { accountId: reserveAcct, side: "debit", cents: 3000, sourceAdvanceId: recourseAdvanceId, seq: 2 },
          { accountId: liabAcct, side: "credit", cents: 200000, sourceAdvanceId: recourseAdvanceId, seq: 3 },
        ],
      });
      await insertBalancedJe({
        jeId: chargebackJeRecourse,
        opco: companyId,
        memo: `Factoring chargeback recourse`,
        lines: [
          { accountId: liabAcct, side: "debit", cents: 200000, sourceAdvanceId: recourseAdvanceId, seq: 1 },
          { accountId: cashAcct, side: "credit", cents: 200000, sourceAdvanceId: recourseAdvanceId, seq: 2 },
          { accountId: recoursedAcct, side: "debit", cents: 200000, sourceAdvanceId: recourseAdvanceId, seq: 3 },
          { accountId: arAcct, side: "credit", cents: 200000, sourceAdvanceId: recourseAdvanceId, seq: 4 },
        ],
      });

      // Status-only "settled" WITHOUT payment JE — liability must remain.
      await db.query(
        `INSERT INTO accounting.factoring_advances
           (id, operating_company_id, factoring_company_vendor_id, display_id, status,
            invoice_total_cents, advance_rate_pct, advance_amount_cents, reserve_pct, reserve_amount_cents,
            factor_fee_pct, factor_fee_cents, advanced_at, collected_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'collected',300000,97,291000,1.5,4500,1.5,4500,now(),now())`,
        [statusOnlyAdvanceId, companyId, vendorId, `FA-STAT-${n()}`]
      );
      await db.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date,
            subtotal_cents, tax_cents, total_cents, status, factoring_advance_id, factoring_status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,300000,0,300000,'paid',$5::uuid,'collected')`,
        [invStatusOnly, companyId, customerId, displayIds.invStatusOnly, statusOnlyAdvanceId]
      );
      await insertBalancedJe({
        jeId: fundingJeStatusOnly,
        opco: companyId,
        memo: `Factoring funding status-only`,
        lines: [
          { accountId: cashAcct, side: "debit", cents: 295500, sourceAdvanceId: statusOnlyAdvanceId, seq: 1 },
          { accountId: reserveAcct, side: "debit", cents: 4500, sourceAdvanceId: statusOnlyAdvanceId, seq: 2 },
          { accountId: liabAcct, side: "credit", cents: 300000, sourceAdvanceId: statusOnlyAdvanceId, seq: 3 },
        ],
      });

      // Voided advance — excluded.
      await db.query(
        `INSERT INTO accounting.factoring_advances
           (id, operating_company_id, factoring_company_vendor_id, display_id, status,
            invoice_total_cents, advance_rate_pct, advance_amount_cents, reserve_pct, reserve_amount_cents,
            factor_fee_pct, factor_fee_cents, advanced_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'voided',999999,97,970000,1.5,15000,1.5,15000,now())`,
        [voidedAdvanceId, companyId, vendorId, `FA-VOID-${n()}`]
      );
      await db.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date,
            subtotal_cents, tax_cents, total_cents, status, factoring_advance_id, factoring_status, voided_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,999999,0,999999,'void',$5::uuid,'advanced',now())`,
        [invVoidedAdv, companyId, customerId, displayIds.invVoidedAdv, voidedAdvanceId]
      );

      await db.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date,
            subtotal_cents, tax_cents, total_cents, status, factoring_advance_id, factoring_status, voided_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,1,0,1,'void',$5::uuid,'advanced',now())`,
        [invVoidedInvoice, companyId, customerId, displayIds.invVoidedInvoice, multiAdvanceId]
      );

      await db.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date,
            subtotal_cents, tax_cents, total_cents, status, factoring_advance_id, factoring_status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,0,0,0,'factored',$5::uuid,'advanced')`,
        [invC, companyId, customerId, displayIds.invC, multiAdvanceId]
      );
    });

    await bypass(otherCompanyId!, async () => {
      await db.query(
        `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type)
         VALUES ($1::uuid,$2::uuid,$3,'Other')`,
        [otherVendorId, otherCompanyId, `RTS Factor ${suffix}`]
      );
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name, factoring_company_vendor_id)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid)`,
        [otherCustomerId, otherCompanyId, `Other Cust ${suffix}`, otherVendorId]
      );
      await db.query(
        `INSERT INTO accounting.factoring_advances
           (id, operating_company_id, factoring_company_vendor_id, display_id, status,
            invoice_total_cents, advance_rate_pct, advance_amount_cents, reserve_pct, reserve_amount_cents,
            factor_fee_pct, factor_fee_cents, advanced_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'advanced',7777777,97,7500000,1.5,116666,1.5,116666,now())`,
        [otherCompanyAdvanceId, otherCompanyId, otherVendorId, `FA-OTH-${n()}`]
      );
      await db.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date,
            subtotal_cents, tax_cents, total_cents, status, factoring_advance_id, factoring_status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,7777777,0,7777777,'factored',$5::uuid,'advanced')`,
        [invOther, otherCompanyId, otherCustomerId, displayIds.invOther, otherCompanyAdvanceId]
      );
    });
  }, 180_000);

  afterAll(async () => {
    if (db) {
      try {
        await bypass(companyId, async () => {
          await db.query(
            `UPDATE accounting.factoring_advances SET status = 'voided' WHERE id = ANY($1::uuid[])`,
            [
              [
                multiAdvanceId,
                settledAdvanceId,
                recourseAdvanceId,
                statusOnlyAdvanceId,
                voidedAdvanceId,
              ],
            ]
          );
          await db.query(
            `UPDATE accounting.invoices SET voided_at = COALESCE(voided_at, now()), status = 'void'
             WHERE id = ANY($1::uuid[])`,
            [
              [
                invA,
                invB,
                invC,
                invSettled,
                invRecourse,
                invStatusOnly,
                invVoidedAdv,
                invVoidedInvoice,
              ],
            ]
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
        /* best-effort */
      }
      await db.end().catch(() => {});
    }
    if (isolated) await deactivateIsolatedOperatingCompany(isolated).catch(() => {});
    if (otherIsolated) await deactivateIsolatedOperatingCompany(otherIsolated).catch(() => {});
  });

  it("fixture contract: all seeded invoice display_ids match invoices_display_id_check", () => {
    for (const [key, id] of Object.entries(displayIds)) {
      expect(id, key).toMatch(INVOICE_DISPLAY_ID_RE);
    }
    const letterSegment = ["INV", "FBL", n()].join("-");
    expect(INVOICE_DISPLAY_ID_RE.test(letterSegment)).toBe(false);
  });

  it("fixture contract: malformed invoice display_id fails invoices_display_id_check", async () => {
    const badId = randomUUID();
    const badDisplay = ["INV", "FBL", n()].join("-");
    expect(isCanonicalInvoiceDisplayId(badDisplay)).toBe(false);
    await expect(
      bypass(companyId, async () => {
        await db.query(
          `INSERT INTO accounting.invoices
             (id, operating_company_id, customer_id, display_id, issue_date, due_date,
              subtotal_cents, tax_cents, total_cents, status, factoring_advance_id, factoring_status)
           VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,1,0,1,'factored',$5::uuid,'advanced')`,
          [badId, companyId, customerId, badDisplay, multiAdvanceId]
        );
      })
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "invoices_display_id_check",
    });
  });

  it("multi-invoice: liability from JE artifacts; COUNT(DISTINCT); reserve separate; status alone does not clear", async () => {
    const client = await scopedClient();
    const result = await computeFactoringBalanceInvoiceLinkage(client, { operatingCompanyId: companyId });
    expect(
      { status: result.status, reason: result.unverifiable_reason, liab: result.outstanding_liability_cents },
      "factoring balance status"
    ).toMatchObject({ status: "ok", reason: null });
    // Funded credits: 1_000_000 + 500_000 + 200_000 + 300_000 = 2_000_000
    // Settled debits (no recoursed_ar on JE): 500_000
    // Recourse debits (JE with recoursed_ar): 200_000
    // Outstanding = 2_000_000 - 500_000 - 200_000 = 1_300_000 (multi + status-only)
    expect(result.outstanding_liability_cents).toBe(1_300_000);
    // Reserve held debits: 15_000 + 7_500 + 3_000 + 4_500 = 30_000; released credits: 7_500 → 22_500
    expect(result.reserve_receivable_cents).toBe(22_500);
    // Invoices: A,B,C,settled,recourse,statusOnly = 6 (voided excluded)
    expect(result.invoice_count).toBe(6);
    expect(result.outstanding_liability_cents).not.toBe(3_000_000);
    expect(result.outstanding_liability_cents).not.toBe(
      (result.outstanding_liability_cents ?? 0) + (result.reserve_receivable_cents ?? 0)
    );
    expect(result.meta.liability_from_status).toBe(false);
    expect(result.meta.reserve_from_status).toBe(false);
  });

  it("recourse_returned status alone must not zero reserve (reserve legs independent)", async () => {
    const client = await scopedClient();
    const result = await computeFactoringBalanceInvoiceLinkage(client, { operatingCompanyId: companyId });
    // Recourse advance still contributes its 3000 held reserve (no release JE for it).
    expect(result.reserve_receivable_cents).toBeGreaterThanOrEqual(3000);
    expect(result.reserve_receivable_cents).toBe(22_500);
  });

  it("cross-company: USMCA/non-Faro must not be labeled Faro liability; no leak into TRANSP", async () => {
    const client = await scopedClient();
    const result = await computeFactoringBalanceInvoiceLinkage(client, { operatingCompanyId: companyId });
    expect(result.outstanding_liability_cents).not.toBe(7_777_777);

    await scopedClient(otherCompanyId!);
    const other = await computeFactoringBalanceInvoiceLinkage(db, {
      operatingCompanyId: otherCompanyId!,
    });
    expect(other.status).toBe("unverifiable");
    expect(other.unverifiable_reason).toMatch(/faro_contract_entity_mismatch|active_factor_is_not_faro|faro_factor/);
    expect(other.outstanding_liability_cents).toBeNull();
  });

  it("empty: TRANSP+Faro identity with no advances/JEs returns empty (distinct from unverifiable)", async () => {
    const emptyIsolated = await createIsolatedOperatingCompany({
      codePrefix: "TRANSP",
      legalNamePrefix: "IH 35 TRANSPORTATION Empty",
      label: "factbal-empty",
    });
    const emptyVendor = randomUUID();
    const emptyCustomer = randomUUID();
    try {
      await bypass(emptyIsolated.companyId, async () => {
        await db.query(
          `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type)
           VALUES ($1::uuid,$2::uuid,'Faro Factoring Empty','Other')`,
          [emptyVendor, emptyIsolated.companyId]
        );
        await db.query(
          `INSERT INTO mdata.customers (id, operating_company_id, customer_name, factoring_company_vendor_id)
           VALUES ($1::uuid,$2::uuid,'Empty Cust',$3::uuid)`,
          [emptyCustomer, emptyIsolated.companyId, emptyVendor]
        );
        for (const [role, acct] of [
          ["factoring_advance_liability", liabAcct],
          ["factor_reserve_held", reserveAcct],
        ] as const) {
          // Bind empty company to NEW accounts (FK is per-company).
          const acctId = randomUUID();
          await db.query(
            `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
             VALUES ($1::uuid,$2::uuid,$3,$4,$5,true)`,
            [
              acctId,
              emptyIsolated.companyId,
              role === "factoring_advance_liability" ? "2150" : "1230",
              role,
              role === "factoring_advance_liability" ? "Liability" : "Asset",
            ]
          );
          await db.query(
            `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
             VALUES ($1::uuid,$2,$3::uuid,true)`,
            [emptyIsolated.companyId, role, acctId]
          );
        }
      });
      await scopedClient(emptyIsolated.companyId);
      const result = await computeFactoringBalanceInvoiceLinkage(db, {
        operatingCompanyId: emptyIsolated.companyId,
      });
      expect(
        { status: result.status, reason: result.unverifiable_reason },
        "empty company balance"
      ).toMatchObject({ status: "empty", reason: null });
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
          return {
            rows: [
              {
                advances_ok: true,
                invoices_ok: true,
                jep_ok: true,
                je_ok: true,
                roles_ok: true,
                view_ok: true,
              },
            ],
          };
        }
        if (sql.includes("FROM org.companies")) {
          return { rows: [{ code: "TRANSP-X", legal_name: "IH 35 TRANSPORTATION LLC" }] };
        }
        if (sql.includes("FROM mdata.vendors")) {
          return { rows: [{ id: vendorId, vendor_name: "Faro Factoring LLC" }] };
        }
        if (sql.includes("chart_of_accounts_roles")) {
          return {
            rows: [
              { role: "factoring_advance_liability", account_id: liabAcct },
              { role: "factor_reserve_held", account_id: reserveAcct },
            ],
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

  it("FORCE RLS: factoring_advances forced + Owner/Admin write policies + no DELETE grant", async () => {
    const rls = await db.query<{ forced: boolean }>(
      `
        SELECT c.relforcerowsecurity AS forced
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'accounting' AND c.relname = 'factoring_advances'
      `
    );
    expect(rls.rows[0]?.forced).toBe(true);

    const policies = await db.query<{ polname: string; cmd: string; qual: string | null; with_check: string | null }>(
      `
        SELECT p.polname, p.polcmd::text AS cmd,
               pg_get_expr(p.polqual, p.polrelid) AS qual,
               pg_get_expr(p.polwithcheck, p.polrelid) AS with_check
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'accounting' AND c.relname = 'factoring_advances'
      `
    );
    const names = policies.rows.map((r) => r.polname);
    expect(names).toContain("factoring_advances_entity_select");
    expect(names).toContain("factoring_advances_entity_insert");
    expect(names).toContain("factoring_advances_entity_update");
    const insertPol = policies.rows.find((r) => r.polname === "factoring_advances_entity_insert");
    expect(insertPol?.with_check ?? "").toMatch(/Owner/);
    expect(insertPol?.with_check ?? "").toMatch(/Administrator/);

    const del = await db.query<{ has_delete: boolean }>(
      `SELECT has_table_privilege('ih35_app', 'accounting.factoring_advances', 'DELETE') AS has_delete`
    );
    expect(del.rows[0]?.has_delete).toBe(false);
  });
});
