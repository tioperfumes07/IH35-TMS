// Lead ROUND 296 approval (00-LEAD-APPROVAL-2026-10-02-FARO-LIFECYCLE-APPROVED-THREE-CORRECTIONS.md): Faro Default Interest
// is computed daily, shown on screen, and posted ONCE at month-end close, WITH APPROVAL — never by a job at night.
//
//   contract: 0.067% per day, compounded daily, from day 36 after the Purchase Date (30-day Repurchase Term + 5-day
//             Grace) — contract-config.ts, the one source of the numbers. BASE = Net Amount less the Factoring Fee: measured
//             on Faro's own Cash Reserve report, where every "Schedule Fee" (Faro's charge of this interest at collection)
//             equals 0.067%/day compounded on ~98.3% of Net for exactly the days past day 35 (11 of 11 rows).
//   events:   an account collected or repurchased before month end accrues at THAT moment (owner ruling 2026-10-02) —
//             an event run, same maker <> checker path, same account pair; month end then skips it.
//   entry:    DR 6830 Default Interest (default_interest_expense) / CR 2155 Accrued Factoring Interest
//             (factor_default_interest_payable). Never 2150: 2150 always equals the Net Amount of open Purchased Accounts.
//
// A run is one company's month. PROPOSE computes a line per open Purchased Account (interest through period end, less what
// earlier posted runs already accrued for that line) and posts nothing. APPROVE, by a DIFFERENT user (maker <> checker —
// also a CHECK in the table), posts one journal entry in the same transaction; every line is stamped to its invoice
// (source) and customer (entity). REJECT posts nothing. Faro's statement trues it up later.
import {
  FACTORING_DEFAULT_INTEREST_DAILY_RATE,
  FACTORING_INTEREST_ACCRUAL_AFTER_DAY,
} from "../accounting/factoring-posting/contract-config.js";
import { resolveRoleAccount } from "../accounting/coa-roles/resolver.service.js";
import { createJournalEntryOnClient } from "../accounting/journal-entries.service.js";
import { writeFactoringSpineLinks } from "./factoring-spine-links.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export const INTEREST_ACCRUAL_ROLES = new Set(["Owner", "Administrator", "Accountant"]);

export class InterestAccrualError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

/** Contract interest on `netCents` for `daysCharged` days: compounded daily, rounded to the cent each day. */
export function compoundedInterestCents(netCents: number, daysCharged: number): number {
  let balance = netCents;
  for (let d = 0; d < daysCharged; d += 1) balance += Math.round(balance * FACTORING_DEFAULT_INTEREST_DAILY_RATE);
  return balance - netCents;
}

export function periodBounds(period: string): { period_start: string; period_end: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  const month = m ? Number(m[2]) : 0;
  if (!m || month < 1 || month > 12) throw new InterestAccrualError("invalid_period");
  const year = Number(m[1]);
  const end = new Date(Date.UTC(year, month, 0));
  return { period_start: `${m[1]}-${m[2]}-01`, period_end: end.toISOString().slice(0, 10) };
}

export type InterestAccrualLine = {
  purchase_id: string;
  purchase_display_id: string | null;
  purchase_line_id: string;
  invoice_id: string;
  invoice_display_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  purchase_date: string;
  net_cents: number;
  days_charged: number;
  cumulative_interest_cents: number;
  previously_accrued_cents: number;
  accrual_cents: number;
};

/**
 * Lines for `periodEnd`: every Purchased Account open at period end (purchase posted, line live, purchased on or before the
 * period end, invoice neither paid nor void, not marked collected on or before period end) and past day 35.
 */
export async function computeInterestAccrualLines(client: DbClient, oci: string, periodEnd: string): Promise<InterestAccrualLine[]> {
  const res = await client.query<Record<string, unknown>>(
    `
      SELECT p.id::text AS purchase_id, p.display_id AS purchase_display_id, l.id::text AS purchase_line_id,
             l.invoice_id::text, i.display_id AS invoice_display_id, l.customer_id::text, c.customer_name,
             p.purchase_date::text, (l.gross_cents - l.fee_cents)::text AS net_cents,
             GREATEST(($2::date - p.purchase_date) - $3::int, 0) AS days_charged,
             COALESCE((
               SELECT sum(rl.accrual_cents) FROM accounting.factoring_interest_accrual_run_lines rl
                 JOIN accounting.factoring_interest_accrual_runs r ON r.id = rl.run_id
                WHERE rl.purchase_line_id = l.id AND r.state = 'posted' AND r.period_end < $2::date
             ), 0)::text AS previously_accrued_cents
        FROM accounting.factoring_purchase_lines l
        JOIN accounting.factoring_purchases p ON p.id = l.purchase_id AND p.operating_company_id = l.operating_company_id
        JOIN accounting.invoices i ON i.id = l.invoice_id AND i.operating_company_id = l.operating_company_id
        LEFT JOIN mdata.customers c ON c.id = l.customer_id
       WHERE l.operating_company_id = $1::uuid
         AND l.voided_at IS NULL AND p.status = 'posted' AND p.voided_at IS NULL AND p.is_sample_data IS NOT TRUE
         AND p.purchase_date <= $2::date
         AND i.voided_at IS NULL AND i.status NOT IN ('paid', 'void')
         AND NOT EXISTS (
           SELECT 1 FROM accounting.factoring_repurchase_due_events e
            WHERE e.purchase_line_id = l.id AND e.state = 'marked_collected' AND e.decided_at::date <= $2::date
         )
         -- Collected on or before the period end (Faro's Transfer Escrow to Cash is printed on the collection date): its
         -- interest accrues at that event (event run), not at month end.
         AND NOT EXISTS (
           SELECT 1 FROM accounting.faro_reserve_entries fe
            WHERE fe.operating_company_id = l.operating_company_id AND fe.faro_invoice_number = l.faro_invoice_number
              AND fe.entry_kind = 'escrow_to_cash' AND fe.entry_date <= $2::date
         )
         AND ($2::date - p.purchase_date) > $3::int
       ORDER BY p.purchase_date, i.display_id
    `,
    [oci, periodEnd, FACTORING_INTEREST_ACCRUAL_AFTER_DAY]
  );
  return res.rows
    .map((r) => {
      const net = Number(r.net_cents ?? 0);
      const days = Number(r.days_charged ?? 0);
      const cumulative = compoundedInterestCents(net, days);
      const previous = Number(r.previously_accrued_cents ?? 0);
      return {
        ...(r as unknown as InterestAccrualLine),
        net_cents: net,
        days_charged: days,
        cumulative_interest_cents: cumulative,
        previously_accrued_cents: previous,
        accrual_cents: Math.max(cumulative - previous, 0),
      };
    })
    .filter((l) => l.accrual_cents > 0 && l.cumulative_interest_cents >= l.previously_accrued_cents);
}

export async function previewInterestAccrual(client: DbClient, oci: string, period: string) {
  const { period_start, period_end } = periodBounds(period);
  const lines = await computeInterestAccrualLines(client, oci, period_end);
  return { period, period_start, period_end, lines, total_cents: lines.reduce((s, l) => s + l.accrual_cents, 0) };
}

/** Maker: records the month's accrual as a proposal. Posts nothing. */
export async function proposeInterestAccrual(
  client: DbClient,
  input: { operating_company_id: string; period: string; actor_user_id: string }
): Promise<{ run_id: string; line_count: number; total_cents: number }> {
  const preview = await previewInterestAccrual(client, input.operating_company_id, input.period);
  if (preview.lines.length === 0) throw new InterestAccrualError("interest_accrual_nothing_to_accrue");
  const live = await client.query(
    `SELECT 1 FROM accounting.factoring_interest_accrual_runs
      WHERE operating_company_id = $1::uuid AND period_end = $2::date AND state IN ('proposed', 'posted') AND run_kind = 'period_close'`,
    [input.operating_company_id, preview.period_end]
  );
  if (live.rows.length) throw new InterestAccrualError("interest_accrual_run_exists_for_period");
  const run = await client.query<{ id: string }>(
    `INSERT INTO accounting.factoring_interest_accrual_runs
       (operating_company_id, period_start, period_end, line_count, total_cents, proposed_by_user_id)
     VALUES ($1::uuid, $2::date, $3::date, $4, $5, $6::uuid) RETURNING id::text`,
    [input.operating_company_id, preview.period_start, preview.period_end, preview.lines.length, preview.total_cents, input.actor_user_id]
  );
  const runId = run.rows[0]!.id;
  for (const l of preview.lines) {
    await client.query(
      `INSERT INTO accounting.factoring_interest_accrual_run_lines
         (operating_company_id, run_id, purchase_id, purchase_line_id, invoice_id, customer_id, purchase_date,
          net_cents, days_charged, cumulative_interest_cents, previously_accrued_cents, accrual_cents)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::date, $8, $9, $10, $11, $12)`,
      [
        input.operating_company_id, runId, l.purchase_id, l.purchase_line_id, l.invoice_id, l.customer_id, l.purchase_date,
        l.net_cents, l.days_charged, l.cumulative_interest_cents, l.previously_accrued_cents, l.accrual_cents,
      ]
    );
  }
  return { run_id: runId, line_count: preview.lines.length, total_cents: preview.total_cents };
}

/** Checker: a second user approves (posts one JE, DR 6830 / CR 2155 per line) or rejects (posts nothing). */
export async function decideInterestAccrual(
  client: DbClient,
  input: {
    operating_company_id: string;
    run_id: string;
    decision: "approve" | "reject";
    note?: string | null;
    actor_user_id: string;
    actor_role: string;
  }
): Promise<{ run_id: string; state: string; journal_entry_id: string | null }> {
  const cur = await client.query<{ state: string; proposed_by_user_id: string; period_end: string; total_cents: string }>(
    `SELECT state, proposed_by_user_id::text, period_end::text, total_cents::text
       FROM accounting.factoring_interest_accrual_runs
      WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
    [input.run_id, input.operating_company_id]
  );
  const run = cur.rows[0];
  if (!run) throw new InterestAccrualError("interest_accrual_run_not_found");
  if (run.state !== "proposed") throw new InterestAccrualError("interest_accrual_run_already_decided");
  if (run.proposed_by_user_id === input.actor_user_id) throw new InterestAccrualError("interest_accrual_maker_cannot_approve");

  if (input.decision === "reject") {
    await client.query(
      `UPDATE accounting.factoring_interest_accrual_runs
          SET state = 'rejected', decided_by_user_id = $3::uuid, decided_at = now(), decision_note = $4
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [input.run_id, input.operating_company_id, input.actor_user_id, input.note ?? null]
    );
    return { run_id: input.run_id, state: "rejected", journal_entry_id: null };
  }

  const lines = await client.query<{ invoice_id: string; customer_id: string | null; accrual_cents: string; invoice_display_id: string | null }>(
    `SELECT rl.invoice_id::text, rl.customer_id::text, rl.accrual_cents::text, i.display_id AS invoice_display_id
       FROM accounting.factoring_interest_accrual_run_lines rl
       JOIN accounting.invoices i ON i.id = rl.invoice_id
      WHERE rl.run_id = $1::uuid AND rl.operating_company_id = $2::uuid AND rl.accrual_cents > 0
      ORDER BY i.display_id`,
    [input.run_id, input.operating_company_id]
  );
  const total = lines.rows.reduce((s, l) => s + Number(l.accrual_cents), 0);
  if (total <= 0 || total !== Number(run.total_cents)) throw new InterestAccrualError("interest_accrual_run_lines_do_not_tie");

  const expenseAccount = await resolveRoleAccount(client as never, input.operating_company_id, "default_interest_expense");
  const payableAccount = await resolveRoleAccount(client as never, input.operating_company_id, "factor_default_interest_payable");
  const memo = `Faro default interest accrual through ${run.period_end}`;
  const postings = lines.rows.flatMap((l) => {
    const stamp = {
      source_transaction_type: "invoice",
      source_transaction_id: l.invoice_id,
      ...(l.customer_id ? { entity_type: "customer" as const, entity_uuid: l.customer_id } : {}),
    };
    const amount = Number(l.accrual_cents);
    return [
      { account_id: expenseAccount, debit_or_credit: "debit" as const, amount_cents: amount, description: `${memo} — ${l.invoice_display_id ?? "invoice"}`, ...stamp },
      { account_id: payableAccount, debit_or_credit: "credit" as const, amount_cents: amount, description: `${memo} — ${l.invoice_display_id ?? "invoice"}`, ...stamp },
    ];
  });
  const je = await createJournalEntryOnClient(
    client as never,
    { operating_company_id: input.operating_company_id, entry_date: run.period_end, memo, source: "auto", postings },
    { userId: input.actor_user_id, role: input.actor_role }
  );
  // Owner ruling 2026-10-02: each leg is linked to its invoice on the spine (transaction_source_links).
  await writeFactoringSpineLinks(client, input.operating_company_id, je.id, "factoring_default_interest");
  await client.query(
    `UPDATE accounting.factoring_interest_accrual_runs
        SET state = 'posted', decided_by_user_id = $3::uuid, decided_at = now(), decision_note = $4, journal_entry_id = $5::uuid
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [input.run_id, input.operating_company_id, input.actor_user_id, input.note ?? null, je.id]
  );
  return { run_id: input.run_id, state: "posted", journal_entry_id: je.id };
}

export async function listInterestAccrualRuns(client: DbClient, oci: string) {
  const res = await client.query<Record<string, unknown>>(
    `SELECT r.id::text, r.period_start::text, r.period_end::text, r.state, r.line_count, r.total_cents::text,
            r.proposed_by_user_id::text, r.proposed_at::text, r.decided_by_user_id::text, r.decided_at::text,
            r.decision_note, r.journal_entry_id::text, r.run_kind, r.event_purchase_line_id::text,
            ev.invoice_id::text AS event_invoice_id, ei.display_id AS event_invoice_display_id, ev.faro_invoice_number AS event_faro_invoice_number
       FROM accounting.factoring_interest_accrual_runs r
       LEFT JOIN accounting.factoring_purchase_lines ev ON ev.id = r.event_purchase_line_id
       LEFT JOIN accounting.invoices ei ON ei.id = ev.invoice_id
      WHERE r.operating_company_id = $1::uuid
      ORDER BY r.period_end DESC, r.proposed_at DESC`,
    [oci]
  );
  return res.rows.map((r) => ({ ...r, total_cents: Number(r.total_cents ?? 0) }));
}

/**
 * Open Net Amount of Purchased Accounts vs the 2150 balance — the one-line subledger-to-GL proof (Correction 2). Every
 * posted, live purchase line counts until a repurchase / Faro collection relieves 2150; the relief posters (next block)
 * extend "open" with their own document, so the two sides move together.
 */
export async function advanceLiabilityTiesToOpenNet(client: DbClient, oci: string) {
  const res = await client.query<{ gl_cents: string; open_net_cents: string }>(
    `
      SELECT
        COALESCE((
          SELECT sum(CASE WHEN jp.debit_or_credit = 'credit' THEN jp.amount_cents ELSE -jp.amount_cents END)
            FROM accounting.journal_entry_postings jp
            JOIN accounting.journal_entries je ON je.id = jp.journal_entry_uuid AND je.status = 'posted'
            JOIN accounting.chart_of_accounts_roles r
              ON r.account_id = jp.account_id AND r.role = 'factoring_advance_liability'
             AND r.operating_company_id = je.operating_company_id AND r.is_active
           WHERE je.operating_company_id = $1::uuid
        ), 0)::text AS gl_cents,
        COALESCE((
          SELECT sum(l.gross_cents)
            FROM accounting.factoring_purchase_lines l
            JOIN accounting.factoring_purchases p ON p.id = l.purchase_id
           WHERE l.operating_company_id = $1::uuid AND l.voided_at IS NULL AND p.status = 'posted' AND p.voided_at IS NULL
        ), 0)::text AS open_net_cents
    `,
    [oci]
  );
  const gl = Number(res.rows[0]?.gl_cents ?? 0);
  const open = Number(res.rows[0]?.open_net_cents ?? 0);
  return { gl_2150_cents: gl, open_net_cents: open, ties: gl === open };
}

/** Days charged (past day 35) for a purchase made on `purchaseDate`, through `through`. */
function daysCharged(purchaseDate: string, through: string): number {
  const ms = Date.parse(`${through}T00:00:00Z`) - Date.parse(`${purchaseDate.slice(0, 10)}T00:00:00Z`);
  return Math.max(Math.round(ms / 86_400_000) - FACTORING_INTEREST_ACCRUAL_AFTER_DAY, 0);
}

/**
 * Interest position of ONE Purchased Account through `through`: contract interest to date, what posted runs (period-close
 * or event) already accrued for it, and whether an event run for that date is waiting for approval.
 */
export async function interestPositionThrough(client: DbClient, oci: string, purchaseLineId: string, through: string) {
  const r = await client.query<Record<string, string | null>>(
    `SELECT l.id::text AS purchase_line_id, l.purchase_id::text, l.invoice_id::text, l.customer_id::text, p.purchase_date::text,
            (l.gross_cents - l.fee_cents)::text AS net_cents,
            COALESCE((SELECT sum(rl.accrual_cents) FROM accounting.factoring_interest_accrual_run_lines rl
                        JOIN accounting.factoring_interest_accrual_runs r ON r.id = rl.run_id
                       WHERE rl.purchase_line_id = l.id AND r.state = 'posted' AND r.period_end <= $3::date), 0)::text AS accrued_cents,
            (SELECT r.id::text FROM accounting.factoring_interest_accrual_runs r
              WHERE r.event_purchase_line_id = l.id AND r.period_end = $3::date AND r.state = 'proposed' AND r.run_kind = 'event') AS pending_run_id
       FROM accounting.factoring_purchase_lines l
       JOIN accounting.factoring_purchases p ON p.id = l.purchase_id AND p.status = 'posted' AND p.voided_at IS NULL
      WHERE l.id = $2::uuid AND l.operating_company_id = $1::uuid AND l.voided_at IS NULL`,
    [oci, purchaseLineId, through]
  );
  const row = r.rows[0];
  if (!row) throw new InterestAccrualError("interest_event_purchase_line_not_posted");
  const net = Number(row.net_cents);
  const days = daysCharged(row.purchase_date!, through);
  const cumulative = compoundedInterestCents(net, days);
  const accrued = Number(row.accrued_cents);
  return {
    purchase_line_id: row.purchase_line_id!, purchase_id: row.purchase_id!, invoice_id: row.invoice_id!, customer_id: row.customer_id,
    purchase_date: row.purchase_date!, net_cents: net, days_charged: days, cumulative_interest_cents: cumulative,
    accrued_cents: accrued, due_cents: Math.max(cumulative - accrued, 0), pending_run_id: row.pending_run_id ?? null,
  };
}

/**
 * Maker, at the event (collection / repurchase): propose the one-account accrual through `eventDate`. Posts nothing — a
 * DIFFERENT user approves it with decideInterestAccrual, exactly like the month-end run. Returns null when nothing is due.
 */
export async function proposeEventInterestAccrual(
  client: DbClient,
  input: { operating_company_id: string; purchase_line_id: string; event_date: string; actor_user_id: string }
): Promise<{ run_id: string; accrual_cents: number; pending: boolean } | null> {
  const pos = await interestPositionThrough(client, input.operating_company_id, input.purchase_line_id, input.event_date);
  if (pos.pending_run_id) return { run_id: pos.pending_run_id, accrual_cents: pos.due_cents, pending: true };
  if (pos.due_cents <= 0) return null;
  const run = await client.query<{ id: string }>(
    `INSERT INTO accounting.factoring_interest_accrual_runs
       (operating_company_id, period_start, period_end, line_count, total_cents, proposed_by_user_id, run_kind, event_purchase_line_id)
     VALUES ($1::uuid, $2::date, $2::date, 1, $3, $4::uuid, 'event', $5::uuid) RETURNING id::text`,
    [input.operating_company_id, input.event_date, pos.due_cents, input.actor_user_id, input.purchase_line_id]
  );
  const runId = run.rows[0]!.id;
  await client.query(
    `INSERT INTO accounting.factoring_interest_accrual_run_lines
       (operating_company_id, run_id, purchase_id, purchase_line_id, invoice_id, customer_id, purchase_date,
        net_cents, days_charged, cumulative_interest_cents, previously_accrued_cents, accrual_cents)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::date, $8, $9, $10, $11, $12)`,
    [
      input.operating_company_id, runId, pos.purchase_id, pos.purchase_line_id, pos.invoice_id, pos.customer_id, pos.purchase_date,
      pos.net_cents, pos.days_charged, pos.cumulative_interest_cents, pos.accrued_cents, pos.due_cents,
    ]
  );
  return { run_id: runId, accrual_cents: pos.due_cents, pending: true };
}
