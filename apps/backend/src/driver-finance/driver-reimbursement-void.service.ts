// LEAD 443.197 (17:45Z, required-live-load-guard item 4) — the ONE writer that voids a driver reimbursement that
// never became money. Before this there was no reimbursement void writer at all: the header comment of
// driver-reimbursement.service.ts promised "cancel sets status='void'", but nothing wrote it, and voidDocument() has
// no 'driver_reimbursement' case — a seed-run orphan could only be left pending (and re-materialize onto the next
// settlement covering its load) or hand-UPDATEd.
//
// NARROW BY DESIGN — refuses (DriverReimbursementVoidError, never a silent no-op) unless the row is:
//   status 'pending' · paid_at NULL · journal_entry_id NULL · applied_to_settlement_id NULL · settlement_line_id NULL ·
//   not already voided · named by NO live settlement line (voided_at NULL, is_active, on a non-voided settlement).
// A paid / posted / settled reimbursement is real money and goes through the GL reversal path (postVoidReversal,
// entity 'driver_reimbursement'), never here. Nothing here posts: there is nothing posted to reverse.
//
// The stamp is the shared void-stamp writer (stampDocumentVoided, family 'driver_reimbursement' -> status 'void',
// voided_at / void_reason / voided_by_user_id), plus one audit row per void ('driver_finance.reimbursement.voided').
import { appendCrudAudit } from "../audit/crud-audit.js";
import { stampDocumentVoided } from "../accounting/void-document-stamp.service.js";

type Client = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export class DriverReimbursementVoidError extends Error {
  constructor(
    readonly code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = "DriverReimbursementVoidError";
  }
}

export type VoidUnsettledReimbursementInput = {
  operating_company_id: string;
  reimbursement_id: string;
  reason: string;
  actor_user_id: string;
};

export type VoidUnsettledReimbursementResult = {
  id: string;
  driver_id: string;
  load_id: string | null;
  amount_cents: number;
  voided_at: string;
};

export async function voidUnsettledDriverReimbursement(
  client: Client,
  input: VoidUnsettledReimbursementInput
): Promise<VoidUnsettledReimbursementResult> {
  const reason = input.reason?.trim() ?? "";
  if (!reason) throw new DriverReimbursementVoidError("void_reason_required", "A reason is required to void a reimbursement.");
  if (!input.actor_user_id?.trim()) throw new DriverReimbursementVoidError("actor_required");

  const res = await client.query<{
    id: string;
    driver_id: string;
    load_id: string | null;
    amount_cents: string;
    status: string;
    pay_mode: string;
    paid_at: string | null;
    journal_entry_id: string | null;
    applied_to_settlement_id: string | null;
    settlement_line_id: string | null;
    voided_at: string | null;
  }>(
    `SELECT id::text, driver_id::text, load_id::text, amount_cents::text, status, pay_mode, paid_at::text,
            journal_entry_id::text, applied_to_settlement_id::text, settlement_line_id::text, voided_at::text
       FROM driver_finance.driver_reimbursements
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1 FOR UPDATE`,
    [input.reimbursement_id, input.operating_company_id]
  );
  const r = res.rows[0];
  if (!r) throw new DriverReimbursementVoidError("reimbursement_not_found");
  if (r.voided_at || r.status === "void") throw new DriverReimbursementVoidError("reimbursement_already_voided");
  if (r.status !== "pending") throw new DriverReimbursementVoidError("reimbursement_not_pending", `status '${r.status}' is not voidable here`);
  if (r.paid_at) throw new DriverReimbursementVoidError("reimbursement_paid", "a paid reimbursement is reversed through the GL void path");
  if (r.journal_entry_id) throw new DriverReimbursementVoidError("reimbursement_posted", "a posted reimbursement is reversed through the GL void path");
  if (r.applied_to_settlement_id || r.settlement_line_id)
    throw new DriverReimbursementVoidError("reimbursement_on_settlement", "the reimbursement is on a settlement — void the settlement line first");

  const live = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM driver_finance.settlement_lines sl
       JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id
      WHERE sl.operating_company_id = $2::uuid
        AND (sl.source_reference_id = $1::uuid OR sl.source_id = $1::uuid)
        AND sl.voided_at IS NULL AND COALESCE(sl.is_active, true) AND s.voided_at IS NULL`,
    [r.id, input.operating_company_id]
  );
  if (Number(live.rows[0]?.n ?? 0) > 0)
    throw new DriverReimbursementVoidError("reimbursement_on_live_line", "a live settlement line still carries this reimbursement");

  const stamped = await stampDocumentVoided(client as never, {
    operatingCompanyId: input.operating_company_id,
    family: "driver_reimbursement",
    documentId: r.id,
    voidReason: reason,
    voidedByUserId: input.actor_user_id,
  });

  await appendCrudAudit(
    client as never,
    input.actor_user_id,
    "driver_finance.reimbursement.voided",
    {
      resource_type: "driver_finance.driver_reimbursements",
      resource_id: r.id,
      operating_company_id: input.operating_company_id,
      driver_id: r.driver_id,
      load_id: r.load_id,
      amount_cents: Number(r.amount_cents),
      pay_mode: r.pay_mode,
      status_before: r.status,
      outcome: "unsettled_voided_no_money",
      reason,
    },
    "warning",
    "LEAD-443.197-REIMBURSEMENT-VOID"
  );

  return { id: r.id, driver_id: r.driver_id, load_id: r.load_id, amount_cents: Number(r.amount_cents), voided_at: stamped.voided_at };
}
