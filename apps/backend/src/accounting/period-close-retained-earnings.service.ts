import type { PoolClient } from "pg";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { writeTransactionSourceLink } from "./accounting-spine-emit.js";
import { resolveRoleAccountOptional } from "./coa-roles/resolver.service.js";
// ACCT-LINK-01 regression fix (GO-1405 Recipe B, 2026-08-29): this retained-earnings sweep JE
// insert never populated journal_entry_type_id -- one of several direct posters contributing to
// the live 46/2214 (2%) density gap. Leaf module, no accounting-service imports. ADJUSTING is the
// closest catalog code semantically (a period-end closing adjustment, not a source-document post).
import { hasJournalEntryTypeColumn, resolveJournalEntryTypeId } from "./journal-entry-type-resolver.js";

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
 *
 * LOCKED DESIGN (owner 2026-08-20; OWNER-DECISIONS-FINAL E7/E8 + blueprint 16825):
 *   - Fiscal year = calendar Jan–Dec. The sweep aggregates the FULL fiscal year
 *     (Jan 1 of fiscal_year → period_end), NEVER the closing period's own bounds — prod periods are
 *     monthly, so the old period_start window swept only December and understated Retained Earnings
 *     by ~11/12 of each year's net income (RETAINED-EARNINGS-SWEEP-SCOPED-TO-CLOSING-PERIOD row).
 *   - Re-close is IDEMPOTENT: if this fiscal year already has an unreversed posted closing JE, that
 *     JE is RETURNED — a second one is never posted. Undo = reverse the closing JE (canonical
 *     reverseJournalEntryNoFlip path), then close again: the fresh close posts under a
 *     reversal-count-scoped idempotency key so its lines can never ON-CONFLICT-collide with the
 *     reversed close's rows (PERIOD-RECLOSE-AFTER-REOPEN-IDEMPOTENCY-KEY-COLLISION row). The
 *     reversed-count discriminator mirrors BANK-F05: it rises only when someone reverses, never on
 *     a retry, so a double-submit still no-ops.
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

  // Idempotent re-close: an unreversed posted closing JE for this fiscal year IS the close — return
  // it. Reversed ones (the explicit undo path) are counted to scope the fresh close's idempotency
  // key past the dead rows.
  const priorCloses = await client.query<{ id: string; status: string; reversed: boolean }>(
    `
      SELECT DISTINCT je.id::text AS id, je.status::text AS status,
             (je.reversed_by_je_id IS NOT NULL) AS reversed
      FROM accounting.journal_entry_postings jep
      INNER JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
       AND je.operating_company_id = jep.operating_company_id
      WHERE jep.operating_company_id = $1::uuid
        AND jep.idempotency_key LIKE $2
    `,
    [params.operating_company_id, `period_close:FY${params.fiscal_year}:%`]
  );
  const liveClose = priorCloses.rows.find((r) => r.status === "posted" && !r.reversed);
  if (liveClose) return liveClose.id;
  const reversedCloseCount = priorCloses.rows.filter((r) => r.reversed).length;

  // FISCAL-YEAR window (Jan 1 → period_end), never the closing period's own start. A prior reversed
  // close and its reversal both fall inside this window and self-cancel, so the aggregation below
  // stays correct after an undo without any special-casing.
  const fiscalYearStart = `${params.fiscal_year}-01-01`;

  const agg = await client.query<{ account_id: string; account_type: string; debits: string; credits: string }>(
    `
      SELECT
        jep.account_id::text AS account_id,
        a.account_type::text AS account_type,
        SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE 0 END)::text AS debits,
        SUM(CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents ELSE 0 END)::text AS credits
      FROM accounting.journal_entry_postings jep
      INNER JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
      INNER JOIN catalogs.accounts a ON a.id = jep.account_id AND a.operating_company_id = jep.operating_company_id
      WHERE jep.operating_company_id = $1::uuid
        AND je.operating_company_id = $1::uuid
        AND je.status = 'posted'
        AND je.entry_date BETWEEN $2::date AND $3::date
      GROUP BY jep.account_id, a.account_type
    `,
    [params.operating_company_id, fiscalYearStart, params.period_end]
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

  // Resolve retained earnings via the CoA-roles resolver: PRIMARY accounting.chart_of_accounts_roles
  // first, then the legacy catalogs.account_role_bindings 'retained_earnings' binding as a fallback tier,
  // then the resolver's Equity account-shape fallback. The resolver pins BOTH the mapping row and the
  // resolved account to this entity (never another entity's equity account). The additional
  // entity-equity fallbacks below remain as last-resort tiers.
  let reAccountId: string | null = await resolveRoleAccountOptional(client, params.operating_company_id, "retained_earnings");
  if (!reAccountId) {
    const fb = await client.query<{ id: string }>(
      `
        SELECT a.id::text
        FROM catalogs.accounts a
        INNER JOIN accounting.journal_entry_postings jep ON jep.account_id = a.id AND jep.operating_company_id = a.operating_company_id
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

  const closeMemo = `Fiscal year-end close FY${params.fiscal_year}`;
  const closeTypeColPresent = await hasJournalEntryTypeColumn(client);
  const closeTypeId = closeTypeColPresent
    ? await resolveJournalEntryTypeId(client, { journal_entry_type_code: "ADJUSTING", source: "auto", memo: closeMemo })
    : null;
  const jeIns = closeTypeColPresent
    ? await client.query<{ id: string }>(
        `
      INSERT INTO accounting.journal_entries (
        operating_company_id,
        entry_date,
        memo,
        status,
        source,
        journal_entry_type_id,
        created_by_user_id,
        qbo_sync_pending,
        created_at,
        updated_at,
        -- ACCT-F353 stage 2 — a year-end retained-earnings sweep is an AGGREGATE across every P&L
        -- account for the fiscal year, not derived from one taggable source document; explicit
        -- false, matching ACCT-F212's policy (posting-engine.service.ts).
        is_sample_data
      )
      VALUES ($1::uuid, $2::date, $3, 'posted', 'auto', $4::uuid, $5::uuid, true, now(), now(), false)
      RETURNING id::text
    `,
        [params.operating_company_id, params.period_end.slice(0, 10), closeMemo, closeTypeId, params.closer_user_id]
      )
    : await client.query<{ id: string }>(
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
        updated_at,
        is_sample_data
      )
      VALUES ($1::uuid, $2::date, $3, 'posted', 'auto', $4::uuid, true, now(), now(), false)
      RETURNING id::text
    `,
        [params.operating_company_id, params.period_end.slice(0, 10), closeMemo, params.closer_user_id]
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
        // worst-case duplicate, so this path is protected first. LOCKED DESIGN 2026-08-20: the key is
        // scoped by the count of REVERSED prior closes (`:r{n}` suffix, absent on the first close so
        // pre-existing rows keep matching), so a legitimate close-after-undo can never
        // ON-CONFLICT-collide with the reversed close's rows and silently post a zero-line or
        // unbalanced JE.
        `period_close:FY${params.fiscal_year}:${params.period_end.slice(0, 10)}${reversedCloseCount > 0 ? `:r${reversedCloseCount}` : ""}`,
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
