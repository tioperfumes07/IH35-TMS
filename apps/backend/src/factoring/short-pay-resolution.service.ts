// Owner ruling 2026-10-02: "Short-pay. 'A/R variance' is not an account ... Give me the two-sided entry per reason code: the
// debit account for each reason (billing adjustment, customer claim, bad debt) against A/R on that customer, and separately
// the reserve movement if Faro funds the shortfall (DR 2150 / CR 1235) ... Post them as two entries with a shared link."
// Lead lifecycle: "the write-off only on owner approval."
//
// The RESERVE side (Faro took the shortfall from our cash reserve) posts in faro-reserve-entries.service.ts: DR 2150 /
// CR 1235. The CUSTOMER side is this — the Owner's decision, never automatic:
//   written_down  a reason-coded credit memo applied to the invoice (the A/R subledger, so the aging moves) + its GL entry
//                 DR <reason account> / CR A/R (1100) on that customer, both legs linked on the spine to the SAME Faro entry
//                 and invoice as the reserve entry (the shared link) and to the credit memo
//   kept_open     ONLY while the Owner actively disputes it (a dispute note is required) — no entry; written down later.
//                 ROUND 335: write-down is the default; reason CODE selects the account (users never pick one): never
//                 earned -> revenue contra 4910-4980; earned but uncollectible -> 6920 Bad Debt only via "bad_debt".
import { createJournalEntryOnClient } from "../accounting/journal-entries.service.js";
import { resolveRoleAccount } from "../accounting/coa-roles/resolver.service.js";
import { writeTransactionSourceLink } from "../accounting/accounting-spine-emit.js";
import { resolveCreditMemoDisplayId } from "../accounting/display-id.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { writeFactoringSpineLinks } from "./factoring-spine-links.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** Reason -> the account's system_purpose (USMCA's short-pay chart, 4910-4980; bad debt 6920) -> the credit-memo reason. */
export const SHORT_PAY_REASONS = {
  service_failure: { purpose: "shortpay_service_failure", memo: "late_delivery", label: "Service failure / late delivery" },
  paperwork: { purpose: "shortpay_paperwork", memo: "missing_paperwork", label: "Missing or invalid paperwork" },
  osd: { purpose: "shortpay_osd", memo: "damage", label: "OS&D deducted from freight" },
  rate_dispute: { purpose: "shortpay_rate_dispute", memo: "rate_dispute", label: "Rate or accessorial dispute" },
  detention_denied: { purpose: "shortpay_detention_denied", memo: "detention_denied", label: "Detention / layover denied" },
  billing_error: { purpose: "shortpay_billing_error", memo: "billing_error_ours", label: "Our billing error (billing adjustment)" },
  unknown: { purpose: "shortpay_unknown", memo: "unknown_pending_backup", label: "Unknown / backup not received" },
  agreed_concession: { purpose: "shortpay_agreed_concession", memo: "agreed_concession", label: "Agreed concession / quick-pay discount" },
  penalty: { purpose: "shortpay_penalty", memo: "penalty_assessed", label: "Penalty / fine assessed by customer (customer claim)" },
  bad_debt: { purpose: "shortpay_bad_debt", memo: "other", label: "Bad debt" },
} as const;
export type ShortPayReason = keyof typeof SHORT_PAY_REASONS;

export class ShortPayResolutionError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export async function resolveFaroShortPay(
  client: DbClient,
  input: {
    operating_company_id: string;
    entry_id: string;
    resolution: "written_down" | "kept_open";
    reason?: ShortPayReason | null;
    note?: string | null;
    actor_user_id: string;
    actor_role: string;
  }
) {
  const oci = input.operating_company_id;
  if (input.actor_role !== "Owner") throw new ShortPayResolutionError("short_pay_resolution_owner_only");
  const e = (await client.query<{ id: string; entry_kind: string; amount_cents: string; faro_invoice_number: string | null; short_pay_resolution: string | null; entry_date: string }>(
    `SELECT id::text, entry_kind, amount_cents::text, faro_invoice_number, short_pay_resolution, entry_date::text
       FROM accounting.faro_reserve_entries WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
    [input.entry_id, oci]
  )).rows[0];
  if (!e) throw new ShortPayResolutionError("faro_entry_not_found");
  if (e.entry_kind !== "short_pay") throw new ShortPayResolutionError("faro_entry_is_not_a_short_pay");
  if (e.short_pay_resolution === "written_down") throw new ShortPayResolutionError("short_pay_already_written_down");
  const link = (await client.query<{ invoice_id: string; customer_id: string; invoice_display_id: string | null; total_cents: string; amount_paid_cents: string }>(
    `SELECT l.invoice_id::text, l.customer_id::text, i.display_id AS invoice_display_id, i.total_cents::text, COALESCE(i.amount_paid_cents, 0)::text AS amount_paid_cents
       FROM accounting.factoring_purchase_lines l JOIN accounting.invoices i ON i.id = l.invoice_id
      WHERE l.operating_company_id = $1::uuid AND l.faro_invoice_number = $2 AND l.voided_at IS NULL`,
    [oci, e.faro_invoice_number]
  )).rows[0];
  if (!link) throw new ShortPayResolutionError("faro_invoice_number_not_on_any_purchase_line");

  if (input.resolution === "kept_open") {
    if (e.short_pay_resolution === "kept_open") throw new ShortPayResolutionError("short_pay_already_kept_open");
    // ROUND 335 §2: keep-open is a NAMED exception while the Owner actively disputes this shortfall — never a resting state.
    // While it is open, 2150 (already relieved from the reserve) and the invoice's open balance disagree, and the
    // 2150 = open Net guard reports it until the shortfall is written down.
    if ((input.note ?? "").trim().length < 10) throw new ShortPayResolutionError("short_pay_keep_open_needs_dispute_note");
    await client.query(
      `UPDATE accounting.faro_reserve_entries
          SET short_pay_resolution = 'kept_open', short_pay_resolved_by_user_id = $2::uuid, short_pay_resolved_at = now(),
              short_pay_resolution_note = $3
        WHERE id = $1::uuid`,
      [e.id, input.actor_user_id, input.note ?? null]
    );
    await appendCrudAudit(client as never, input.actor_user_id, "factoring.faro_short_pay_kept_open", {
      resource_type: "accounting.faro_reserve_entries", resource_id: e.id, operating_company_id: oci, invoice_id: link.invoice_id,
    }, "info", "OWNER-RULING-2026-10-02-SHORT-PAY");
    return { entry_id: e.id, resolution: "kept_open" as const };
  }

  const reason = input.reason ? SHORT_PAY_REASONS[input.reason] : undefined;
  if (!reason) throw new ShortPayResolutionError("short_pay_reason_required");
  const account = (await client.query<{ id: string }>(
    `SELECT id::text FROM catalogs.accounts
      WHERE operating_company_id = $1::uuid AND system_purpose = $2 AND deactivated_at IS NULL AND is_postable`,
    [oci, reason.purpose]
  )).rows;
  if (account.length !== 1) throw new ShortPayResolutionError("short_pay_reason_account_not_found");
  const amount = Math.abs(Number(e.amount_cents));
  const applied = Number((await client.query<{ c: string }>(
    `SELECT COALESCE(sum(applied_cents), 0)::text AS c FROM accounting.credit_memo_applications
      WHERE invoice_id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL`,
    [link.invoice_id, oci]
  )).rows[0]?.c ?? 0);
  const remaining = Number(link.total_cents) - Number(link.amount_paid_cents) - applied;
  if (amount > remaining) throw new ShortPayResolutionError("short_pay_exceeds_invoice_open_balance");

  const today = companyBusinessDate();
  const displayId = await resolveCreditMemoDisplayId(client as never, oci, new Date(`${today}T00:00:00Z`), undefined);
  const memoNote = `Faro short-pay — Faro Inv ${e.faro_invoice_number}, ${reason.label}${input.note ? ` — ${input.note}` : ""}`;
  const memo = (await client.query<{ id: string }>(
    `INSERT INTO accounting.credit_memos
       (operating_company_id, customer_id, display_id, status, reason, issue_date, amount_cents, notes, created_by_user_id)
     VALUES ($1::uuid, $2::uuid, $3, 'issued', $4, $5::date, $6, $7, $8::uuid) RETURNING id::text`,
    [oci, link.customer_id, displayId, reason.memo, today, amount, memoNote, input.actor_user_id]
  )).rows[0]!;
  await client.query(
    `INSERT INTO accounting.credit_memo_applications
       (operating_company_id, credit_memo_id, invoice_id, applied_cents, applied_by_user_id, idempotency_key)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6)`,
    [oci, memo.id, link.invoice_id, amount, input.actor_user_id, `faro_short_pay:${e.id}`]
  );
  await client.query(
    `UPDATE accounting.credit_memos SET amount_applied_cents = amount_applied_cents + $2,
            status = CASE WHEN amount_applied_cents + $2 >= amount_cents THEN 'applied' ELSE status END
      WHERE id = $1::uuid`,
    [memo.id, amount]
  );

  const stamp = { source_transaction_type: "faro_reserve_entry", source_transaction_id: e.id, entity_type: "customer" as const, entity_uuid: link.customer_id };
  const ar = await resolveRoleAccount(client as never, oci, "ar_control");
  const jeMemo = `Faro short-pay written down — ${link.invoice_display_id ?? "invoice"} — ${reason.label}`;
  const je = await createJournalEntryOnClient(
    client as never,
    {
      operating_company_id: oci,
      entry_date: today,
      memo: jeMemo,
      source: "auto",
      postings: [
        { account_id: account[0]!.id, debit_or_credit: "debit", amount_cents: amount, description: jeMemo, ...stamp },
        { account_id: ar, debit_or_credit: "credit", amount_cents: amount, description: jeMemo, ...stamp },
      ],
    },
    { userId: input.actor_user_id, role: input.actor_role }
  );
  // The shared link: the same Faro entry + invoice as the reserve entry, plus the credit memo that moved the subledger.
  await writeFactoringSpineLinks(client, oci, je.id, "faro_short_pay_write_down");
  const legs = await client.query<{ id: string }>(`SELECT id::text FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1::uuid`, [je.id]);
  for (const leg of legs.rows) {
    await writeTransactionSourceLink(client as never, {
      operating_company_id: oci, journal_entry_posting_id: leg.id, linked_object_type: "credit_memo", linked_object_id: memo.id,
      relationship_role: "faro_short_pay_write_down",
    });
  }
  await client.query(
    `UPDATE accounting.faro_reserve_entries
        SET short_pay_resolution = 'written_down', short_pay_reason = $2, short_pay_reason_account_id = $3::uuid,
            short_pay_credit_memo_id = $4::uuid, short_pay_resolution_journal_entry_id = $5::uuid,
            short_pay_resolved_by_user_id = $6::uuid, short_pay_resolved_at = now(), short_pay_resolution_note = $7
      WHERE id = $1::uuid`,
    [e.id, input.reason, account[0]!.id, memo.id, je.id, input.actor_user_id, input.note ?? null]
  );
  await appendCrudAudit(client as never, input.actor_user_id, "factoring.faro_short_pay_written_down", {
    resource_type: "accounting.faro_reserve_entries", resource_id: e.id, operating_company_id: oci, invoice_id: link.invoice_id,
    credit_memo_id: memo.id, journal_entry_id: je.id, reason: input.reason, amount_cents: amount,
  }, "warning", "OWNER-RULING-2026-10-02-SHORT-PAY");
  return { entry_id: e.id, resolution: "written_down" as const, credit_memo_id: memo.id, journal_entry_id: je.id, amount_cents: amount };
}
