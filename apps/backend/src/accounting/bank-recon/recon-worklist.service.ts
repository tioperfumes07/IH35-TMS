import { withLuciaBypass } from "../../auth/db.js";
import { acceptMatchWithResolveDifference, previewMatchVariance, type LedgerEntryKind } from "./match.service.js";

const ZERO_VARIANCE_ACCOUNT_ID = "00000000-0000-4000-8000-000000000000";

type WorklistRow = {
  id: string;
  transaction_date: string;
  amount_cents: number;
  description: string | null;
  merchant_name: string | null;
  is_credit: boolean;
};

function confirmedStateWhere() {
  return `rm.match_state IN ('auto_matched', 'user_matched', 'rejected')`;
}

export async function getReconWorklist(input: {
  operating_company_id: string;
  account_id: string;
  period_start: string;
  period_end: string;
}) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

    const unmatched = await client.query<WorklistRow>(
      `
        SELECT
          bt.id::text,
          bt.transaction_date::text,
          bt.amount_cents::int,
          bt.description,
          bt.merchant_name,
          bt.is_credit
        FROM banking.bank_transactions bt
        WHERE bt.operating_company_id = $1::uuid
          AND bt.bank_account_id = $2::uuid
          AND bt.transaction_date BETWEEN $3::date AND $4::date
          AND NOT EXISTS (
            SELECT 1
            FROM bank.reconciliation_matches rm
            WHERE rm.bank_transaction_id = bt.id
              AND rm.operating_company_id = bt.operating_company_id
              AND ${confirmedStateWhere()}
          )
        ORDER BY bt.transaction_date ASC, bt.created_at ASC
      `,
      [input.operating_company_id, input.account_id, input.period_start, input.period_end]
    );

    const autoMatched = await client.query<
      WorklistRow & { ledger_entry_kind: LedgerEntryKind; ledger_entry_id: string; match_score: number; match_state: string }
    >(
      `
        SELECT
          bt.id::text,
          bt.transaction_date::text,
          bt.amount_cents::int,
          bt.description,
          bt.merchant_name,
          bt.is_credit,
          rm.ledger_entry_kind::text AS ledger_entry_kind,
          rm.ledger_entry_id::text AS ledger_entry_id,
          rm.match_score::numeric::float8 AS match_score,
          rm.match_state::text AS match_state
        FROM bank.reconciliation_matches rm
        JOIN banking.bank_transactions bt ON bt.id = rm.bank_transaction_id
        WHERE rm.operating_company_id = $1::uuid
          AND bt.bank_account_id = $2::uuid
          AND bt.transaction_date BETWEEN $3::date AND $4::date
          AND rm.match_state = 'auto_matched'
        ORDER BY bt.transaction_date ASC, bt.created_at ASC
      `,
      [input.operating_company_id, input.account_id, input.period_start, input.period_end]
    );

    const varianceResolved = await client.query<{
      journal_entry_id: string;
      entry_date: string;
      reference_no: string | null;
      variance_cents: number;
    }>(
      `
        SELECT
          je.id::text AS journal_entry_id,
          je.entry_date::text,
          je.reference_no::text,
          COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::int AS variance_cents
        FROM accounting.journal_entries je
        LEFT JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
        WHERE je.operating_company_id = $1::uuid
          AND je.source = 'bank_reconciliation'
          AND je.entry_date BETWEEN $2::date AND $3::date
          AND COALESCE(je.reference_no, '') LIKE 'bank-recon:%'
        GROUP BY je.id
        ORDER BY je.entry_date DESC, je.created_at DESC
      `,
      [input.operating_company_id, input.period_start, input.period_end]
    );

    const progress = await client.query<{ total_count: number; matched_count: number }>(
      `
        WITH period_tx AS (
          SELECT id
          FROM banking.bank_transactions
          WHERE operating_company_id = $1::uuid
            AND bank_account_id = $2::uuid
            AND transaction_date BETWEEN $3::date AND $4::date
        )
        SELECT
          COUNT(*)::int AS total_count,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM bank.reconciliation_matches rm
              WHERE rm.bank_transaction_id = period_tx.id
                AND rm.operating_company_id = $1::uuid
                AND ${confirmedStateWhere()}
            )
          )::int AS matched_count
        FROM period_tx
      `,
      [input.operating_company_id, input.account_id, input.period_start, input.period_end]
    );
    const total = Number(progress.rows[0]?.total_count ?? 0);
    const matched = Number(progress.rows[0]?.matched_count ?? 0);
    const progressPct = total > 0 ? Number(((matched / total) * 100).toFixed(2)) : 100;

    return {
      unmatched_transactions: unmatched.rows,
      auto_matched_candidates: autoMatched.rows,
      variance_resolved_entries: varianceResolved.rows,
      progress: {
        total_transactions: total,
        matched_or_skipped_transactions: matched,
        percent: progressPct,
      },
    };
  });
}

export async function acceptReconMatch(input: {
  operating_company_id: string;
  bank_transaction_id: string;
  actor_user_uuid: string;
  ledger_entry_kind: LedgerEntryKind;
  ledger_entry_id: string;
  variance_account_id?: string;
}) {
  const preview = await previewMatchVariance({
    operating_company_id: input.operating_company_id,
    bank_transaction_id: input.bank_transaction_id,
    ledger_entry_kind: input.ledger_entry_kind,
    ledger_entry_id: input.ledger_entry_id,
  });
  if (preview.variance_cents !== 0 && !input.variance_account_id) {
    throw new Error("variance_account_id_required");
  }
  return acceptMatchWithResolveDifference({
    operating_company_id: input.operating_company_id,
    bank_transaction_id: input.bank_transaction_id,
    actor_user_uuid: input.actor_user_uuid,
    ledger_entry_kind: input.ledger_entry_kind,
    ledger_entry_id: input.ledger_entry_id,
    difference_account_id: input.variance_account_id ?? ZERO_VARIANCE_ACCOUNT_ID,
  });
}

export async function rejectReconMatch(input: {
  operating_company_id: string;
  bank_transaction_id: string;
  actor_user_uuid: string;
  ledger_entry_kind: LedgerEntryKind;
  ledger_entry_id: string;
}) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    await client.query(
      `
        INSERT INTO bank.reconciliation_matches (
          operating_company_id,
          bank_transaction_id,
          ledger_entry_kind,
          ledger_entry_id,
          match_score,
          match_state,
          matched_at,
          matched_by_user_uuid
        )
        VALUES ($1::uuid, $2::uuid, $3::text, $4::uuid, 0, 'rejected', now(), $5::uuid)
        ON CONFLICT (bank_transaction_id, ledger_entry_kind, ledger_entry_id)
        DO UPDATE SET
          match_score = 0,
          match_state = 'rejected',
          matched_at = now(),
          matched_by_user_uuid = EXCLUDED.matched_by_user_uuid
      `,
      [
        input.operating_company_id,
        input.bank_transaction_id,
        input.ledger_entry_kind,
        input.ledger_entry_id,
        input.actor_user_uuid,
      ]
    );
    return { ok: true };
  });
}

export async function closeReconPeriod(input: {
  operating_company_id: string;
  account_id: string;
  period_end: string;
  actor_user_uuid: string;
}) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const coverage = await client.query<{ total_count: number; covered_count: number }>(
      `
        WITH period_tx AS (
          SELECT id
          FROM banking.bank_transactions
          WHERE operating_company_id = $1::uuid
            AND bank_account_id = $2::uuid
            AND transaction_date <= $3::date
        )
        SELECT
          COUNT(*)::int AS total_count,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM bank.reconciliation_matches rm
              WHERE rm.bank_transaction_id = period_tx.id
                AND rm.operating_company_id = $1::uuid
                AND ${confirmedStateWhere()}
            )
          )::int AS covered_count
        FROM period_tx
      `,
      [input.operating_company_id, input.account_id, input.period_end]
    );
    const total = Number(coverage.rows[0]?.total_count ?? 0);
    const covered = Number(coverage.rows[0]?.covered_count ?? 0);
    if (total > 0 && covered < total) {
      throw new Error("period_not_100pct_reconciled");
    }

    const lockRes = await client.query<{ closed_through: string | null }>(
      `
        SELECT accounting.closed_period_cutoff($1::uuid)::text AS closed_through
      `,
      [input.operating_company_id]
    );

    return {
      ok: true,
      covered_transactions: covered,
      total_transactions: total,
      closed_period_cutoff: lockRes.rows[0]?.closed_through ?? null,
    };
  });
}
