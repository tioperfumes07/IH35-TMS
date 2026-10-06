/**
 * ROUND 313 CC-1 #2 — BANK-TIEOUT-01. Every live bank account's feed balance must equal the GL balance of its
 * ledger_account_id, or the difference must be explained line by line.
 *   feed balance  banking.bank_accounts.current_balance_cents (the feed keeps only the current value)
 *   GL balance    accounting.fn_account_balances_as_of(company, day) closing for ledger_account_id — the same
 *                 function the drift engine and account balances use (reused, never reimplemented)
 *   feed-only     feed lines on the account not posted to the GL (no matched_journal_entry_id), not voided /
 *                 merged / pending, dated on or after the ledger account's first GL posting (lines before the
 *                 books existed are history, not a difference). Signed the canonical way: +|amount| when
 *                 is_credit (deposit), −|amount| otherwise (banking/adjusted-balance-rec.ts).
 *   GL-only       postings on ledger_account_id (same population as fn_account_balances_as_of: journal not
 *                 voided, batch posted/reversed or none) whose journal entry no feed line on this account matches.
 *   explained     feed-only − GL-only;  unexplained = (feed − GL) − explained.
 */
import { naturalSignFactor } from "../accounting/natural-sign.js";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { LEDGER_POSTING_COUNTS_SQL } from "../accounting/ledger-membership.js";

export type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type TieoutStatus = "tied" | "explained" | "unexplained" | "no_gl_account";
export const STALE_FEED_HOURS = 24;

/** Pure: classify one account's tie-out. */
export function classifyTieout(input: {
  ledger_account_id: string | null;
  feed_balance_cents: number;
  gl_balance_cents: number | null;
  feed_only_cents: number;
  gl_only_cents: number;
  tolerance_cents: number;
}): { status: TieoutStatus; diff_cents: number | null; unexplained_cents: number | null } {
  if (!input.ledger_account_id || input.gl_balance_cents == null) return { status: "no_gl_account", diff_cents: null, unexplained_cents: null };
  const diff = input.feed_balance_cents - input.gl_balance_cents;
  const unexplained = diff - (input.feed_only_cents - input.gl_only_cents);
  const tol = Math.max(0, input.tolerance_cents);
  if (Math.abs(diff) <= tol) return { status: "tied", diff_cents: diff, unexplained_cents: unexplained };
  if (Math.abs(unexplained) <= tol) return { status: "explained", diff_cents: diff, unexplained_cents: unexplained };
  return { status: "unexplained", diff_cents: diff, unexplained_cents: unexplained };
}

const FEED_ONLY_SQL = `
  FROM banking.bank_transactions bt
 WHERE bt.operating_company_id = $1::uuid AND bt.bank_account_id = $2::uuid
   AND bt.voided_at IS NULL AND bt.merged_into_bank_transaction_id IS NULL AND COALESCE(bt.pending, false) = false
   AND bt.matched_journal_entry_id IS NULL
   AND bt.transaction_date <= $4::date
   AND bt.transaction_date >= COALESCE((
         SELECT min(je.entry_date) FROM accounting.journal_entry_postings p
           JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
          WHERE p.operating_company_id = $1::uuid AND p.account_id = $3::uuid AND je.status <> 'voided'), $4::date + 1)`;

const GL_ONLY_SQL = `
  FROM accounting.journal_entry_postings p
  JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
  LEFT JOIN accounting.posting_batches pb ON pb.id = p.posting_batch_id AND pb.operating_company_id = p.operating_company_id
 WHERE p.operating_company_id = $1::uuid AND p.account_id = $3::uuid
   AND ${LEDGER_POSTING_COUNTS_SQL}
   AND je.entry_date <= $4::date
   AND NOT EXISTS (SELECT 1 FROM banking.bank_transactions bt
                    WHERE bt.operating_company_id = $1::uuid AND bt.bank_account_id = $2::uuid
                      AND bt.matched_journal_entry_id = je.id AND bt.voided_at IS NULL)`;

type AccountRow = { id: string; ledger_account_id: string | null; current_balance_cents: string; last_synced_at: string | null; drift_tolerance_cents: string | null; label: string };

export async function computeTieouts(client: DbClient, opco: string, day: string, bankAccountId?: string) {
  const accts = await client.query<AccountRow>(
    `SELECT id::text, ledger_account_id::text, current_balance_cents::text, last_synced_at::text, drift_tolerance_cents::text,
            COALESCE(display_name, account_name, institution_name, account_mask) AS label
       FROM banking.bank_accounts
      WHERE operating_company_id = $1::uuid AND is_active = true AND deactivated_at IS NULL
        AND ($2::uuid IS NULL OR id = $2::uuid)
      ORDER BY display_order NULLS LAST, label`,
    [opco, bankAccountId ?? null]
  );
  if (!accts.rows.length) return [];
  const gl = await client.query<{ account_id: string; closing_balance_cents: string; normal_balance: string }>(
    `SELECT account_id::text, closing_balance_cents::text, normal_balance::text FROM accounting.fn_account_balances_as_of($1::uuid, $2::date, NULL)`,
    [opco, day]
  );
  const glBy = new Map(gl.rows.map((r) => [r.account_id, Number(r.closing_balance_cents)]));
  // NATURAL SIGN (ROUND 433): the feed reports a card's balance as the amount OWED (positive); the ledger holds a
  // liability raw (debit − credit = −owed). Every ledger-side amount is put in the account's natural direction
  // before it is compared with the feed, or a card would show twice its balance as drift.
  const signBy = new Map(gl.rows.map((r) => [r.account_id, naturalSignFactor(r.normal_balance)]));
  const out = [];
  for (const a of accts.rows) {
    const feed = Number(a.current_balance_cents ?? 0);
    const tol = Number(a.drift_tolerance_cents ?? 0);
    let feedOnly = { cents: 0, count: 0 };
    let glOnly = { cents: 0, count: 0 };
    let glBal: number | null = null;
    if (a.ledger_account_id) {
      glBal = glBy.get(a.ledger_account_id) ?? 0; // no postings at all = a GL balance of 0, not unknown
      const f = await client.query<{ c: string; n: string }>(
        `SELECT COALESCE(sum(CASE WHEN bt.is_credit THEN abs(bt.amount_cents) ELSE -abs(bt.amount_cents) END), 0)::text AS c, count(*)::text AS n ${FEED_ONLY_SQL}`,
        [opco, a.id, a.ledger_account_id, day]
      );
      const g = await client.query<{ c: string; n: string }>(
        `SELECT COALESCE(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text AS c, count(*)::text AS n ${GL_ONLY_SQL}`,
        [opco, a.id, a.ledger_account_id, day]
      );
      feedOnly = { cents: Number(f.rows[0]?.c ?? 0), count: Number(f.rows[0]?.n ?? 0) };
      glOnly = { cents: Number(g.rows[0]?.c ?? 0), count: Number(g.rows[0]?.n ?? 0) };
    }
    if (a.ledger_account_id) {
      const k = signBy.get(a.ledger_account_id) ?? 1;
      glBal = glBal == null ? null : glBal * k;
      feedOnly = { ...feedOnly, cents: feedOnly.cents * k };
      glOnly = { ...glOnly, cents: glOnly.cents * k };
    }
    const cls = classifyTieout({ ledger_account_id: a.ledger_account_id, feed_balance_cents: feed, gl_balance_cents: glBal, feed_only_cents: feedOnly.cents, gl_only_cents: glOnly.cents, tolerance_cents: tol });
    const stale = !a.last_synced_at || Date.now() - new Date(a.last_synced_at).getTime() > STALE_FEED_HOURS * 3_600_000;
    out.push({
      bank_account_id: a.id,
      label: a.label,
      ledger_account_id: a.ledger_account_id,
      tieout_date: day,
      feed_balance_cents: feed,
      feed_synced_at: a.last_synced_at,
      gl_balance_cents: glBal,
      feed_only_cents: feedOnly.cents,
      feed_only_count: feedOnly.count,
      gl_only_cents: glOnly.cents,
      gl_only_count: glOnly.count,
      tolerance_cents: tol,
      ...cls,
      explained_by: {
        feed_only: { cents: feedOnly.cents, count: feedOnly.count, meaning: "bank lines not yet posted to the GL" },
        gl_only: { cents: glOnly.cents, count: glOnly.count, meaning: "GL lines no bank line matches (outstanding / book-only)" },
        stale_feed: stale ? { last_synced_at: a.last_synced_at, hours: STALE_FEED_HOURS } : null,
      },
    });
  }
  return out;
}

export async function persistTieouts(client: DbClient, opco: string, rows: Awaited<ReturnType<typeof computeTieouts>>) {
  for (const r of rows) {
    await client.query(
      `INSERT INTO banking.bank_account_tieouts
         (operating_company_id, bank_account_id, ledger_account_id, tieout_date, feed_balance_cents, feed_synced_at, gl_balance_cents, diff_cents,
          feed_only_cents, feed_only_count, gl_only_cents, gl_only_count, unexplained_cents, tolerance_cents, status, explained_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5, $6::timestamptz, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
       ON CONFLICT (bank_account_id, tieout_date) DO UPDATE SET
         ledger_account_id = EXCLUDED.ledger_account_id, feed_balance_cents = EXCLUDED.feed_balance_cents, feed_synced_at = EXCLUDED.feed_synced_at,
         gl_balance_cents = EXCLUDED.gl_balance_cents, diff_cents = EXCLUDED.diff_cents, feed_only_cents = EXCLUDED.feed_only_cents,
         feed_only_count = EXCLUDED.feed_only_count, gl_only_cents = EXCLUDED.gl_only_cents, gl_only_count = EXCLUDED.gl_only_count,
         unexplained_cents = EXCLUDED.unexplained_cents, tolerance_cents = EXCLUDED.tolerance_cents, status = EXCLUDED.status,
         explained_by = EXCLUDED.explained_by, computed_at = now()`,
      [opco, r.bank_account_id, r.ledger_account_id, r.tieout_date, r.feed_balance_cents, r.feed_synced_at, r.gl_balance_cents, r.diff_cents,
       r.feed_only_cents, r.feed_only_count, r.gl_only_cents, r.gl_only_count, r.unexplained_cents, r.tolerance_cents, r.status, JSON.stringify(r.explained_by)]
    );
  }
}

/** The difference drill: the actual feed-only and GL-only lines. */
export async function tieoutDrill(client: DbClient, opco: string, bankAccountId: string, day: string) {
  const a = await client.query<{ ledger_account_id: string | null }>(
    `SELECT ledger_account_id::text FROM banking.bank_accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [bankAccountId, opco]
  );
  const ledger = a.rows[0]?.ledger_account_id ?? null;
  if (!ledger) return { ledger_account_id: null, feed_only: [], gl_only: [] };
  const feed = await client.query(
    `SELECT bt.id::text AS bank_transaction_id, bt.transaction_date::text, bt.description, bt.status,
            bt.matched_factoring_advance_id::text,
            (SELECT fp.id::text FROM accounting.factoring_purchases fp
              WHERE fp.factoring_advance_id = bt.matched_factoring_advance_id AND fp.voided_at IS NULL
              LIMIT 1) AS factoring_purchase_id,
            (CASE WHEN bt.is_credit THEN abs(bt.amount_cents) ELSE -abs(bt.amount_cents) END)::bigint AS signed_cents
     ${FEED_ONLY_SQL} ORDER BY bt.transaction_date DESC, bt.id LIMIT 500`,
    [opco, bankAccountId, ledger, day]
  );
  const gl = await client.query(
    `SELECT je.id::text AS journal_entry_id, je.entry_date::text, je.memo, p.source_transaction_type, p.source_transaction_id::text,
            (CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END)::bigint AS signed_cents
     ${GL_ONLY_SQL} ORDER BY je.entry_date DESC, je.id LIMIT 500`,
    [opco, bankAccountId, ledger, day]
  );
  return { ledger_account_id: ledger, feed_only: feed.rows, gl_only: gl.rows };
}

export const todayCT = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());

/** Nightly: one short transaction per entity. */
export async function runBankTieoutCronTick(): Promise<void> {
  const companies = await withLuciaBypass(async (client) =>
    (await (client as DbClient).query<{ id: string }>(`SELECT id::text FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY 1`)).rows
  );
  const day = todayCT();
  for (const c of companies) {
    assertTenantContext(c.id, "banking.bank_tieout_cron");
    await withLuciaBypass(async (client) => {
      // membership-scope-exempt: internally-iterated-active-company
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [c.id]);
      await persistTieouts(client as DbClient, c.id, await computeTieouts(client as DbClient, c.id, day));
    });
  }
}

