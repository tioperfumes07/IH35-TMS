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
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { companyBusinessDate } from "../../lib/company-business-date.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import {
  FARO_CANONICAL_AGREEMENT_TEST_LOCK_KEY,
  TEST_OWNER_USER_ID,
} from "../../../test-helpers/constants.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/isolated-company.js";
import {
  computeFactoringBalanceInvoiceLinkage,
  isCanonicalInvoiceDisplayId,
  INVOICE_DISPLAY_ID_RE,
  FARO_FULL_RECOURSE_AGREEMENT_CODE,
} from "../factoring-balance-invoice-linkage.service.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const FACTORING_BALANCE_MIGRATION = path.join(
  REPO_ROOT,
  "db/migrations/202607600000_factoring_balance_invoice_linkage.sql"
);

// Root-cause fix (CI red 9/9 during ~UTC 00:00-06:00, i.e. after ~7pm Central): the CI
// postgres:16-alpine service has no TZ set, so its session TimeZone defaults to UTC and
// bare `CURRENT_DATE` resolves to the UTC calendar date. The service under test (and the
// view's as-of boundary) key off `companyBusinessDate()` — the America/Chicago calendar
// date. Nightly, once UTC has rolled to "tomorrow" while Chicago is still "today", fixture
// rows dated via `CURRENT_DATE` land one day ahead of the Chicago as-of cutoff and get
// excluded from `live_je`, flipping every advance to missing-funding-artifact. Bind an
// explicit Chicago-business-date fixture date instead of relying on the DB session's
// (unspecified, environment-dependent) local calendar date.
const TODAY = companyBusinessDate();

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("0280-05 factoring-balance-invoice-linkage (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  let isolated: IsolatedOperatingCompany;
  let otherIsolated: IsolatedOperatingCompany | null = null;
  let otherCompanyId: string | null = null;
  const suffix = randomUUID().slice(0, 8);
  const vendorId = randomUUID();
  const factorProfileId = randomUUID();
  let faroAgreementId = randomUUID();
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

  async function seedOwnerFaroAgreement(opts: {
    opco: string;
    vendorId: string;
    profileId?: string;
    agreementId?: string;
    effectiveFrom?: string;
    effectiveTo?: string | null;
    profileReserveRate?: number;
    profileFeeRate?: number;
    profileRecourseDays?: number;
  }) {
    const profileId = opts.profileId ?? randomUUID();
    const agreementId = opts.agreementId ?? randomUUID();
    await db.query(
      `INSERT INTO factoring.factor (
         id, tenant_id, name, advance_rate, fee_rate, reserve_rate, recourse_days, active
       ) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,true)
       ON CONFLICT (id) DO NOTHING`,
      [
        profileId,
        opts.opco,
        `Faro Full Recourse ${suffix}-${profileId.slice(0, 6)}`,
        0.97,
        opts.profileFeeRate ?? 0.015,
        opts.profileReserveRate ?? 0.015,
        opts.profileRecourseDays ?? 95,
      ]
    );
    await db.query(
      `INSERT INTO factoring.canonical_factor_agreements (
         id, tenant_id, factor_profile_id, factor_vendor_id, agreement_code,
         effective_from, effective_to, is_full_recourse,
         fee_rate_tier1, fee_rate_tier2, reserve_rate,
         repurchase_term_days, grace_days, repurchase_deadline_days, default_interest_daily_rate
       ) VALUES (
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,
         $6::date,$7::date,true,
         0.0150,0.0200,0.0150,
         30,5,95,0.00067000
       )
       ON CONFLICT (tenant_id, factor_vendor_id, agreement_code, effective_from) DO NOTHING`,
      [
        agreementId,
        opts.opco,
        profileId,
        opts.vendorId,
        FARO_FULL_RECOURSE_AGREEMENT_CODE,
        opts.effectiveFrom ?? "2024-12-02",
        opts.effectiveTo ?? null,
      ]
    );
    return { profileId, agreementId };
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
    entryDate?: string;
    lines: Array<{
      accountId: string;
      side: "debit" | "credit";
      cents: number;
      sourceAdvanceId?: string;
      /** Authoritative lifecycle source — defaults to factoring_advance when sourceAdvanceId set. */
      sourceType?: string;
      seq: number;
    }>;
  }) {
    await db.query(
      `INSERT INTO accounting.journal_entries
         (id, operating_company_id, entry_date, memo, status, source)
       VALUES ($1::uuid,$2::uuid,$4::date,$3,'posted','auto')`,
      [opts.jeId, opts.opco, opts.memo, opts.entryDate ?? TODAY]
    );
    for (const line of opts.lines) {
      const sourceType = line.sourceAdvanceId
        ? (line.sourceType ?? "factoring_advance")
        : null;
      const posting = await db.query<{ id: string }>(
        `INSERT INTO accounting.journal_entry_postings
           (operating_company_id, journal_entry_uuid, line_sequence, account_id,
            debit_or_credit, amount_cents, description,
            source_transaction_type, source_transaction_id, idempotency_key)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5,$6,$7,$8,$9,$10)
         RETURNING id::text AS id`,
        [
          opts.opco,
          opts.jeId,
          line.seq,
          line.accountId,
          line.side,
          line.cents,
          opts.memo,
          sourceType,
          line.sourceAdvanceId ?? null,
          `${opts.jeId}:${line.seq}`,
        ]
      );
      if (line.sourceAdvanceId && posting.rows[0]?.id) {
        await db.query(
          `INSERT INTO accounting.transaction_source_links
             (operating_company_id, journal_entry_posting_id, linked_object_type, linked_object_id, relationship_role)
           VALUES ($1::uuid,$2::uuid,'factoring_advance',$3,$4)`,
          [opts.opco, posting.rows[0].id, line.sourceAdvanceId, sourceType]
        );
      }
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
    // Serialize vs chain-06-factoring-ar-tieout.db.test.ts (shared Faro agreement table family).
    await db.query("SELECT pg_advisory_lock($1::bigint)", [FARO_CANONICAL_AGREEMENT_TEST_LOCK_KEY]);

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
      await seedOwnerFaroAgreement({
        opco: companyId,
        vendorId,
        profileId: factorProfileId,
        agreementId: faroAgreementId,
      });
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
          {
            accountId: liabAcct,
            side: "debit",
            cents: 500000,
            sourceAdvanceId: settledAdvanceId,
            sourceType: "factoring_customer_payment",
            seq: 1,
          },
          {
            accountId: arAcct,
            side: "credit",
            cents: 500000,
            sourceAdvanceId: settledAdvanceId,
            sourceType: "factoring_customer_payment",
            seq: 2,
          },
        ],
      });
      // Reserve release JE for settled advance (structural reserve reduction).
      await insertBalancedJe({
        jeId: reserveReleaseJe,
        opco: companyId,
        memo: `Factoring reserve release settled`,
        lines: [
          {
            accountId: cashAcct,
            side: "debit",
            cents: 7500,
            sourceAdvanceId: settledAdvanceId,
            sourceType: "factoring_reserve_release",
            seq: 1,
          },
          {
            accountId: reserveAcct,
            side: "credit",
            cents: 7500,
            sourceAdvanceId: settledAdvanceId,
            sourceType: "factoring_reserve_release",
            seq: 2,
          },
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
      // Chargeback repay JE — classified by source_transaction_type=factoring_chargeback (NOT recoursed_ar co-occurrence).
      await insertBalancedJe({
        jeId: chargebackJeRecourse,
        opco: companyId,
        memo: `Factoring chargeback repay recourse`,
        lines: [
          {
            accountId: liabAcct,
            side: "debit",
            cents: 200000,
            sourceAdvanceId: recourseAdvanceId,
            sourceType: "factoring_chargeback",
            seq: 1,
          },
          {
            accountId: cashAcct,
            side: "credit",
            cents: 200000,
            sourceAdvanceId: recourseAdvanceId,
            sourceType: "factoring_chargeback",
            seq: 2,
          },
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
      await db
        .query("SELECT pg_advisory_unlock($1::bigint)", [FARO_CANONICAL_AGREEMENT_TEST_LOCK_KEY])
        .catch(() => {});
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
    expect(other.unverifiable_reason).toMatch(
      /faro_contract_entity_mismatch|missing_faro_agreement_binding|faro_agreement_not_effective/
    );
    expect(other.outstanding_liability_cents).toBeNull();
  });

  it("unbacked reserve_movements→empty JE must NOT satisfy funding completeness", async () => {
    const emptyJe = randomUUID();
    const bareAdvance = randomUUID();
    await bypass(companyId, async () => {
      await db.query(
        `INSERT INTO accounting.factoring_advances
           (id, operating_company_id, factoring_company_vendor_id, display_id, status,
            invoice_total_cents, advance_rate_pct, advance_amount_cents, reserve_pct, reserve_amount_cents,
            factor_fee_pct, factor_fee_cents, advanced_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'advanced',50000,97,48500,1.5,750,1.5,750,now())`,
        [bareAdvance, companyId, vendorId, `FA-BARE-${n()}`]
      );
      // Empty/unrelated JE (cash↔cash) with NO liability source legs.
      await db.query(
        `INSERT INTO accounting.journal_entries
           (id, operating_company_id, entry_date, memo, status, source)
         VALUES ($1::uuid,$2::uuid,$4::date,$3,'posted','auto')`,
        [emptyJe, companyId, `Empty JE for bare movement ${suffix}`, TODAY]
      );
      await db.query(
        `INSERT INTO accounting.journal_entry_postings
           (operating_company_id, journal_entry_uuid, line_sequence, account_id,
            debit_or_credit, amount_cents, description, idempotency_key)
         VALUES
           ($1::uuid,$2::uuid,1,$3::uuid,'debit',1,'noop',$5),
           ($1::uuid,$2::uuid,2,$4::uuid,'credit',1,'noop',$6)`,
        [companyId, emptyJe, cashAcct, arAcct, `${emptyJe}:1`, `${emptyJe}:2`]
      );
      await db.query(
        `INSERT INTO accounting.factoring_reserve_movements
           (operating_company_id, factoring_advance_id, movement_type, amount_cents, movement_date, journal_entry_id)
         VALUES ($1::uuid,$2::uuid,'held',750,CURRENT_DATE,$3::uuid)`,
        [companyId, bareAdvance, emptyJe]
      );
    });
    const client = await scopedClient();
    const result = await computeFactoringBalanceInvoiceLinkage(client, { operatingCompanyId: companyId });
    expect(result.status).toBe("unverifiable");
    expect(result.unverifiable_reason).toBe("incomplete_funding_je_artifacts");
    expect(result.outstanding_liability_cents).toBeNull();
    await bypass(companyId, async () => {
      await db.query(`UPDATE accounting.factoring_advances SET status = 'voided' WHERE id = $1::uuid`, [
        bareAdvance,
      ]);
      await db.query(
        `UPDATE accounting.journal_entries SET status = 'voided', voided_at = now() WHERE id = $1::uuid`,
        [emptyJe]
      );
    });
  });

  it("orphan/unrelated role-account JE → unverifiable (never ok); orphan cents in diagnostics only, not Faro headline", async () => {
    const orphanJe = randomUUID();
    await bypass(companyId, async () => {
      await insertBalancedJe({
        jeId: orphanJe,
        opco: companyId,
        memo: `Manual orphan liability ${suffix}`,
        lines: [
          { accountId: liabAcct, side: "credit", cents: 9_999_999, seq: 1 },
          { accountId: cashAcct, side: "debit", cents: 9_999_999, seq: 2 },
        ],
      });
    });
    const client = await scopedClient();
    const result = await computeFactoringBalanceInvoiceLinkage(client, { operatingCompanyId: companyId });
    expect(result.status).toBe("unverifiable");
    expect(result.unverifiable_reason).toBe("orphan_unattributed_liability_role_legs");
    expect(result.outstanding_liability_cents).toBeNull();
    expect(result.diagnostics?.orphan_liability_role_cents).toBeGreaterThanOrEqual(9_999_999);
    expect(result.diagnostics?.outstanding_liability_signed_cents).toBe(1_300_000);
    expect(result.diagnostics?.outstanding_liability_signed_cents).not.toBe(1_300_000 + 9_999_999);
    await bypass(companyId, async () => {
      await db.query(
        `UPDATE accounting.journal_entries SET status = 'voided', voided_at = now() WHERE id = $1::uuid`,
        [orphanJe]
      );
    });
  });

  it("voided advance with live unreverted liability JE → unverifiable (ledger artifacts decide debt)", async () => {
    // Mutate an EXISTING funded advance to voided WITHOUT reversing its JE — status alone must
    // not drop liability; read model fails closed (never status=ok with missing debt).
    try {
      await bypass(companyId, async () => {
        await db.query(`UPDATE accounting.factoring_advances SET status = 'voided' WHERE id = $1::uuid`, [
          statusOnlyAdvanceId,
        ]);
      });
      const client = await scopedClient();
      const result = await computeFactoringBalanceInvoiceLinkage(client, { operatingCompanyId: companyId });
      expect(result.status).toBe("unverifiable");
      expect(result.unverifiable_reason).toBe("voided_advance_without_reversing_je");
      expect(result.outstanding_liability_cents).toBeNull();
      // Liability legs remain in signed diagnostics (ledger artifacts decide debt).
      expect(result.diagnostics?.outstanding_liability_signed_cents).toBeGreaterThanOrEqual(1_300_000);
    } finally {
      await bypass(companyId, async () => {
        await db.query(`UPDATE accounting.factoring_advances SET status = 'advanced' WHERE id = $1::uuid`, [
          statusOnlyAdvanceId,
        ]);
      });
    }
  });

  it("future-dated posted JE excluded by companyBusinessDate as-of boundary", async () => {
    const futureJe = randomUUID();
    await bypass(companyId, async () => {
      // Extra liability credit on an EXISTING advance, dated far in the future — must not affect today.
      await insertBalancedJe({
        jeId: futureJe,
        opco: companyId,
        memo: `Factoring funding future ${suffix}`,
        entryDate: "2099-12-31",
        lines: [
          { accountId: cashAcct, side: "debit", cents: 888000, sourceAdvanceId: multiAdvanceId, seq: 1 },
          { accountId: liabAcct, side: "credit", cents: 888000, sourceAdvanceId: multiAdvanceId, seq: 2 },
        ],
      });
    });
    const client = await scopedClient();
    const result = await computeFactoringBalanceInvoiceLinkage(client, { operatingCompanyId: companyId });
    expect(result.status).toBe("ok");
    expect(result.outstanding_liability_cents).toBe(1_300_000);
    expect(result.outstanding_liability_cents).not.toBe(1_300_000 + 888_000);
    await bypass(companyId, async () => {
      await db.query(
        `UPDATE accounting.journal_entries SET status = 'voided', voided_at = now() WHERE id = $1::uuid`,
        [futureJe]
      );
    });
  });

  it("RTS customer alongside Faro agreement still scopes Faro vendor (never sole-factor Faro label)", async () => {
    const rtsVendor = randomUUID();
    const rtsCustomer = randomUUID();
    await bypass(companyId, async () => {
      await db.query(
        `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type)
         VALUES ($1::uuid,$2::uuid,$3,'Other')`,
        [rtsVendor, companyId, `RTS Transition Factor ${suffix}`]
      );
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name, factoring_company_vendor_id)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid)`,
        [rtsCustomer, companyId, `RTS Cust ${suffix}`, rtsVendor]
      );
    });
    const client = await scopedClient();
    const result = await computeFactoringBalanceInvoiceLinkage(client, { operatingCompanyId: companyId });
    // Owner-seeded Faro agreement is authoritative — RTS presence must NOT flip identity to mixed sole-factor.
    expect(result.status).toBe("ok");
    expect(result.meta.active_factor_vendor_id).toBe(vendorId);
    expect(result.meta.active_factor_vendor_id).not.toBe(rtsVendor);
    await bypass(companyId, async () => {
      await db.query(`DELETE FROM mdata.customers WHERE id = $1::uuid`, [rtsCustomer]);
      await db.query(`UPDATE mdata.vendors SET deactivated_at = now() WHERE id = $1::uuid`, [rtsVendor]);
    });
  });

  it("overlapping Faro agreement bindings → ambiguous_faro_agreement_binding", async () => {
    const secondAgreement = randomUUID();
    const secondProfile = randomUUID();
    try {
      await bypass(companyId, async () => {
        await seedOwnerFaroAgreement({
          opco: companyId,
          vendorId,
          profileId: secondProfile,
          agreementId: secondAgreement,
          effectiveFrom: "2025-01-01",
        });
      });
      const client = await scopedClient();
      const result = await computeFactoringBalanceInvoiceLinkage(client, {
        operatingCompanyId: companyId,
        asOfBusinessDate: "2026-07-19",
      });
      expect(result.status).toBe("unverifiable");
      expect(result.unverifiable_reason).toBe("ambiguous_faro_agreement_binding");
      expect(result.outstanding_liability_cents).toBeNull();
    } finally {
      // Void-not-delete: expire the second binding (DELETE revoked on agreement table).
      await bypass(companyId, async () => {
        await db.query(
          `UPDATE factoring.canonical_factor_agreements
              SET effective_to = '2025-01-01'
            WHERE id = $1::uuid`,
          [secondAgreement]
        );
        await db.query(`UPDATE factoring.factor SET active = false WHERE id = $1::uuid`, [secondProfile]);
      });
    }
  });

  it("debit liability anomaly → accounting_exception with signed diagnostics (never clamp to $0)", async () => {
    const overSettleJe = randomUUID();
    await bypass(companyId, async () => {
      await insertBalancedJe({
        jeId: overSettleJe,
        opco: companyId,
        memo: `Over-settle anomaly ${suffix}`,
        lines: [
          {
            accountId: liabAcct,
            side: "debit",
            cents: 5_000_000,
            sourceAdvanceId: multiAdvanceId,
            sourceType: "factoring_customer_payment",
            seq: 1,
          },
          {
            accountId: arAcct,
            side: "credit",
            cents: 5_000_000,
            sourceAdvanceId: multiAdvanceId,
            sourceType: "factoring_customer_payment",
            seq: 2,
          },
        ],
      });
    });
    const client = await scopedClient();
    const result = await computeFactoringBalanceInvoiceLinkage(client, { operatingCompanyId: companyId });
    expect(result.status).toBe("accounting_exception");
    expect(result.unverifiable_reason).toBe("accounting_exception:debit_liability_anomaly");
    expect(result.outstanding_liability_cents).toBeNull();
    expect(result.diagnostics?.outstanding_liability_signed_cents).toBeLessThan(0);
    // Cleanup over-settle so later tests are not poisoned.
    await bypass(companyId, async () => {
      await db.query(`UPDATE accounting.journal_entries SET status = 'voided', voided_at = now() WHERE id = $1::uuid`, [
        overSettleJe,
      ]);
    });
  });

  it("reserve over-release → accounting_exception with signed diagnostics", async () => {
    const overReleaseJe = randomUUID();
    await bypass(companyId, async () => {
      await insertBalancedJe({
        jeId: overReleaseJe,
        opco: companyId,
        memo: `Over-release reserve ${suffix}`,
        lines: [
          {
            accountId: cashAcct,
            side: "debit",
            cents: 100_000,
            sourceAdvanceId: multiAdvanceId,
            sourceType: "factoring_reserve_release",
            seq: 1,
          },
          {
            accountId: reserveAcct,
            side: "credit",
            cents: 100_000,
            sourceAdvanceId: multiAdvanceId,
            sourceType: "factoring_reserve_release",
            seq: 2,
          },
        ],
      });
    });
    const client = await scopedClient();
    const result = await computeFactoringBalanceInvoiceLinkage(client, { operatingCompanyId: companyId });
    expect(result.status).toBe("accounting_exception");
    expect(result.unverifiable_reason).toBe("accounting_exception:reserve_over_release");
    expect(result.reserve_receivable_cents).toBeNull();
    expect(result.diagnostics?.reserve_receivable_signed_cents).toBeLessThan(0);
    await bypass(companyId, async () => {
      await db.query(`UPDATE accounting.journal_entries SET status = 'voided', voided_at = now() WHERE id = $1::uuid`, [
        overReleaseJe,
      ]);
    });
  });

  it("FORCE RLS write: Owner authorized INSERT; unauthorized role blocked; cross-company isolation", async () => {
    const dispatcherId = randomUUID();
    const ownerAdv = randomUUID();
    const blockedAdv = randomUUID();
    const crossAdv = randomUUID();
    await bypass(companyId, async () => {
      await db.query(
        `INSERT INTO identity.users (id, email, google_user_id, role, preferred_language, default_company_id)
         VALUES ($1::uuid,$2,$3,'Dispatcher','en',$4::uuid)
         ON CONFLICT (id) DO UPDATE SET role = 'Dispatcher', deactivated_at = NULL`,
        [dispatcherId, `dispatcher-fbl-${suffix}@example.com`, `google-fbl-${suffix}`, companyId]
      );
    });

    // Owner (TEST_OWNER_USER_ID) can INSERT under entity scope.
    await db.query(`SELECT set_config('app.bypass_rls', '', false)`);
    await db.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [companyId]);
    await db.query(`SELECT set_config('app.current_user_id', $1::text, false)`, [TEST_OWNER_USER_ID]);
    await db.query(
      `INSERT INTO accounting.factoring_advances
         (id, operating_company_id, factoring_company_vendor_id, display_id, status,
          invoice_total_cents, advance_rate_pct, advance_amount_cents, reserve_pct, reserve_amount_cents,
          factor_fee_pct, factor_fee_cents, advanced_at)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'advanced',100,97,97,1.5,2,1.5,1,now())`,
      [ownerAdv, companyId, vendorId, `FA-OWN-${n()}`]
    );

    // Dispatcher blocked by role gate.
    await db.query(`SELECT set_config('app.current_user_id', $1::text, false)`, [dispatcherId]);
    await expect(
      db.query(
        `INSERT INTO accounting.factoring_advances
           (id, operating_company_id, factoring_company_vendor_id, display_id, status,
            invoice_total_cents, advance_rate_pct, advance_amount_cents, reserve_pct, reserve_amount_cents,
            factor_fee_pct, factor_fee_cents, advanced_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'advanced',100,97,97,1.5,2,1.5,1,now())`,
        [blockedAdv, companyId, vendorId, `FA-BLK-${n()}`]
      )
    ).rejects.toThrow();

    // Cross-company: Owner scoped to companyId cannot insert into otherCompanyId.
    await db.query(`SELECT set_config('app.current_user_id', $1::text, false)`, [TEST_OWNER_USER_ID]);
    await db.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [companyId]);
    await expect(
      db.query(
        `INSERT INTO accounting.factoring_advances
           (id, operating_company_id, factoring_company_vendor_id, display_id, status,
            invoice_total_cents, advance_rate_pct, advance_amount_cents, reserve_pct, reserve_amount_cents,
            factor_fee_pct, factor_fee_cents, advanced_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'advanced',100,97,97,1.5,2,1.5,1,now())`,
        [crossAdv, otherCompanyId, otherVendorId, `FA-XCO-${n()}`]
      )
    ).rejects.toThrow();

    await bypass(companyId, async () => {
      await db.query(`UPDATE accounting.factoring_advances SET status = 'voided' WHERE id = $1::uuid`, [ownerAdv]);
      await db.query(`UPDATE identity.users SET deactivated_at = now() WHERE id = $1::uuid`, [dispatcherId]);
    });
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
        await seedOwnerFaroAgreement({
          opco: emptyIsolated.companyId,
          vendorId: emptyVendor,
        });
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
        if (sql.includes("to_regclass") && sql.includes("advances_ok")) {
          return {
            rows: [
              {
                advances_ok: true,
                invoices_ok: true,
                jep_ok: true,
                je_ok: true,
                roles_ok: true,
                view_ok: true,
                agreements_ok: true,
                factor_ok: true,
              },
            ],
          };
        }
        if (sql.includes("FROM org.companies")) {
          return { rows: [{ code: "TRANSP-X", legal_name: "IH 35 TRANSPORTATION LLC" }] };
        }
        if (sql.includes("FROM factoring.canonical_factor_agreements a")) {
          return {
            rows: [
              {
                agreement_id: faroAgreementId,
                factor_profile_id: factorProfileId,
                factor_vendor_id: vendorId,
                vendor_name: "Faro Factoring LLC",
                is_full_recourse: true,
                fee_rate_tier1: "0.015",
                fee_rate_tier2: "0.02",
                reserve_rate: "0.015",
                repurchase_term_days: 30,
                grace_days: 5,
                repurchase_deadline_days: 95,
                default_interest_daily_rate: "0.00067",
                profile_fee_rate: "0.015",
                profile_reserve_rate: "0.015",
                profile_recourse_days: 95,
                profile_active: true,
              },
            ],
          };
        }
        if (sql.includes("to_regclass('factoring.canonical_factor_agreements')")) {
          return { rows: [{ ok: true }] };
        }
        if (sql.includes("set_config('app.factoring_balance_as_of'")) {
          return { rows: [{ set_config: "2026-07-19" }] };
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

  it("RTS-only TRANSP company without owner-seeded Faro agreement → missing_faro_agreement_binding", async () => {
    const rtsOnly = await createIsolatedOperatingCompany({
      codePrefix: "TRANSP",
      legalNamePrefix: "IH 35 TRANSPORTATION RTS Only",
      label: "factbal-rts-only",
    });
    const rtsVendor = randomUUID();
    try {
      await bypass(rtsOnly.companyId, async () => {
        await db.query(
          `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type)
           VALUES ($1::uuid,$2::uuid,'RTS Financial Only','Other')`,
          [rtsVendor, rtsOnly.companyId]
        );
        await db.query(
          `INSERT INTO mdata.customers (id, operating_company_id, customer_name, factoring_company_vendor_id)
           VALUES ($1::uuid,$2::uuid,'RTS Cust',$3::uuid)`,
          [randomUUID(), rtsOnly.companyId, rtsVendor]
        );
      });
      await scopedClient(rtsOnly.companyId);
      const result = await computeFactoringBalanceInvoiceLinkage(db, {
        operatingCompanyId: rtsOnly.companyId,
        asOfBusinessDate: "2026-07-19",
      });
      expect(result.status).toBe("unverifiable");
      expect(result.unverifiable_reason).toBe("missing_faro_agreement_binding");
      expect(result.meta.active_factor_vendor_id).toBeNull();
      expect(result.outstanding_liability_cents).toBeNull();
    } finally {
      await deactivateIsolatedOperatingCompany(rtsOnly).catch(() => {});
    }
  });

  it("expired Faro agreement → faro_agreement_not_effective", async () => {
    await bypass(companyId, async () => {
      await db.query(
        `UPDATE factoring.canonical_factor_agreements
            SET effective_to = '2025-12-31'
          WHERE id = $1::uuid`,
        [faroAgreementId]
      );
    });
    const client = await scopedClient();
    const result = await computeFactoringBalanceInvoiceLinkage(client, {
      operatingCompanyId: companyId,
      asOfBusinessDate: "2026-07-19",
    });
    expect(result.status).toBe("unverifiable");
    expect(result.unverifiable_reason).toBe("faro_agreement_not_effective");
    await bypass(companyId, async () => {
      await db.query(
        `UPDATE factoring.canonical_factor_agreements SET effective_to = NULL WHERE id = $1::uuid`,
        [faroAgreementId]
      );
    });
  });

  it("canonical_factor_agreement_terms_immutable: fee_rate rewrite blocked; void/archive excludes from as-of", async () => {
    const voidedVersionId = faroAgreementId;

    // Retroactive term mutation must fail — posters attribute history to immutable versions.
    await bypass(companyId, async () => {
      await expect(
        db.query(
          `UPDATE factoring.canonical_factor_agreements
              SET fee_rate_tier1 = 0.0999
            WHERE id = $1::uuid`,
          [voidedVersionId]
        )
      ).rejects.toThrow(/canonical_factor_agreement_terms_immutable/);
    });

    // effective_to close remains allowed (append-only versioning window close).
    await bypass(companyId, async () => {
      await db.query(
        `UPDATE factoring.canonical_factor_agreements
            SET effective_to = '2026-12-31'
          WHERE id = $1::uuid`,
        [voidedVersionId]
      );
      await db.query(
        `UPDATE factoring.canonical_factor_agreements
            SET effective_to = NULL
          WHERE id = $1::uuid`,
        [voidedVersionId]
      );
    });

    // Void/archive excludes the version from as-of Faro resolution (no silent rewrite).
    await bypass(companyId, async () => {
      await db.query(
        `UPDATE factoring.canonical_factor_agreements
            SET voided_at = now(), voided_by_user_id = $2::uuid
          WHERE id = $1::uuid`,
        [voidedVersionId, TEST_OWNER_USER_ID]
      );
    });
    const missing = await computeFactoringBalanceInvoiceLinkage(await scopedClient(), {
      operatingCompanyId: companyId,
      asOfBusinessDate: "2026-07-19",
    });
    expect(missing.status).toBe("unverifiable");
    expect(missing.unverifiable_reason).toBe("missing_faro_agreement_binding");

    // Append-only restore: INSERT a new effective-dated version (cannot un-void).
    // Distinct effective_from — UNIQUE (tenant, vendor, code, effective_from).
    // MUST be its OWN transaction: the immutability-rejection UPDATE below aborts its transaction, and a
    // COMMIT after an aborted statement silently becomes a ROLLBACK in Postgres — so sharing one bypass()
    // block would discard this INSERT and leave the restored version un-persisted (the version would then
    // resolve as missing_faro_agreement_binding, not the intended effective binding).
    const restoredId = randomUUID();
    await bypass(companyId, async () => {
      await db.query(
        `
          INSERT INTO factoring.canonical_factor_agreements (
            id, tenant_id, factor_profile_id, factor_vendor_id, agreement_code,
            effective_from, effective_to, is_full_recourse,
            fee_rate_tier1, fee_rate_tier2, reserve_rate,
            repurchase_term_days, grace_days, repurchase_deadline_days,
            default_interest_daily_rate, created_by_user_id
          )
          SELECT
            $1::uuid, tenant_id, factor_profile_id, factor_vendor_id, agreement_code,
            '2026-01-01'::date, NULL, is_full_recourse,
            fee_rate_tier1, fee_rate_tier2, reserve_rate,
            repurchase_term_days, grace_days, repurchase_deadline_days,
            default_interest_daily_rate, created_by_user_id
          FROM factoring.canonical_factor_agreements
          WHERE id = $2::uuid
        `,
        [restoredId, voidedVersionId]
      );
    });
    // Term rewrite on the voided historical version remains blocked — isolated txn so the raised error
    // (which aborts its own transaction) cannot roll back the committed append-only restore above.
    await bypass(companyId, async () => {
      await expect(
        db.query(
          `UPDATE factoring.canonical_factor_agreements
              SET fee_rate_tier1 = 0.0500
            WHERE id = $1::uuid`,
          [voidedVersionId]
        )
      ).rejects.toThrow(/canonical_factor_agreement_terms_immutable/);
    });
    faroAgreementId = restoredId;
    const ok = await computeFactoringBalanceInvoiceLinkage(await scopedClient(), {
      operatingCompanyId: companyId,
      asOfBusinessDate: "2026-07-19",
    });
    expect(["ok", "empty", "accounting_exception"]).toContain(ok.status);
  });

  it("wrong Faro profile terms → faro_agreement_terms_mismatch", async () => {
    await bypass(companyId, async () => {
      await db.query(`UPDATE factoring.factor SET reserve_rate = 0.0300 WHERE id = $1::uuid`, [
        factorProfileId,
      ]);
    });
    const client = await scopedClient();
    const result = await computeFactoringBalanceInvoiceLinkage(client, {
      operatingCompanyId: companyId,
      asOfBusinessDate: "2026-07-19",
    });
    expect(result.status).toBe("unverifiable");
    expect(result.unverifiable_reason).toBe("faro_agreement_terms_mismatch");
    await bypass(companyId, async () => {
      await db.query(`UPDATE factoring.factor SET reserve_rate = 0.0150 WHERE id = $1::uuid`, [
        factorProfileId,
      ]);
    });
  });

  it("closed-period negative: posting date on/before closed_period_cutoff fails PERIOD_LOCKED", async () => {
    const { ensureOpenPeriod } = await import("../../accounting/posting-engine.service.js");
    const { PostingEngineError } = await import("../../accounting/posting-engine.service.js");
    // Plant a closed cutoff via set_config override if the helper exists; otherwise exercise the
    // ensureOpenPeriod gate with a mocked cutoff by inserting a closed period when the table exists.
    const periodTable = await db.query<{ ok: boolean }>(
      `SELECT to_regclass('accounting.accounting_periods') IS NOT NULL AS ok`
    );
    if (!periodTable.rows[0]?.ok) {
      // Fallback: ensureOpenPeriod with a client that reports a cutoff must still throw.
      const fakeClient = {
        query: async (sql: string) => {
          if (sql.includes("closed_period_cutoff")) {
            return { rows: [{ cutoff: "2026-06-30" }] };
          }
          return { rows: [] };
        },
      };
      await expect(ensureOpenPeriod(fakeClient, companyId, "2026-06-15")).rejects.toBeInstanceOf(
        PostingEngineError
      );
      await expect(ensureOpenPeriod(fakeClient, companyId, "2026-06-15")).rejects.toMatchObject({
        code: "PERIOD_LOCKED",
      });
      return;
    }
    await bypass(companyId, async () => {
      await db.query(
        `
          INSERT INTO accounting.accounting_periods (
            operating_company_id, period_start, period_end, status
          )
          SELECT $1::uuid, '2026-01-01'::date, '2026-06-30'::date, 'closed'
          WHERE NOT EXISTS (
            SELECT 1 FROM accounting.accounting_periods
             WHERE operating_company_id = $1::uuid
               AND period_end = '2026-06-30'::date
          )
        `,
        [companyId]
      );
    });
    await scopedClient();
    await expect(ensureOpenPeriod(db, companyId, "2026-06-15")).rejects.toMatchObject({
      code: "PERIOD_LOCKED",
    });
  });

  it("held migration 202607600000 fails closed without 202607340000 reversal columns", async () => {
    const fs = await import("node:fs");
    const sql = fs.readFileSync(FACTORING_BALANCE_MIGRATION, "utf8");
    expect(sql.includes("HELD_MIGRATION_PREREQUISITE_MISSING")).toBe(true);
    expect(sql.includes("202607340000_je_reversal_linkage")).toBe(true);
    const prereqMatch = sql.match(/DO \$prereq\$[\s\S]*?END\s*\$prereq\$;/i);
    expect(prereqMatch).toBeTruthy();
    // DDL requires table owner — temporarily drop app role for this rolled-back probe.
    await db.query("RESET ROLE");
    await db.query("BEGIN");
    try {
      await db.query(
        `ALTER TABLE accounting.journal_entries RENAME COLUMN reverses_je_id TO reverses_je_id__prereq_test`
      );
      await db.query(
        `ALTER TABLE accounting.journal_entries RENAME COLUMN reversed_by_je_id TO reversed_by_je_id__prereq_test`
      );
      let failed = false;
      try {
        await db.query(prereqMatch![0]);
      } catch (e) {
        failed = true;
        expect(String((e as Error).message ?? e)).toContain("HELD_MIGRATION_PREREQUISITE_MISSING");
      }
      expect(failed).toBe(true);
    } finally {
      await db.query("ROLLBACK");
      await db.query("SET ROLE ih35_app");
    }
  });

  it("held migration 202607600000 apply-twice is idempotent when prerequisite columns present", async () => {
    const fs = await import("node:fs");
    const sql = fs.readFileSync(FACTORING_BALANCE_MIGRATION, "utf8");
    const body = sql.replace(/^\s*BEGIN\s*;/i, "").replace(/COMMIT\s*;\s*$/i, "");
    await db.query("RESET ROLE");
    await db.query("BEGIN");
    try {
      await db.query(body);
      await db.query(body);
      const agreements = await db.query<{ ok: boolean }>(
        `SELECT to_regclass('factoring.canonical_factor_agreements') IS NOT NULL AS ok`
      );
      expect(agreements.rows[0]?.ok).toBe(true);
      const view = await db.query<{ ok: boolean }>(
        `SELECT to_regclass('views.factoring_balance_invoice_linkage') IS NOT NULL AS ok`
      );
      expect(view.rows[0]?.ok).toBe(true);
    } finally {
      await db.query("ROLLBACK");
      await db.query("SET ROLE ih35_app");
    }
  });
});
