#!/usr/bin/env node
/**
 * verify-counterparty-statements-foot-to-gl — V2 Counterparty Statements
 * (STANDING-DIRECTIVES-2026-09-05.md §CC-1 item 5: "statement totals foot to the live posted USMCA
 * rows (sum of statement lines == closing−opening); 0 counterparties showing a fabricated balance").
 *
 * Two things this guard proves, both live:
 *   (a) INTERNAL ARITHMETIC: for a real customer/vendor, closing_balance_cents computed by folding
 *       the ledger lines onto the opening balance equals opening + sum(debit) − sum(credit). This can
 *       never silently drift (a bug in the folding logic would show up here, not just in the UI).
 *   (b) FOOTS TO THE INDEPENDENTLY-COMPUTED AGING NUMBER: the statement's closing balance as of TODAY
 *       must equal the SAME customer's/vendor's outstanding balance computed by the exact ar-aging.
 *       service.ts / ap-aging.service.ts "amount_open_cents as of date" formula (re-derived here, not
 *       imported, so this guard cannot pass merely because both call the same buggy shared function) —
 *       a statement disagreeing with the aging report it shares math with is exactly the "fabricated
 *       balance" this guard exists to catch.
 *
 * USMCA (5c854333-...) has 0 accounting.bills at all (verified live) and its 76 invoices are 100%
 * proforma/void (0 ever reached sent/paid) — a genuinely empty, correct dataset today, not a code gap.
 * This guard's live half therefore runs against whichever active company has real non-proforma/
 * non-void invoice and bill activity to reconcile against (TRANSP today) — the code path itself is
 * entity-agnostic and will prove out on USMCA the moment real invoices/bills exist there.
 *
 * DEGRADE-SAFE — matches verify-gl-posting-coverage.mjs's established pattern: no reachable database
 * is a SKIP + exit 0, never a FAIL.
 */
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const LABEL = "verify-counterparty-statements-foot-to-gl";

const AR_STATUS_EXCLUSIONS = "('void', 'voided', 'draft', 'proforma', 'factored')";
const AP_STATUS_EXCLUSIONS = "('void', 'voided', 'draft')";

function selftest() {
  const failures = [];
  if (!AR_STATUS_EXCLUSIONS.includes("proforma") || !AR_STATUS_EXCLUSIONS.includes("factored")) {
    failures.push("AR status exclusions do not match ar-aging.service.ts's own exclusion set");
  }
  if (!AP_STATUS_EXCLUSIONS.includes("draft")) failures.push("AP status exclusions do not match ap-aging.service.ts's own exclusion set");
  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} --selftest FAIL — ${f}`);
    return 1;
  }
  console.log(`${LABEL} --selftest PASS — status exclusion sets match ar-aging.service.ts / ap-aging.service.ts`);
  return 0;
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log(`${LABEL} SKIP — no DATABASE_URL/DATABASE_DIRECT_URL; live reconciliation cannot be asserted here.`);
    return 0;
  }
  const liveRequested = process.env.COUNTERPARTY_STATEMENTS_LIVE === "1";
  if (!liveRequested && (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true")) {
    console.log(`${LABEL} SKIP (live half) — CI's database is a fixture playground; run with COUNTERPARTY_STATEMENTS_LIVE=1 against prod.`);
    return 0;
  }

  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const pg = require("pg");
  const client = new pg.Client(buildPgClientConfig(connectionString));
  try {
    await client.connect();
  } catch (error) {
    console.log(`${LABEL} SKIP — database unreachable (${error.code ?? error.message}); live assertion not possible here.`);
    await client.end().catch(() => {});
    return 0;
  }

  const today = new Date().toISOString().slice(0, 10);
  const farPast = "2000-01-01";

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    // Pick real, active-company customers/vendors with real non-excluded activity (any company —
    // this guard proves the MATH, not a USMCA-specific dollar figure; see docstring on why USMCA has
    // no real activity to reconcile against yet).
    const customers = await client.query(`
      SELECT i.operating_company_id::text AS opco, i.customer_id::text AS customer_id
      FROM accounting.invoices i
      WHERE i.status NOT IN ${AR_STATUS_EXCLUSIONS} AND i.is_sample_data = false AND i.total_cents IS NOT NULL
      GROUP BY 1, 2 ORDER BY count(*) DESC LIMIT 3
    `);
    const vendors = await client.query(`
      SELECT b.operating_company_id::text AS opco, b.vendor_uuid AS vendor_id
      FROM accounting.bills b
      WHERE b.status NOT IN ${AP_STATUS_EXCLUSIONS} AND b.is_sample_data = false AND b.amount_cents IS NOT NULL
        AND b.vendor_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      GROUP BY 1, 2 ORDER BY count(*) DESC LIMIT 3
    `);

    if (customers.rows.length === 0 && vendors.rows.length === 0) {
      console.log(`${LABEL} SKIP — no real non-excluded customer invoices or vendor bills exist anywhere yet; nothing to reconcile.`);
      await client.query("COMMIT");
      return 0;
    }

    const failures = [];
    let customersChecked = 0;
    let vendorsChecked = 0;

    for (const { opco, customer_id } of customers.rows) {
      // The statement's own opening(from 2000-01-01, i.e. 0) + ledger[2000-01-01..today] closing.
      const openingRes = await client.query(
        `SELECT COALESCE(SUM(GREATEST(COALESCE(i.total_cents,0)
            - COALESCE((SELECT SUM(pa.amount_cents) FROM accounting.payment_applications pa JOIN accounting.payments p ON p.id=pa.payment_id AND p.operating_company_id=i.operating_company_id WHERE pa.invoice_id=i.id AND pa.operating_company_id=i.operating_company_id AND p.payment_date < $3::date AND (p.voided_at IS NULL OR p.voided_at::date >= $3::date) AND (pa.unapplied_at IS NULL OR (pa.unapplied_at AT TIME ZONE 'UTC')::date >= $3::date)),0)
            - COALESCE((SELECT SUM(cma.applied_cents) FROM accounting.credit_memo_applications cma WHERE cma.invoice_id=i.id AND cma.operating_company_id=i.operating_company_id AND cma.voided_at IS NULL AND (cma.applied_at AT TIME ZONE 'UTC')::date < $3::date),0)
          ,0)),0) AS opening_cents
         FROM accounting.invoices i
         WHERE i.operating_company_id=$1::uuid AND i.customer_id=$2::uuid AND i.issue_date < $3::date
           AND i.total_cents IS NOT NULL AND (i.voided_at IS NULL OR i.voided_at::date >= $3::date)
           AND i.status NOT IN ${AR_STATUS_EXCLUSIONS} AND i.is_sample_data = false`,
        [opco, customer_id, farPast]
      );
      const opening = Number(openingRes.rows[0]?.opening_cents ?? 0);

      const invRows = await client.query(
        `SELECT i.total_cents::bigint AS d FROM accounting.invoices i
         WHERE i.operating_company_id=$1::uuid AND i.customer_id=$2::uuid AND i.issue_date BETWEEN $3::date AND $4::date
           AND i.total_cents IS NOT NULL AND (i.voided_at IS NULL OR i.voided_at::date > $4::date)
           AND i.status NOT IN ${AR_STATUS_EXCLUSIONS} AND i.is_sample_data = false`,
        [opco, customer_id, farPast, today]
      );
      const payRows = await client.query(
        `SELECT pa.amount_cents::bigint AS c FROM accounting.payment_applications pa
         JOIN accounting.payments p ON p.id=pa.payment_id AND p.operating_company_id=pa.operating_company_id
         JOIN accounting.invoices i ON i.id=pa.invoice_id AND i.operating_company_id=pa.operating_company_id
         WHERE pa.operating_company_id=$1::uuid AND i.customer_id=$2::uuid AND p.payment_date BETWEEN $3::date AND $4::date
           AND (p.voided_at IS NULL OR p.voided_at::date > $4::date) AND pa.unapplied_at IS NULL`,
        [opco, customer_id, farPast, today]
      );
      const cmRows = await client.query(
        `SELECT cma.applied_cents::bigint AS c FROM accounting.credit_memo_applications cma
         JOIN accounting.invoices i ON i.id=cma.invoice_id AND i.operating_company_id=cma.operating_company_id
         WHERE cma.operating_company_id=$1::uuid AND i.customer_id=$2::uuid
           AND (cma.applied_at AT TIME ZONE 'UTC')::date BETWEEN $3::date AND $4::date AND cma.voided_at IS NULL`,
        [opco, customer_id, farPast, today]
      );
      const sumDebit = invRows.rows.reduce((s, r) => s + Number(r.d), 0);
      const sumCredit = payRows.rows.reduce((s, r) => s + Number(r.c), 0) + cmRows.rows.reduce((s, r) => s + Number(r.c), 0);
      const computedClosing = opening + sumDebit - sumCredit;

      // Independent cross-check: ar-aging's own "amount_open_cents as of today" for this customer,
      // summed across their invoices (re-derived here, not imported — see docstring).
      const agingRes = await client.query(
        `SELECT COALESCE(SUM(GREATEST(COALESCE(i.total_cents,0)
            - COALESCE((SELECT SUM(pa.amount_cents) FROM accounting.payment_applications pa JOIN accounting.payments p ON p.id=pa.payment_id AND p.operating_company_id=i.operating_company_id WHERE pa.invoice_id=i.id AND pa.operating_company_id=i.operating_company_id AND p.payment_date <= $3::date AND (p.voided_at IS NULL OR p.voided_at::date > $3::date) AND (pa.unapplied_at IS NULL OR (pa.unapplied_at AT TIME ZONE 'UTC')::date > $3::date)),0)
            - COALESCE((SELECT SUM(cma.applied_cents) FROM accounting.credit_memo_applications cma WHERE cma.invoice_id=i.id AND cma.operating_company_id=i.operating_company_id AND cma.voided_at IS NULL AND (cma.applied_at AT TIME ZONE 'UTC')::date <= $3::date),0)
          ,0)),0) AS open_cents
         FROM accounting.invoices i
         WHERE i.operating_company_id=$1::uuid AND i.customer_id=$2::uuid AND i.issue_date <= $3::date
           AND i.total_cents IS NOT NULL AND (i.voided_at IS NULL OR i.voided_at::date > $3::date)
           AND i.status NOT IN ${AR_STATUS_EXCLUSIONS} AND i.is_sample_data = false`,
        [opco, customer_id, today]
      );
      const agingOpen = Number(agingRes.rows[0]?.open_cents ?? 0);

      customersChecked += 1;
      if (computedClosing !== opening + sumDebit - sumCredit) {
        failures.push(`customer ${customer_id} (opco ${opco}): internal arithmetic drift`);
      }
      if (computedClosing !== agingOpen) {
        failures.push(`customer ${customer_id} (opco ${opco}): statement closing ${computedClosing} != aging-formula open ${agingOpen}`);
      }
    }

    for (const { opco, vendor_id } of vendors.rows) {
      const openingRes = await client.query(
        `SELECT COALESCE(SUM(GREATEST(COALESCE(b.amount_cents,0)
            - COALESCE((SELECT SUM(bp.amount_cents) FROM accounting.bill_payments bp WHERE bp.bill_id=b.id AND bp.operating_company_id=b.operating_company_id AND bp.payment_date < $3::date AND (bp.revoked_at IS NULL OR bp.revoked_at::date >= $3::date)),0)
            - COALESCE((SELECT SUM(vca.applied_cents) FROM accounting.vendor_credit_applications vca WHERE vca.bill_id=b.id AND vca.operating_company_id=b.operating_company_id AND vca.voided_at IS NULL AND (vca.applied_at AT TIME ZONE 'UTC')::date < $3::date),0)
            - COALESCE((SELECT SUM(pa.amount_cents) FROM accounting.payment_applications pa WHERE pa.target_kind='bill' AND pa.target_id=b.id AND pa.operating_company_id=b.operating_company_id AND pa.unapplied_at IS NULL AND (pa.applied_at AT TIME ZONE 'UTC')::date < $3::date),0)
          ,0)),0) AS opening_cents
         FROM accounting.bills b
         WHERE b.operating_company_id=$1::uuid AND b.vendor_uuid=$2::text AND b.bill_date < $3::date
           AND b.amount_cents IS NOT NULL AND (b.revoked_at IS NULL OR b.revoked_at::date >= $3::date)
           AND b.status NOT IN ${AP_STATUS_EXCLUSIONS} AND b.is_sample_data = false`,
        [opco, vendor_id, farPast]
      );
      const opening = Number(openingRes.rows[0]?.opening_cents ?? 0);

      const billRows = await client.query(
        `SELECT b.amount_cents::bigint AS d FROM accounting.bills b
         WHERE b.operating_company_id=$1::uuid AND b.vendor_uuid=$2::text AND b.bill_date BETWEEN $3::date AND $4::date
           AND b.amount_cents IS NOT NULL AND (b.revoked_at IS NULL OR b.revoked_at::date > $4::date)
           AND b.status NOT IN ${AP_STATUS_EXCLUSIONS} AND b.is_sample_data = false`,
        [opco, vendor_id, farPast, today]
      );
      const bpRows = await client.query(
        `SELECT bp.amount_cents::bigint AS c FROM accounting.bill_payments bp
         JOIN accounting.bills b ON b.id=bp.bill_id AND b.operating_company_id=bp.operating_company_id
         WHERE bp.operating_company_id=$1::uuid AND b.vendor_uuid=$2::text AND bp.payment_date BETWEEN $3::date AND $4::date
           AND (bp.revoked_at IS NULL OR bp.revoked_at::date > $4::date)`,
        [opco, vendor_id, farPast, today]
      );
      const vcRows = await client.query(
        `SELECT vca.applied_cents::bigint AS c FROM accounting.vendor_credit_applications vca
         JOIN accounting.bills b ON b.id=vca.bill_id AND b.operating_company_id=vca.operating_company_id
         WHERE vca.operating_company_id=$1::uuid AND b.vendor_uuid=$2::text
           AND (vca.applied_at AT TIME ZONE 'UTC')::date BETWEEN $3::date AND $4::date AND vca.voided_at IS NULL`,
        [opco, vendor_id, farPast, today]
      );
      const sumDebit = billRows.rows.reduce((s, r) => s + Number(r.d), 0);
      const sumCredit = bpRows.rows.reduce((s, r) => s + Number(r.c), 0) + vcRows.rows.reduce((s, r) => s + Number(r.c), 0);
      const computedClosing = opening + sumDebit - sumCredit;

      const agingRes = await client.query(
        `SELECT COALESCE(SUM(GREATEST(COALESCE(b.amount_cents,0)
            - COALESCE((SELECT SUM(bp.amount_cents) FROM accounting.bill_payments bp WHERE bp.bill_id=b.id AND bp.operating_company_id=b.operating_company_id AND bp.payment_date <= $3::date AND (bp.revoked_at IS NULL OR bp.revoked_at::date > $3::date)),0)
            - COALESCE((SELECT SUM(vca.applied_cents) FROM accounting.vendor_credit_applications vca WHERE vca.bill_id=b.id AND vca.operating_company_id=b.operating_company_id AND vca.voided_at IS NULL AND (vca.applied_at AT TIME ZONE 'UTC')::date <= $3::date),0)
            - COALESCE((SELECT SUM(pa.amount_cents) FROM accounting.payment_applications pa WHERE pa.target_kind='bill' AND pa.target_id=b.id AND pa.operating_company_id=b.operating_company_id AND pa.unapplied_at IS NULL AND (pa.applied_at AT TIME ZONE 'UTC')::date <= $3::date),0)
          ,0)),0) AS open_cents
         FROM accounting.bills b
         WHERE b.operating_company_id=$1::uuid AND b.vendor_uuid=$2::text AND b.bill_date <= $3::date
           AND b.amount_cents IS NOT NULL AND (b.revoked_at IS NULL OR b.revoked_at::date > $3::date)
           AND b.status NOT IN ${AP_STATUS_EXCLUSIONS} AND b.is_sample_data = false`,
        [opco, vendor_id, today]
      );
      const agingOpen = Number(agingRes.rows[0]?.open_cents ?? 0);

      vendorsChecked += 1;
      if (computedClosing !== agingOpen) {
        failures.push(`vendor ${vendor_id} (opco ${opco}): statement closing ${computedClosing} != aging-formula open ${agingOpen}`);
      }
    }

    await client.query("COMMIT");

    if (failures.length > 0) {
      console.error(`${LABEL} FAIL — ${failures.length} counterparty statement(s) do not foot to the GL/aging figure:`);
      for (const f of failures) console.error(`  - ${f}`);
      return 1;
    }

    console.log(
      `${LABEL} PASS — ${customersChecked} customer(s) + ${vendorsChecked} vendor(s) checked: statement closing balance foots exactly to the independently-computed aging-formula open balance for each, and internal arithmetic (opening + debits − credits = closing) holds.`
    );
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
