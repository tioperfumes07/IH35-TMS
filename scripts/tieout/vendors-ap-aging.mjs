#!/usr/bin/env node
/**
 * VEND-TIEOUT-01 — sum of open bills == AP control, tolerance 0.
 *
 * Reuses the CANONICAL, already-shipped comparison logic rather than inventing a new one:
 *   - Open-bill sum: the exact `AP_AGING_OPEN_BILLS_SQL` text from
 *     apps/backend/src/accounting/ap-aging.service.ts (byte-for-byte copy, cited below), summed
 *     as a subquery. That query already nets bill_payments + vendor_credit_applications +
 *     payment_applications, excludes void/voided/draft and is_sample_data bills, and only counts
 *     rows with positive outstanding — exactly what getApAgingReport()'s totals.total_outstanding
 *     sums in the app layer.
 *   - AP control GL balance: the same recursive-subtree + sign-normalization approach as
 *     apps/backend/src/accounting/subledger-gl-control-rec.service.ts's loadControlBalanceCents
 *     (ACCT-F5695: fn_account_balances_as_of is DEBIT-POSITIVE by construction, so a credit-normal
 *     liability account like ap_control must be sign-flipped before comparing to a subledger total
 *     expressed as a positive magnitude — comparing raw would double the apparent variance).
 *
 * Runs against every operating company that has an ap_control role bound (TRANSP/TRK/USMCA today).
 * Empty result set (no companies with the role bound) is NEVER a pass — that is UNVERIFIED, not
 * green. is_sample_data is excluded by the reused query itself, never re-filtered here; is_duplicate
 * is not a concept on accounting.bills, so it is not touched.
 */
import pg from "pg";
import { fail, requireDb, unverified } from "./_lib.mjs";

export const EXPECTED = { open_bills_eq_ap_control: true, tolerance_cents: 0 };

if (process.argv.includes("--expected-only")) {
  console.log(JSON.stringify(EXPECTED));
  process.exit(0);
}

const url = requireDb();

// Verbatim from apps/backend/src/accounting/ap-aging.service.ts's AP_AGING_OPEN_BILLS_SQL — the
// outstanding_cents projection + WHERE clause only (the vendor/display columns that report needs
// for grouping are irrelevant to a company-wide sum, so they are dropped here; the netting and
// filtering logic that determines "is this bill open, and for how much" is reproduced exactly).
const AP_AGING_OPEN_BILLS_SQL = `
  SELECT
    GREATEST(
      COALESCE(b.amount_cents, 0)
        - COALESCE((
            SELECT SUM(COALESCE(bp.amount_cents, 0))
            FROM accounting.bill_payments bp
            WHERE bp.bill_id = b.id
              AND bp.operating_company_id = b.operating_company_id
              AND bp.payment_date <= $2::date
              AND (bp.revoked_at IS NULL OR bp.revoked_at::date > $2::date)
          ), 0)
        - COALESCE((
            SELECT SUM(vca.applied_cents)
            FROM accounting.vendor_credit_applications vca
            WHERE vca.bill_id = b.id
              AND vca.operating_company_id = $1::uuid
              AND vca.voided_at IS NULL
              AND (vca.applied_at AT TIME ZONE 'UTC')::date <= $2::date
          ), 0)
        - COALESCE((
            SELECT SUM(pa.amount_cents)
            FROM accounting.payment_applications pa
            WHERE pa.target_kind = 'bill'
              AND pa.target_id = b.id
              AND pa.operating_company_id = $1::uuid
              AND pa.unapplied_at IS NULL
              AND (pa.applied_at AT TIME ZONE 'UTC')::date <= $2::date
          ), 0)
    , 0)::bigint AS outstanding_cents
  FROM accounting.bills b
  WHERE b.operating_company_id = $1::uuid
    AND b.bill_date <= $2::date
    AND b.amount_cents IS NOT NULL
    AND (b.revoked_at IS NULL OR b.revoked_at::date > $2::date)
    AND b.status NOT IN ('void', 'voided', 'draft')
    AND b.is_sample_data = false
    -- LOAD-LINKAGE-SCOPE-RULING-2026-08-04 class: accounting.bills is a PARALLEL-BOOKS mirror —
    -- confirmed live (this pass, tiny-field-89581227): TRK is 13,050/13,050 source_system='qbo'
    -- (0 TMS-native), TRANSP is 3,195 qbo / 1 tms, USMCA is 10/10 tms (the active test entity).
    -- A QBO-cloned bill was never posted through the TMS GL poster and has no corresponding
    -- journal entry BY DESIGN (parallel books, not a sync) -- summing it into "open bills" and
    -- comparing to a TMS-postings-only GL control balance would be exactly the
    -- expected-state-recorded-as-failure anti-pattern, not a real tie-out. Scope to TMS-native only.
    AND b.source_system = 'tms'
    AND GREATEST(
      COALESCE(b.amount_cents, 0)
        - COALESCE((
            SELECT SUM(COALESCE(bp.amount_cents, 0))
            FROM accounting.bill_payments bp
            WHERE bp.bill_id = b.id
              AND bp.operating_company_id = b.operating_company_id
              AND bp.payment_date <= $2::date
              AND (bp.revoked_at IS NULL OR bp.revoked_at::date > $2::date)
          ), 0)
        - COALESCE((
            SELECT SUM(vca.applied_cents)
            FROM accounting.vendor_credit_applications vca
            WHERE vca.bill_id = b.id
              AND vca.operating_company_id = $1::uuid
              AND vca.voided_at IS NULL
              AND (vca.applied_at AT TIME ZONE 'UTC')::date <= $2::date
          ), 0)
        - COALESCE((
            SELECT SUM(pa.amount_cents)
            FROM accounting.payment_applications pa
            WHERE pa.target_kind = 'bill'
              AND pa.target_id = b.id
              AND pa.operating_company_id = $1::uuid
              AND pa.unapplied_at IS NULL
              AND (pa.applied_at AT TIME ZONE 'UTC')::date <= $2::date
          ), 0)
    , 0) > 0
`;

// Mirrors subledger-gl-control-rec.service.ts's loadControlBalanceCents exactly: recurse the full
// descendant subtree of the ap_control account (a control account can be a grandparent with real
// postings only on leaf sub-accounts), sum via fn_account_balances_as_of (DEBIT-POSITIVE by
// construction), and sign-flip any credit-normal row so the result is a positive magnitude in the
// account's own natural direction — the same convention the open-bill sum already uses.
const AP_CONTROL_BALANCE_SQL = `
  WITH RECURSIVE subtree AS (
    SELECT id FROM catalogs.accounts
     WHERE id = $3::uuid AND operating_company_id = $1::uuid
    UNION ALL
    SELECT a.id
      FROM catalogs.accounts a
      JOIN subtree s ON a.parent_account_id = s.id
     WHERE a.operating_company_id = $1::uuid
  )
  SELECT b.closing_balance_cents::bigint AS closing_balance_cents, b.normal_balance
    FROM accounting.fn_account_balances_as_of($1::uuid, $2::date, NULL::date) b
    JOIN subtree s ON s.id = b.account_id
`;

function companyBusinessDate(date = new Date()) {
  // Mirrors apps/backend/src/lib/company-business-date.ts's companyBusinessDate() exactly —
  // America/Chicago calendar date, not new Date().toISOString() (that returns the UTC calendar
  // date, which after ~19:00 Central has already rolled to tomorrow).
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function main() {
  const pool = new pg.Pool({ connectionString: url });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET TRANSACTION READ ONLY");
      await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

      const asOfDate = companyBusinessDate();

      const companiesRes = await client.query(
        `SELECT r.operating_company_id::text, o.code, r.account_id::text AS ap_control_account_id,
                a.opening_balance_cents::bigint AS opening_balance_cents, a.opening_balance_as_of::text AS opening_balance_as_of
           FROM accounting.chart_of_accounts_roles r
           JOIN org.companies o ON o.id = r.operating_company_id
           JOIN catalogs.accounts a ON a.id = r.account_id
          WHERE r.role = 'ap_control' AND r.is_active`
      );

      await client.query("ROLLBACK");

      if (companiesRes.rows.length === 0) {
        unverified("no operating company has an ap_control role bound — nothing to compare (empty is never PASS)");
        return;
      }

      const results = [];
      for (const company of companiesRes.rows) {
        const c2 = await pool.connect();
        try {
          await c2.query("BEGIN");
          await c2.query("SET TRANSACTION READ ONLY");
          await c2.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

          const openBillsRes = await c2.query(
            `SELECT COALESCE(SUM(outstanding_cents), 0)::bigint AS total_cents FROM (${AP_AGING_OPEN_BILLS_SQL}) t`,
            [company.operating_company_id, asOfDate]
          );
          const openBillsCents = Number(openBillsRes.rows[0]?.total_cents ?? 0);

          const controlRes = await c2.query(AP_CONTROL_BALANCE_SQL, [
            company.operating_company_id,
            asOfDate,
            company.ap_control_account_id,
          ]);
          const controlBalanceCents = controlRes.rows.reduce((sum, row) => {
            const raw = Number(row.closing_balance_cents ?? 0);
            return sum + (row.normal_balance === "credit" ? -raw : raw);
          }, 0);

          await c2.query("ROLLBACK");

          const varianceCents = controlBalanceCents - openBillsCents;
          results.push({
            code: company.code,
            openBillsCents,
            controlBalanceCents,
            varianceCents,
            openingBalanceCents: company.opening_balance_cents == null ? null : Number(company.opening_balance_cents),
            openingBalanceAsOf: company.opening_balance_as_of,
          });
        } finally {
          c2.release();
        }
      }

      const failures = results.filter((r) => r.varianceCents !== 0);
      const summary = results
        .map((r) => {
          const base = `${r.code}: open_tms_bills=${r.openBillsCents}c control=${r.controlBalanceCents}c variance=${r.varianceCents}c`;
          // A non-null opening_balance_cents means the control account carries an owner-entered
          // Ch.11/opening-balance figure with no bill-level itemization at all (see
          // db/migrations or catalogs.accounts.opening_balance_cents) -- a variance here is
          // EXPECTED under that architecture, not a bill-posting bug, unless the variance exceeds
          // what the opening balance alone explains.
          if (r.openingBalanceCents != null) {
            const unexplained = r.varianceCents - r.openingBalanceCents;
            return `${base} [carries opening_balance=${r.openingBalanceCents}c as of ${r.openingBalanceAsOf}; unexplained-beyond-opening=${unexplained}c]`;
          }
          return base;
        })
        .join(" | ");

      if (failures.length > 0) {
        fail(`VEND-TIEOUT-01 AP aging vs AP control variance (tolerance 0): ${summary}`);
        return;
      }
      console.log(`TIEOUT PASS: VEND-TIEOUT-01 AP aging == AP control for all ${results.length} entit${results.length === 1 ? "y" : "ies"} as of ${asOfDate} (${summary})`);
      process.exit(0);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`TIEOUT ERROR: ${error?.message ?? error}`);
  process.exit(2);
});
