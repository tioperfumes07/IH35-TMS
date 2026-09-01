/**
 * HEALTH-FINANCIAL-CHECKS-01 — read-only ledger probes for GET /api/v1/healthz.
 *
 * Owner: infrastructure-only health reported ok:true while A/R was out $1,215.75.
 * Wire Band A/B/C/F-style controls as critical-tier checks. SEC-HEALTHZ-01: public body may
 * only carry bounded publicCode literals — dollar amounts / ids stay in server logs.
 *
 * Scope: USMCA (launch-first). Reuses detector SQL shapes + bank-orphan dry-run — no new GL math.
 */
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";
import { withLuciaBypass } from "../auth/db.js";
import { runBankOrphanBackfill } from "../banking/bank-orphan-backfill.service.js";
import { USMCA_COMPANY_ID } from "../org/companies.routes.js";
import { logger } from "../observability/structured-logger.js";
import { HealthCheckError } from "./health-errors.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

const HEALTH_LEDGER_OPCO =
  process.env.IH35_HEALTH_LEDGER_OPCO?.trim() || USMCA_COMPANY_ID;

async function withHealthOpco<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [HEALTH_LEDGER_OPCO]);
    return fn(client as never);
  });
}

/** ledger.unbalanced_jes — every real JE with lines must balance (INV-2). */
export async function assertUnbalancedJesZero(): Promise<void> {
  await withHealthOpco(async (client) => {
    const res = await client.query<{ unbalanced_count: string }>(
      `
        WITH je AS (
          SELECT j.id,
                 SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) AS diff,
                 COUNT(p.id) AS lines
            FROM accounting.journal_entries j
            LEFT JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = j.id
           WHERE j.operating_company_id = $1::uuid
             AND j.status <> 'voided'
             AND COALESCE(j.is_sample_data, false) = false
           GROUP BY j.id
        )
        SELECT COUNT(*) FILTER (WHERE lines > 0 AND diff <> 0)::text AS unbalanced_count
          FROM je
      `,
      [HEALTH_LEDGER_OPCO]
    );
    const n = Number(res.rows[0]?.unbalanced_count ?? 0);
    if (n !== 0) {
      logger.error("health_ledger_unbalanced_jes", undefined, { opco: HEALTH_LEDGER_OPCO, unbalanced_count: n });
      throw new HealthCheckError("unbalanced_jes", `count=${n}`);
    }
  });
}

/** ledger.ar_tieout — GL ar_control vs open invoice subledger (real rows only). */
export async function assertArTieout(): Promise<void> {
  await withHealthOpco(async (client) => {
    const arAccountId = await resolveRoleAccountOptional(client as never, HEALTH_LEDGER_OPCO, "ar_control");
    if (!arAccountId) {
      throw new HealthCheckError("ar_control_unbound", "ar_control role unbound");
    }
    const glRes = await client.query<{ cents: string | null }>(
      `
        SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text AS cents
          FROM accounting.journal_entry_postings p
          JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
         WHERE p.operating_company_id = $1::uuid AND p.account_id = $2::uuid
           AND je.status <> 'voided' AND COALESCE(je.is_sample_data, false) = false
      `,
      [HEALTH_LEDGER_OPCO, arAccountId]
    );
    const subRes = await client.query<{ cents: string | null }>(
      `
        SELECT COALESCE(SUM(amount_open_cents), 0)::text AS cents
          FROM accounting.invoices
         WHERE operating_company_id = $1::uuid
           AND voided_at IS NULL
           AND status NOT IN ('draft', 'proforma')
           AND COALESCE(is_sample_data, false) = false
      `,
      [HEALTH_LEDGER_OPCO]
    );
    const glCents = Number(glRes.rows[0]?.cents ?? 0);
    const subCents = Number(subRes.rows[0]?.cents ?? 0);
    const diff = glCents - subCents;
    if (diff !== 0) {
      logger.error("health_ledger_ar_tieout", undefined, {
        opco: HEALTH_LEDGER_OPCO,
        gl_cents: glCents,
        subledger_cents: subCents,
        variance_cents: diff,
      });
      throw new HealthCheckError("ar_tieout_variance", `variance_cents=${diff}`);
    }
  });
}

/** ledger.ap_tieout — GL ap_control vs open bill subledger (real rows only). */
export async function assertApTieout(): Promise<void> {
  await withHealthOpco(async (client) => {
    const apAccountId = await resolveRoleAccountOptional(client as never, HEALTH_LEDGER_OPCO, "ap_control");
    if (!apAccountId) {
      throw new HealthCheckError("ap_control_unbound", "ap_control role unbound");
    }
    const glRes = await client.query<{ cents: string | null }>(
      `
        SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text AS cents
          FROM accounting.journal_entry_postings p
          JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
         WHERE p.operating_company_id = $1::uuid AND p.account_id = $2::uuid
           AND je.status <> 'voided' AND COALESCE(je.is_sample_data, false) = false
      `,
      [HEALTH_LEDGER_OPCO, apAccountId]
    );
    const subRes = await client.query<{ cents: string | null }>(
      `
        SELECT COALESCE(SUM(ROUND((total_amount - COALESCE(paid_amount, 0)) * 100)), 0)::text AS cents
          FROM accounting.bills
         WHERE operating_company_id = $1::uuid
           AND revoked_at IS NULL
           AND status <> 'draft'
           AND COALESCE(is_sample_data, false) = false
      `,
      [HEALTH_LEDGER_OPCO]
    );
    const glCents = Number(glRes.rows[0]?.cents ?? 0);
    const subCents = Number(subRes.rows[0]?.cents ?? 0);
    const diff = glCents - subCents;
    if (diff !== 0) {
      logger.error("health_ledger_ap_tieout", undefined, {
        opco: HEALTH_LEDGER_OPCO,
        gl_cents: glCents,
        subledger_cents: subCents,
        variance_cents: diff,
      });
      throw new HealthCheckError("ap_tieout_variance", `variance_cents=${diff}`);
    }
  });
}

/** ledger.orphaned_bank_matches — bank still categorized against voided docs (BANK-ORPHAN-01). */
export async function assertOrphanedBankMatchesZero(): Promise<void> {
  await withHealthOpco(async (client) => {
    const report = await runBankOrphanBackfill(client, {
      operatingCompanyId: HEALTH_LEDGER_OPCO,
      apply: false,
    });
    if (report.orphan_count !== 0) {
      logger.error("health_ledger_orphaned_bank_matches", undefined, {
        opco: HEALTH_LEDGER_OPCO,
        orphan_count: report.orphan_count,
        sample_ids: report.rows.slice(0, 5).map((r) => r.bank_transaction_id),
      });
      throw new HealthCheckError("orphaned_bank_matches", `count=${report.orphan_count}`);
    }
  });
}

/**
 * ledger.posted_without_posting — TMS-native docs in posted-ish status with zero GL lines
 * (expense / bill / invoice), same defect class as EXP-POSTED-NO-JE-01.
 */
export async function assertPostedWithoutPostingZero(): Promise<void> {
  await withHealthOpco(async (client) => {
    const expenseRes = await client.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
          FROM accounting.expenses e
         WHERE e.operating_company_id = $1::uuid
           AND e.voided_at IS NULL
           AND e.posting_status = 'posted'
           AND e.journal_entry_id IS NULL
           AND COALESCE(e.is_sample_data, false) = false
           AND NOT EXISTS (
             SELECT 1 FROM accounting.posting_batches pb
              WHERE pb.operating_company_id = e.operating_company_id
                AND pb.source_transaction_type = 'expense'
                AND pb.source_transaction_id = e.id
                AND pb.batch_status = 'posted'
           )
      `,
      [HEALTH_LEDGER_OPCO]
    );
    const billRes = await client.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
          FROM accounting.bills b
         WHERE b.operating_company_id = $1::uuid
           AND b.source_system = 'tms'
           AND b.voided_at IS NULL AND b.revoked_at IS NULL
           AND b.status IN ('unpaid', 'partial', 'partially_paid', 'paid')
           AND COALESCE(b.is_sample_data, false) = false
           AND NOT EXISTS (
             SELECT 1 FROM accounting.journal_entry_postings p
              WHERE p.source_transaction_type = 'bill' AND p.source_transaction_id = b.id::text
           )
      `,
      [HEALTH_LEDGER_OPCO]
    );
    const invoiceRes = await client.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
          FROM accounting.invoices i
         WHERE i.operating_company_id = $1::uuid
           AND i.source_system = 'tms'
           AND i.voided_at IS NULL
           AND i.status IN ('sent', 'partial', 'paid')
           AND COALESCE(i.is_sample_data, false) = false
           AND NOT EXISTS (
             SELECT 1 FROM accounting.journal_entry_postings p
              WHERE p.source_transaction_type = 'invoice' AND p.source_transaction_id = i.id::text
           )
      `,
      [HEALTH_LEDGER_OPCO]
    );
    const n =
      Number(expenseRes.rows[0]?.count ?? 0) +
      Number(billRes.rows[0]?.count ?? 0) +
      Number(invoiceRes.rows[0]?.count ?? 0);
    if (n !== 0) {
      logger.error("health_ledger_posted_without_posting", undefined, {
        opco: HEALTH_LEDGER_OPCO,
        expense: Number(expenseRes.rows[0]?.count ?? 0),
        bill: Number(billRes.rows[0]?.count ?? 0),
        invoice: Number(invoiceRes.rows[0]?.count ?? 0),
      });
      throw new HealthCheckError("posted_without_posting", `count=${n}`);
    }
  });
}

/** ledger.voided_without_reason — voided invoice missing void_reason (owner INV-2026-00024 class). */
export async function assertVoidedWithoutReasonZero(): Promise<void> {
  await withHealthOpco(async (client) => {
    const res = await client.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
          FROM accounting.invoices
         WHERE operating_company_id = $1::uuid
           AND voided_at IS NOT NULL
           AND (void_reason IS NULL OR btrim(void_reason) = '')
      `,
      [HEALTH_LEDGER_OPCO]
    );
    const n = Number(res.rows[0]?.count ?? 0);
    if (n !== 0) {
      logger.error("health_ledger_voided_without_reason", undefined, {
        opco: HEALTH_LEDGER_OPCO,
        count: n,
      });
      throw new HealthCheckError("voided_without_reason", `count=${n}`);
    }
  });
}

export const LEDGER_FINANCIAL_HEALTH_CHECKS = [
  { name: "ledger.unbalanced_jes", run: assertUnbalancedJesZero },
  { name: "ledger.ar_tieout", run: assertArTieout },
  { name: "ledger.ap_tieout", run: assertApTieout },
  { name: "ledger.orphaned_bank_matches", run: assertOrphanedBankMatchesZero },
  { name: "ledger.posted_without_posting", run: assertPostedWithoutPostingZero },
  { name: "ledger.voided_without_reason", run: assertVoidedWithoutReasonZero },
] as const;
