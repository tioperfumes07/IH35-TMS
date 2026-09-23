// A/R INVOICE-LEVEL DISPUTE SERVICE (owner ruling 2026-09-12).
//
// When our billed invoice face differs from what the customer/factor states, we keep the invoice at
// the INVOICED amount and open a dispute for the delta so the A/R balance stays OPEN and tracked.
// This service NEVER mutates the invoice face or amount_open_cents and posts NO GL — it is a tracking
// record. Resolution routes to the existing posters (a credit memo for a real discount/fine, an
// invoice edit for a mis-entry). See db/migrations/202614131200_invoice_disputes.sql.

import { appendCrudAudit } from "../audit/crud-audit.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { withCompanyScope } from "./shared.js";

export const INVOICE_DISPUTE_FLAG = "INVOICE_DISPUTE_ENABLED";

export const INVOICE_DISPUTE_REASONS = [
  "mis_entry",
  "customer_discount",
  "late_fine",
  "driver_no_answer",
  "short_pay",
  "chargeback",
  "other",
  // ROUND 23.3 DELTA (owner, 2026-09-13): over/under-payment both open disputes. Ship reason
  // codes + relaxed validation FIRST (this commit; db/migrations/... already added both values to
  // accounting.invoice_disputes' chk_invoice_disputes_reason CHECK, confirmed live), THEN open
  // disputes against them — never a dispute against a reason code that doesn't exist yet.
  "over_payment",
  "under_billing",
] as const;
export type InvoiceDisputeReason = (typeof INVOICE_DISPUTE_REASONS)[number];

// The pre-existing reasons all describe a shortfall CAPPED at the invoice face (a short-pay,
// discount, or fine can never exceed what was actually billed). over_payment/under_billing are the
// opposite shape — the CUSTOMER/FACTOR's stated true amount differs from our face in either
// direction, and that variance can legitimately exceed the invoice face (e.g. a large under-billing
// correction on a small invoice). These two reasons alone skip the "disputed <= invoiced" cap below.
const VARIANCE_REASONS = new Set<InvoiceDisputeReason>(["over_payment", "under_billing"]);

export const INVOICE_DISPUTE_RESOLUTIONS = [
  "invoice_corrected",
  "credit_memo",
  "collected_in_full",
  "written_off",
  "no_change",
] as const;
export type InvoiceDisputeResolution = (typeof INVOICE_DISPUTE_RESOLUTIONS)[number];

// Round 88 (owner law, migration 202614290000) — the fault decision is a NAMED HUMAN ACT, never
// inferred from lateness. 'unassigned' is the honest default; only 'driver' may ever produce a
// driver deduction (enforced by driver_finance.enforce_recovery_not_over_disputed()).
export const FAULT_PARTIES = ["unassigned", "driver", "carrier", "customer", "broker", "force_majeure"] as const;
export type FaultParty = (typeof FAULT_PARTIES)[number];

export type InvoiceDisputeRow = {
  id: string;
  operating_company_id: string;
  invoice_id: string;
  customer_id: string | null;
  disputed_amount_cents: number;
  invoiced_amount_cents: number;
  expected_amount_cents: number;
  reason_code: string;
  reason_text: string | null;
  status: string;
  resolution_type: string | null;
  resolution_text: string | null;
  resolution_amount_cents: number | null;
  resolution_ref_id: string | null;
  opened_at: string;
  opened_by_user_id: string | null;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  fault_party: FaultParty;
  fault_reason: string | null;
  fault_decided_at: string | null;
  fault_decided_by_user_id: string | null;
  driver_id: string | null;
  load_id: string | null;
};

export type ServiceError = { error: string; [k: string]: unknown };
function isError<T>(v: T | ServiceError): v is ServiceError {
  return Boolean(v) && typeof v === "object" && "error" in (v as Record<string, unknown>);
}

// Invoice statuses on which a dispute makes no sense (nothing billed / already reversed).
const NON_DISPUTABLE_STATUSES = new Set(["draft", "void", "voided", "cancelled", "canceled"]);

export type OpenInvoiceDisputeInput = {
  userId: string;
  operatingCompanyId: string;
  invoiceId: string;
  disputedAmountCents: number;
  expectedAmountCents?: number;
  reasonCode: InvoiceDisputeReason;
  reasonText?: string;
  sourceSystem?: string;
};

export async function openInvoiceDispute(
  input: OpenInvoiceDisputeInput
): Promise<{ dispute: InvoiceDisputeRow } | ServiceError> {
  const { userId, operatingCompanyId, invoiceId } = input;
  return withCompanyScope(userId, operatingCompanyId, async (client) => {
    if (!(await isEnabled(client as never, INVOICE_DISPUTE_FLAG, { operating_company_id: operatingCompanyId }))) {
      return { error: "invoice_dispute_disabled" };
    }
    const invRes = await client.query(
      `SELECT id, customer_id, total_cents, amount_open_cents, status
         FROM accounting.invoices
        WHERE id = $1 AND operating_company_id = $2`,
      [invoiceId, operatingCompanyId]
    );
    const inv = invRes.rows[0];
    if (!inv) return { error: "invoice_not_found" };
    if (NON_DISPUTABLE_STATUSES.has(String(inv.status))) {
      return { error: "invoice_not_disputable", status: String(inv.status) };
    }

    const invoiced = Number(inv.total_cents ?? 0);
    const isVariance = VARIANCE_REASONS.has(input.reasonCode);
    const disputed = Math.round(Number(input.disputedAmountCents));
    if (!Number.isFinite(disputed) || disputed <= 0) return { error: "invalid_disputed_amount" };
    if (!isVariance && disputed > invoiced) {
      return { error: "dispute_exceeds_invoice_face", invoiced_amount_cents: invoiced };
    }
    const expected =
      input.expectedAmountCents == null ? invoiced - disputed : Math.round(Number(input.expectedAmountCents));
    if (isVariance) {
      // over_payment/under_billing: disputed must equal the actual variance, not an arbitrary
      // caller-supplied number — derive it from expected vs invoiced so the two can never drift.
      if (input.expectedAmountCents == null) return { error: "expected_amount_required_for_variance" };
      const trueDelta = Math.abs(expected - invoiced);
      if (trueDelta === 0) return { error: "no_variance_to_dispute" };
      if (disputed !== trueDelta) return { error: "disputed_amount_must_equal_variance", expected_delta_cents: trueDelta };
    }

    try {
      const ins = await client.query(
        `INSERT INTO accounting.invoice_disputes
           (operating_company_id, invoice_id, customer_id, disputed_amount_cents,
            invoiced_amount_cents, expected_amount_cents, reason_code, reason_text,
            status, opened_by_user_id, source_system)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,$10)
         RETURNING *`,
        [
          operatingCompanyId,
          invoiceId,
          inv.customer_id ?? null,
          disputed,
          invoiced,
          expected,
          input.reasonCode,
          input.reasonText ?? null,
          userId,
          input.sourceSystem ?? null,
        ]
      );
      const dispute = ins.rows[0] as InvoiceDisputeRow;
      await appendCrudAudit(
        client,
        userId,
        "accounting.invoice_dispute.opened",
        {
          invoice_dispute_id: dispute.id,
          invoice_id: invoiceId,
          operating_company_id: operatingCompanyId,
          disputed_amount_cents: disputed,
          invoiced_amount_cents: invoiced,
          expected_amount_cents: expected,
          reason_code: input.reasonCode,
        },
        "warning",
        "INVOICE-DISPUTE"
      );
      return { dispute };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // uq_invoice_disputes_one_open — at most one open dispute per invoice.
      if (/uq_invoice_disputes_one_open|duplicate key/.test(msg)) return { error: "open_dispute_exists" };
      throw e;
    }
  });
}

export async function listInvoiceDisputes(
  userId: string,
  operatingCompanyId: string,
  invoiceId: string
): Promise<{ disputes: InvoiceDisputeRow[] }> {
  return withCompanyScope(userId, operatingCompanyId, async (client) => {
    const res = await client.query(
      `SELECT * FROM accounting.invoice_disputes
        WHERE invoice_id = $1 AND operating_company_id = $2
        ORDER BY opened_at DESC`,
      [invoiceId, operatingCompanyId]
    );
    return { disputes: res.rows as InvoiceDisputeRow[] };
  });
}

export async function listInvoiceDisputeQueue(
  userId: string,
  operatingCompanyId: string,
  status: string | undefined
): Promise<{ disputes: Array<InvoiceDisputeRow & { invoice_display_id: string | null; customer_name: string | null }> }> {
  return withCompanyScope(userId, operatingCompanyId, async (client) => {
    const params: unknown[] = [operatingCompanyId];
    let statusClause = "";
    if (status && status !== "all") {
      params.push(status);
      statusClause = `AND d.status = $${params.length}`;
    }
    const res = await client.query(
      `SELECT d.*,
              i.display_id AS invoice_display_id,
              COALESCE(c.customer_name,
                       mdata.resolve_customer_label_same_company(d.customer_id, d.operating_company_id)) AS customer_name
         FROM accounting.invoice_disputes d
         JOIN accounting.invoices i ON i.id = d.invoice_id
         LEFT JOIN mdata.customers c ON c.id = d.customer_id
        WHERE d.operating_company_id = $1
          ${statusClause}
        ORDER BY (d.status = 'open') DESC, d.opened_at DESC`,
      params
    );
    return { disputes: res.rows as Array<InvoiceDisputeRow & { invoice_display_id: string | null; customer_name: string | null }> };
  });
}

export type ResolveInvoiceDisputeInput = {
  userId: string;
  operatingCompanyId: string;
  disputeId: string;
  resolutionType: InvoiceDisputeResolution;
  resolutionText?: string;
  resolutionAmountCents?: number;
  resolutionRefId?: string;
};

export async function resolveInvoiceDispute(
  input: ResolveInvoiceDisputeInput
): Promise<{ dispute: InvoiceDisputeRow } | ServiceError> {
  const { userId, operatingCompanyId, disputeId } = input;
  return withCompanyScope(userId, operatingCompanyId, async (client) => {
    const cur = await client.query(
      `SELECT * FROM accounting.invoice_disputes
        WHERE id = $1 AND operating_company_id = $2`,
      [disputeId, operatingCompanyId]
    );
    const row = cur.rows[0] as InvoiceDisputeRow | undefined;
    if (!row) return { error: "dispute_not_found" };
    if (row.status !== "open") return { error: "dispute_not_open", status: row.status };
    // ROUND 23.3 DELTA (owner, 2026-09-13, verbatim): "Maker != checker still applies on top: the
    // raiser never resolves, whatever the role. Enforce in the SERVICE, not only the UI." Checked
    // here, not just gated by WRITE_ROLES in the route -- a same-role user (e.g. two Accountants)
    // is not a safeguard if one of them is the very person who raised this exact dispute.
    if (row.opened_by_user_id && row.opened_by_user_id === userId) {
      return { error: "raiser_cannot_resolve_own_dispute" };
    }

    const upd = await client.query(
      `UPDATE accounting.invoice_disputes
          SET status = 'resolved',
              resolution_type = $3,
              resolution_text = $4,
              resolution_amount_cents = $5,
              resolution_ref_id = $6,
              resolved_at = now(),
              resolved_by_user_id = $7,
              updated_at = now()
        WHERE id = $1 AND operating_company_id = $2 AND status = 'open'
        RETURNING *`,
      [
        disputeId,
        operatingCompanyId,
        input.resolutionType,
        input.resolutionText ?? null,
        input.resolutionAmountCents == null ? null : Math.round(Number(input.resolutionAmountCents)),
        input.resolutionRefId ?? null,
        userId,
      ]
    );
    const dispute = upd.rows[0] as InvoiceDisputeRow;
    await appendCrudAudit(
      client,
      userId,
      "accounting.invoice_dispute.resolved",
      {
        invoice_dispute_id: disputeId,
        invoice_id: row.invoice_id,
        operating_company_id: operatingCompanyId,
        resolution_type: input.resolutionType,
        resolution_amount_cents: dispute.resolution_amount_cents,
        resolution_ref_id: dispute.resolution_ref_id,
      },
      "warning",
      "INVOICE-DISPUTE"
    );
    return { dispute };
  });
}

// Round 88 (owner law, migration 202614290000) — the fault decision, separate from resolution.
// A dispute can be resolved (invoice corrected, credit memo, etc.) independently of who was at
// fault for the delay/short-pay that caused it; the fault decision is what unlocks a driver
// deduction recovery, never something the resolution flow does implicitly.
export type DecideDisputeFaultInput = {
  userId: string;
  operatingCompanyId: string;
  disputeId: string;
  faultParty: FaultParty;
  faultReason: string;
  driverId?: string | null;
  loadId?: string | null;
};

export async function decideDisputeFault(
  input: DecideDisputeFaultInput
): Promise<{ dispute: InvoiceDisputeRow } | ServiceError> {
  const { userId, operatingCompanyId, disputeId } = input;
  // §1's own invoice_disputes_driver_only_when_driver_fault CHECK refuses driver_id on any
  // fault_party other than 'driver' — fail closed here with a named error instead of letting the
  // operator's mistake surface as a raw constraint violation.
  if (input.faultParty !== "driver" && input.driverId) {
    return { error: "driver_only_valid_for_driver_fault" };
  }
  if (input.faultParty === "driver" && !input.driverId) {
    return { error: "driver_required_for_driver_fault" };
  }
  return withCompanyScope(userId, operatingCompanyId, async (client) => {
    const cur = await client.query(
      `SELECT * FROM accounting.invoice_disputes
        WHERE id = $1 AND operating_company_id = $2`,
      [disputeId, operatingCompanyId]
    );
    const row = cur.rows[0] as InvoiceDisputeRow | undefined;
    if (!row) return { error: "dispute_not_found" };

    const upd = await client.query(
      `UPDATE accounting.invoice_disputes
          SET fault_party = $3,
              fault_reason = $4,
              fault_decided_at = now(),
              fault_decided_by_user_id = $5,
              driver_id = $6,
              load_id = $7,
              updated_at = now()
        WHERE id = $1 AND operating_company_id = $2
        RETURNING *`,
      [
        disputeId,
        operatingCompanyId,
        input.faultParty,
        input.faultReason,
        userId,
        input.faultParty === "driver" ? input.driverId : null,
        input.loadId ?? null,
      ]
    );
    const dispute = upd.rows[0] as InvoiceDisputeRow;
    await appendCrudAudit(
      client,
      userId,
      "accounting.invoice_dispute.fault_decided",
      {
        invoice_dispute_id: disputeId,
        operating_company_id: operatingCompanyId,
        fault_party: input.faultParty,
        fault_reason: input.faultReason,
        driver_id: dispute.driver_id,
        load_id: dispute.load_id,
      },
      "warning",
      "DEDUCTION-CHAIN-ROUND-88"
    );
    return { dispute };
  });
}

export type CancelInvoiceDisputeInput = {
  userId: string;
  operatingCompanyId: string;
  disputeId: string;
  reason: string;
};

export async function cancelInvoiceDispute(
  input: CancelInvoiceDisputeInput
): Promise<{ dispute: InvoiceDisputeRow } | ServiceError> {
  const { userId, operatingCompanyId, disputeId } = input;
  return withCompanyScope(userId, operatingCompanyId, async (client) => {
    const cur = await client.query(
      `SELECT status FROM accounting.invoice_disputes WHERE id = $1 AND operating_company_id = $2`,
      [disputeId, operatingCompanyId]
    );
    const row = cur.rows[0];
    if (!row) return { error: "dispute_not_found" };
    if (row.status !== "open") return { error: "dispute_not_open", status: String(row.status) };
    const upd = await client.query(
      `UPDATE accounting.invoice_disputes
          SET status = 'cancelled',
              resolution_text = $3,
              resolved_at = now(),
              resolved_by_user_id = $4,
              updated_at = now()
        WHERE id = $1 AND operating_company_id = $2 AND status = 'open'
        RETURNING *`,
      [disputeId, operatingCompanyId, input.reason, userId]
    );
    const dispute = upd.rows[0] as InvoiceDisputeRow;
    await appendCrudAudit(
      client,
      userId,
      "accounting.invoice_dispute.cancelled",
      { invoice_dispute_id: disputeId, operating_company_id: operatingCompanyId, reason: input.reason },
      "warning",
      "INVOICE-DISPUTE"
    );
    return { dispute };
  });
}

export const __test = { isError };
