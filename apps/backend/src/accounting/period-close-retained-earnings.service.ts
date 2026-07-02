import type { PoolClient } from "pg";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { writeTransactionSourceLink } from "./accounting-spine-emit.js";

function isDec31(isoDate: string) {
  return isoDate.slice(0, 10).endsWith("-12-31");
}

type CloseLine = {
  account_id: string;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string;
};

/**
 * Year-end only (period_end == Dec 31): inserts a balancing posted JE closing P&L into retained earnings.
 * Caller owns BEGIN/COMMIT together with period close UPDATE.
 */
export async function insertRetainedEarningsClosingJournalIfNeeded(
  client: PoolClient,
  params: {
    operating_company_id: string;
    period_start: string;
    period_end: string;
    fiscal_year: number;
    closer_user_id: string;
  }
): Promise<string | null> {
  if (!isDec31(params.period_end)) return null;

  const agg = await client.query<{ account_id: string; account_type: string; debits: string; credits: string }>(
    `
      SELECT
        jep.account_id::text AS account_id,
        a.account_type::text AS account_type,
        SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE 0 END)::text AS debits,
        SUM(CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents ELSE 0 END)::text AS credits
      FROM accounting.journal_entry_postings jep
      INNER JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
      INNER JOIN catalogs.accounts a ON a.id = jep.account_id
      WHERE jep.operating_company_id = $1::uuid
        AND je.operating_company_id = $1::uuid
        AND je.status = 'posted'
        AND je.entry_date BETWEEN $2::date AND $3::date
      GROUP BY jep.account_id, a.account_type
    `,
    [params.operating_company_id, params.period_start, params.period_end]
  );

  const lines: CloseLine[] = [];

  for (const row of agg.rows) {
    const debits = BigInt(row.debits || "0");
    const credits = BigInt(row.credits || "0");
    const t = row.account_type;

    if (t === "Income" || t === "OtherIncome") {
      const bal = credits - debits;
      if (bal > 0n) {
        lines.push({
          account_id: row.account_id,
          debit_or_credit: "debit",
          amount_cents: Number(bal),
          description: `FY${params.fiscal_year} close — income`,
        });
      }
    }

    if (t === "Expense" || t === "CostOfGoodsSold" || t === "OtherExpense") {
      const bal = debits - credits;
      if (bal > 0n) {
        lines.push({
          account_id: row.account_id,
          debit_or_credit: "credit",
          amount_cents: Number(bal),
          description: `FY${params.fiscal_year} close — expense`,
        });
      }
    }
  }

  if (lines.length === 0) return null;

  let reAccountId: string | null = null;
  // USMCA cross-entity-leak fix: pin the retained_earnings binding to this entity (prefer the entity-scoped
  // binding, fall back to a legacy global NULL-entity binding) AND require the resolved account to belong to
  // this entity — never resolve another entity's equity account. Identical for TRANSP.
  const reRes = await client.query<{ account_id: string }>(
    `
      SELECT arb.account_id::text AS account_id
      FROM catalogs.account_role_bindings arb
      JOIN catalogs.accounts a ON a.id = arb.account_id
      WHERE arb.role_key = 'retained_earnings'
        AND arb.deactivated_at IS NULL
        AND (arb.operating_company_id = $1::uuid OR arb.operating_company_id IS NULL)
        AND a.operating_company_id = $1::uuid
      ORDER BY (arb.operating_company_id IS NOT NULL) DESC
      LIMIT 1
    `,
    [params.operating_company_id]
  );
  reAccountId = reRes.rows[0]?.account_id ?? null;
  if (!reAccountId) {
    const fb = await client.query<{ id: string }>(
      `
        SELECT a.id::text
        FROM catalogs.accounts a
        INNER JOIN accounting.journal_entry_postings jep ON jep.account_id = a.id
        WHERE jep.operating_company_id = $1::uuid
          AND a.account_type = 'Equity'
        ORDER BY a.account_number NULLS LAST, a.account_name NULLS LAST
        LIMIT 1
      `,
      [params.operating_company_id]
    );
    reAccountId = fb.rows[0]?.id ?? null;
  }
  if (!reAccountId) {
    const anyEq = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM catalogs.accounts
        WHERE account_type = 'Equity'
          AND operating_company_id = $1::uuid
        ORDER BY account_number NULLS LAST
        LIMIT 1
      `,
      [params.operating_company_id]
    );
    reAccountId = anyEq.rows[0]?.id ?? null;
  }
  if (!reAccountId) throw new Error("retained_earnings_account_not_configured");

  const debitTotal = lines.filter((l) => l.debit_or_credit === "debit").reduce((s, l) => s + l.amount_cents, 0);
  const creditTotal = lines.filter((l) => l.debit_or_credit === "credit").reduce((s, l) => s + l.amount_cents, 0);
  const diff = debitTotal - creditTotal;
  if (diff > 0) {
    lines.push({
      account_id: reAccountId,
      debit_or_credit: "credit",
      amount_cents: diff,
      description: `FY${params.fiscal_year} retained earnings`,
    });
  } else if (diff < 0) {
    lines.push({
      account_id: reAccountId,
      debit_or_credit: "debit",
      amount_cents: -diff,
      description: `FY${params.fiscal_year} retained earnings`,
    });
  }

  const td = lines.filter((l) => l.debit_or_credit === "debit").reduce((s, l) => s + l.amount_cents, 0);
  const tc = lines.filter((l) => l.debit_or_credit === "credit").reduce((s, l) => s + l.amount_cents, 0);
  if (td !== tc) throw new Error("retained_earnings_close_unbalanced");

  const jeIns = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.journal_entries (
        operating_company_id,
        entry_date,
        memo,
        status,
        source,
        created_by_user_id,
        qbo_sync_pending,
        created_at,
        updated_at
      )
      VALUES ($1::uuid, $2::date, $3, 'posted', 'auto', $4::uuid, true, now(), now())
      RETURNING id::text
    `,
    [
      params.operating_company_id,
      params.period_end.slice(0, 10),
      `Fiscal year-end close FY${params.fiscal_year}`,
      params.closer_user_id,
    ]
  );
  const jeId = jeIns.rows[0]?.id;
  if (!jeId) throw new Error("closing_journal_insert_failed");

  let seq = 1;
  for (const ln of lines) {
    const lineRes = await client.query<{ id: string }>(
      `
        INSERT INTO accounting.journal_entry_postings (
          operating_company_id,
          journal_entry_uuid,
          line_sequence,
          account_id,
          debit_or_credit,
          amount_cents,
          description,
          idempotency_key,
          created_at,
          updated_at
        )
        VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8, now(), now())
        ON CONFLICT (operating_company_id, idempotency_key, line_sequence)
          WHERE idempotency_key IS NOT NULL DO NOTHING
        RETURNING id::text
      `,
      [
        params.operating_company_id,
        jeId,
        seq,
        ln.account_id,
        ln.debit_or_credit,
        ln.amount_cents,
        ln.description,
        // BLOCK 2: deterministic key per fiscal-year close so a re-run of the same year-end close is a
        // safe no-op (uq_jep_company_idempotency_line) — a double-posted retained-earnings close is the
        // worst-case duplicate, so this path is protected first.
        `period_close:FY${params.fiscal_year}:${params.period_end.slice(0, 10)}`,
      ]
    );
    // CODER-12 audit-spine: link each closing line to the fiscal-year close. Skip on a BLOCK-2
    // conflict no-op (no row returned).
    const postingId = lineRes.rows[0]?.id;
    if (postingId) {
      await writeTransactionSourceLink(client, {
        operating_company_id: params.operating_company_id,
        journal_entry_posting_id: postingId,
        linked_object_type: "period_close",
        linked_object_id: `FY${params.fiscal_year}`,
        relationship_role: "period_close",
      });
    }
    seq += 1;
  }

  // CODER-12 audit-spine: write the immutable audit event for the year-end close posting to
  // audit.audit_events (canonical, DB-trigger immutable per the blueprint), atomic with the GL write
  // and fail-loud-SAFE (audit_events' only CHECK is severity). NOT events.log_event (its
  // valid_subject_type CHECK rejects accounting subjects -> would roll back the close). This poster
  // previously wrote NO audit event — CODER-12 closes that gap.
  await appendCrudAudit(
    client,
    params.closer_user_id,
    "accounting.period_close.posted",
    {
      journal_entry_id: jeId,
      fiscal_year: params.fiscal_year,
      period_end: params.period_end.slice(0, 10),
    },
    "info",
    "CODER-12-PERIOD-CLOSE-SPINE"
  );

  return jeId;
}
