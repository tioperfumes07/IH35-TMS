// Lead ROUND 296 / 297 + owner (2026-10-02): "WHEN RECOURSE TIME ARRIVES IT MUST ASK, NOT RECOURSE AUTOMATICALLY."
//
// Day 95 from a purchase date is the Repurchase Deadline (contract-config.ts). A purchased account still open on that
// day becomes ONE obligation event in the owner's decision queue (accounting.factoring_repurchase_due_events) — never a
// journal entry. The owner answers EXTEND (a new due date; the event asks again then), CONFIRM REPURCHASE (the
// repurchase posts later, when Faro's deduction or our payment is matched in Banking — the one bank-match engine), or
// MARK COLLECTED (the customer paid Faro). There is no default action.
//
// Nothing in this module writes a journal entry, posting, bill, payment or invoice status. Guard:
// scripts/verify-day95-asks-never-recourses.mjs.
import { FACTORING_REPURCHASE_DEADLINE_DAYS } from "../accounting/factoring-posting/contract-config.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export const REPURCHASE_DUE_DECISIONS = ["extend", "confirm_repurchase", "mark_collected"] as const;
export type RepurchaseDueDecision = (typeof REPURCHASE_DUE_DECISIONS)[number];

const DECISION_STATE: Record<RepurchaseDueDecision, string> = {
  extend: "extended",
  confirm_repurchase: "repurchase_confirmed",
  mark_collected: "marked_collected",
};

/**
 * Register (alert only) every purchased account open on its due date, and re-ask every extension whose new date has
 * arrived. Idempotent: one event per purchase line. A purchased account is open while its line and purchase are live
 * (posted, not voided) and its invoice is neither paid nor void.
 */
export async function registerRepurchaseDueEvents(
  client: DbClient,
  operatingCompanyId: string,
  asOf: string
): Promise<{ registered: number; reasked: number }> {
  const inserted = await client.query(
    `
      INSERT INTO accounting.factoring_repurchase_due_events
        (operating_company_id, factor_vendor_id, purchase_id, purchase_line_id, invoice_id, customer_id,
         purchase_date, due_date, gross_cents)
      SELECT l.operating_company_id, p.factoring_company_vendor_id, p.id, l.id, l.invoice_id, l.customer_id,
             p.purchase_date, p.purchase_date + $3::int, l.gross_cents
      FROM accounting.factoring_purchase_lines l
      JOIN accounting.factoring_purchases p ON p.id = l.purchase_id AND p.operating_company_id = l.operating_company_id
      JOIN accounting.invoices i ON i.id = l.invoice_id AND i.operating_company_id = l.operating_company_id
      WHERE l.operating_company_id = $1::uuid
        AND l.voided_at IS NULL
        AND p.status = 'posted'
        AND p.voided_at IS NULL
        AND p.is_sample_data IS NOT TRUE
        AND i.voided_at IS NULL
        AND i.status NOT IN ('paid', 'void')
        AND p.purchase_date + $3::int <= $2::date
      ON CONFLICT (purchase_line_id) DO NOTHING
    `,
    [operatingCompanyId, asOf, FACTORING_REPURCHASE_DEADLINE_DAYS]
  );
  const reasked = await client.query(
    `
      UPDATE accounting.factoring_repurchase_due_events
         SET state = 'awaiting_owner', due_date = extended_to
       WHERE operating_company_id = $1::uuid
         AND state = 'extended'
         AND extended_to <= $2::date
    `,
    [operatingCompanyId, asOf]
  );
  return { registered: inserted.rowCount ?? 0, reasked: reasked.rowCount ?? 0 };
}

export type RepurchaseDueRow = {
  id: string;
  state: string;
  purchase_id: string;
  purchase_display_id: string | null;
  purchase_line_id: string;
  invoice_id: string;
  invoice_display_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  factor_vendor_id: string | null;
  factor_name: string | null;
  purchase_date: string;
  due_date: string;
  days_since_purchase: number;
  gross_cents: number;
  extended_to: string | null;
  decided_by_user_id: string | null;
  decided_at: string | null;
  decision_note: string | null;
};

export async function listRepurchaseDue(
  client: DbClient,
  operatingCompanyId: string,
  asOf: string,
  state: "awaiting_owner" | "all" = "awaiting_owner"
): Promise<RepurchaseDueRow[]> {
  const res = await client.query<Record<string, unknown>>(
    `
      SELECT e.id::text, e.state, e.purchase_id::text, p.display_id AS purchase_display_id, e.purchase_line_id::text,
             e.invoice_id::text, i.display_id AS invoice_display_id, e.customer_id::text, c.customer_name,
             e.factor_vendor_id::text, v.vendor_name AS factor_name,
             e.purchase_date::text, e.due_date::text, ($2::date - e.purchase_date)::int AS days_since_purchase,
             e.gross_cents::text, e.extended_to::text, e.decided_by_user_id::text, e.decided_at::text, e.decision_note
      FROM accounting.factoring_repurchase_due_events e
      JOIN accounting.factoring_purchases p ON p.id = e.purchase_id
      JOIN accounting.invoices i ON i.id = e.invoice_id
      LEFT JOIN mdata.customers c ON c.id = e.customer_id
      LEFT JOIN mdata.vendors v ON v.id = e.factor_vendor_id
      WHERE e.operating_company_id = $1::uuid
        AND ($3::text = 'all' OR e.state = 'awaiting_owner')
      ORDER BY e.due_date ASC, i.display_id ASC
    `,
    [operatingCompanyId, asOf, state]
  );
  return res.rows.map((r) => ({
    ...(r as unknown as RepurchaseDueRow),
    days_since_purchase: Number(r.days_since_purchase ?? 0),
    gross_cents: Number(r.gross_cents ?? 0),
  }));
}

export class RepurchaseDueDecisionError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

/** The owner's answer. Records the decision only — no money moves here. */
export async function decideRepurchaseDue(
  client: DbClient,
  input: {
    operating_company_id: string;
    event_id: string;
    decision: RepurchaseDueDecision;
    extended_to?: string | null;
    note?: string | null;
    actor_user_id: string;
  }
): Promise<{ id: string; state: string }> {
  const cur = await client.query<{ state: string; due_date: string }>(
    `SELECT state, due_date::text FROM accounting.factoring_repurchase_due_events
      WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
    [input.event_id, input.operating_company_id]
  );
  const row = cur.rows[0];
  if (!row) throw new RepurchaseDueDecisionError("repurchase_due_event_not_found");
  if (row.state !== "awaiting_owner") throw new RepurchaseDueDecisionError("repurchase_due_event_already_decided");
  if (input.decision === "extend" && !(input.extended_to && input.extended_to > row.due_date)) {
    throw new RepurchaseDueDecisionError("repurchase_due_extend_needs_later_date");
  }
  const upd = await client.query<{ id: string; state: string }>(
    `
      UPDATE accounting.factoring_repurchase_due_events
         SET state = $3, extended_to = CASE WHEN $3 = 'extended' THEN $4::date ELSE extended_to END,
             decided_by_user_id = $5::uuid, decided_at = now(), decision_note = $6
       WHERE id = $1::uuid AND operating_company_id = $2::uuid AND state = 'awaiting_owner'
       RETURNING id::text, state
    `,
    [
      input.event_id,
      input.operating_company_id,
      DECISION_STATE[input.decision],
      input.decision === "extend" ? input.extended_to : null,
      input.actor_user_id,
      input.note ?? null,
    ]
  );
  if (!upd.rows[0]) throw new RepurchaseDueDecisionError("repurchase_due_event_already_decided");
  return upd.rows[0];
}
