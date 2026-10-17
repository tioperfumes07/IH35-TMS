/**
 * LEAD 443.151 (b) (owner 2026-10-16, ruling option 3) — void-and-reissue keeps the SAME invoice number.
 *
 * An invoice is never deleted (WORM), and accounting.invoices is unique on (operating_company_id, display_id) INCLUDING
 * voided rows — so a voided invoice held its number forever and a corrected reissue could never carry the number the
 * owner submitted to Faro (reconciliation 1–118: 52-13570, 59-13578, … had to be corrected, not renumbered).
 *
 *   releaseVoidedInvoiceNumber — a VOID invoice is renamed "<number>-V<n>" (n = next free for that number), with one audit
 *     row carrying the original and the released number. A live invoice is refused; a number already released is refused.
 *     invoices_display_id_check (migration 202615960910) accepts the "-V<n>" shape on void rows only.
 *   voidAndReissueLoadInvoice — the one correction path for an ISSUED load invoice: voidDocument('invoice') (reversal JE
 *     through postVoidReversal) → releaseVoidedInvoiceNumber → the load's line haul set to the corrected amount through the
 *     load-update engine (Owner lock override with the reason; only a single-line-haul load — anything else is refused by
 *     name) → buildInvoiceFromLoad under the SAME number (or the number the caller names) → sendDraftInvoice. No new money
 *     math: every step is an existing engine. Paid / partially paid / factored invoices are refused.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { voidDocument } from "./void-document.service.js";
import { buildInvoiceFromLoad } from "./from-load.js";
import { convertProformaToOfficial } from "./proforma-convert.service.js";
import { sendDraftInvoice, type InvoiceSendMode } from "./invoice-send.service.js";
import { updateDispatchLoad } from "../dispatch/update-load.service.js";
import { STANDING_LATCH_JE_PREDICATE } from "./revrec-delivery-posting/poster.service.js";

type Db = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }> };

export const INVOICE_NUMBER_RELEASED_EVENT = "accounting.invoice_number_released";
export const INVOICE_REISSUED_EVENT = "accounting.invoice_voided_and_reissued";
const RELEASED_SUFFIX = /-V[0-9]{1,3}$/;

export class InvoiceReissueRefused extends Error {
  constructor(readonly reason: string) {
    super(`invoice_reissue_refused: ${reason}`);
    this.name = "InvoiceReissueRefused";
  }
}

export async function releaseVoidedInvoiceNumber(
  client: Db,
  input: { operatingCompanyId: string; invoiceId: string; actorUserId: string; reason: string }
): Promise<{ original_display_id: string; released_display_id: string }> {
  const row = (await client.query<{ display_id: string; status: string; voided_at: string | null }>(
    `SELECT display_id, status::text AS status, voided_at::text AS voided_at FROM accounting.invoices
      WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
    [input.invoiceId, input.operatingCompanyId]
  )).rows[0];
  if (!row) throw new InvoiceReissueRefused("invoice_not_found");
  if (!row.voided_at || row.status !== "void") throw new InvoiceReissueRefused("invoice_not_void: only a voided invoice releases its number");
  if (RELEASED_SUFFIX.test(row.display_id)) throw new InvoiceReissueRefused(`number_already_released: ${row.display_id}`);
  const taken = (await client.query<{ display_id: string }>(
    `SELECT display_id FROM accounting.invoices WHERE operating_company_id = $1::uuid AND display_id LIKE $2`,
    [input.operatingCompanyId, `${row.display_id}-V%`]
  )).rows.map((r) => Number(r.display_id.slice(row.display_id.length + 2))).filter((n) => Number.isInteger(n));
  const released = `${row.display_id}-V${(taken.length ? Math.max(...taken) : 0) + 1}`;
  await client.query(
    `UPDATE accounting.invoices SET display_id = $3, updated_at = now(), updated_by_user_id = $4::uuid
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NOT NULL`,
    [input.invoiceId, input.operatingCompanyId, released, input.actorUserId]
  );
  await appendCrudAudit(client as never, input.actorUserId, INVOICE_NUMBER_RELEASED_EVENT, {
    resource_type: "accounting.invoices", resource_id: input.invoiceId, operating_company_id: input.operatingCompanyId,
    original_display_id: row.display_id, released_display_id: released, reason: input.reason,
  }, "info", "LEAD-443.151-B");
  return { original_display_id: row.display_id, released_display_id: released };
}

export type VoidAndReissueResult = {
  load_id: string;
  voided_invoice_id: string;
  original_display_id: string;
  released_display_id: string;
  reversal_journal_entry_id: string | null;
  new_invoice_id: string;
  new_display_id: string;
  before_total_cents: number;
  after_total_cents: number;
};

export async function voidAndReissueLoadInvoice(
  client: Db,
  input: {
    operatingCompanyId: string;
    invoiceId: string;
    actorUserId: string;
    actorRole: string;
    reason: string;
    /** The corrected invoice total; omitted = the same total (a renumber). */
    newTotalCents?: number;
    /** The number to reissue under (digits), or "next" for the engine's next free number (a non-Faro invoice whose number
     *  collides with one submitted to Faro); omitted = the invoice's own number. */
    reissueNumber?: string;
    /** The customer the invoice must carry (owner standing rule: the customer submitted to Faro); set on the load too. */
    newCustomerId?: string;
    sendMode?: InvoiceSendMode;
  }
): Promise<VoidAndReissueResult> {
  const co = input.operatingCompanyId;
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 10) throw new InvoiceReissueRefused("reason_required");
  if (input.actorRole !== "Owner") throw new InvoiceReissueRefused("owner_only");
  const inv = (await client.query<{ id: string; display_id: string; status: string; total: number; paid: number; fs: string; load_id: string | null }>(
    `SELECT id::text, display_id, status::text AS status, total_cents::int AS total, amount_paid_cents::int AS paid,
            COALESCE(factoring_status, 'not_factored') AS fs, source_load_id::text AS load_id
       FROM accounting.invoices WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL FOR UPDATE`,
    [input.invoiceId, co]
  )).rows[0];
  if (!inv) throw new InvoiceReissueRefused("invoice_not_found_or_void");
  if (!inv.load_id) throw new InvoiceReissueRefused("invoice_has_no_load");
  if (inv.status !== "sent") throw new InvoiceReissueRefused(`invoice_not_sent: ${inv.status}`);
  if (inv.paid !== 0) throw new InvoiceReissueRefused("invoice_has_payments: unapply them first");
  if (inv.fs !== "not_factored") throw new InvoiceReissueRefused(`invoice_factored: ${inv.fs}`);
  const own = /^([0-9]{1,6})-[0-9]{1,12}$/.exec(inv.display_id);
  const number = (input.reissueNumber ?? own?.[1] ?? "").trim();
  if (number !== "next" && !/^[0-9]{1,6}$/.test(number)) throw new InvoiceReissueRefused(`reissue_number_invalid: ${inv.display_id}`);
  const newTotal = input.newTotalCents ?? inv.total;
  if (!Number.isInteger(newTotal) || newTotal <= 0) throw new InvoiceReissueRefused("new_total_invalid");

  const charges = (await client.query<{ code: string; amount: number }>(
    `SELECT charge_code AS code, amount_cents::int AS amount FROM dispatch.load_charge_lines
      WHERE load_id = $1::uuid AND operating_company_id = $2::uuid AND is_active = true`,
    [inv.load_id, co]
  )).rows;
  const load = (await client.query<{ rate: number }>(`SELECT rate_total_cents::int AS rate FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [inv.load_id, co])).rows[0];
  if (!load) throw new InvoiceReissueRefused("load_not_found");
  if (newTotal !== load.rate && !(charges.length === 1 && charges[0].code.toLowerCase() === "linehaul")) {
    throw new InvoiceReissueRefused(`load_charges_not_single_linehaul: ${charges.map((c) => `${c.code}=${c.amount}`).join(",") || "none"} — name the corrected charges on the load`);
  }

  // LEAD 443.157 (prod 13658): on a load whose delivery latch already recognized revenue (Event 1 "earn"), Event 2 bills
  // the EARNED amount — a reissue at a different total would leave A/R and revenue at the old amount (4,300 vs 4,450). The
  // latch re-earn posts on its own connection after commit, so it cannot run inside this transaction: refuse by name and
  // point at the re-earn path instead of leaving a silent A/R gap.
  if (newTotal !== inv.total) {
    const earned = (await client.query<{ amount: number }>(
      `SELECT p.amount_cents::int AS amount FROM accounting.load_revenue_recognition_postings p
        WHERE p.operating_company_id = $1::uuid AND p.load_id = $2::uuid AND p.event = 'earn' AND p.is_active
          AND ${STANDING_LATCH_JE_PREDICATE} LIMIT 1`,
      [co, inv.load_id]
    )).rows[0];
    if (earned && earned.amount !== newTotal) {
      throw new InvoiceReissueRefused(
        `latch_earned_${earned.amount}_not_${newTotal}: the delivery latch recognized this load at ${earned.amount}; reverse its standing earn + bill JEs and re-earn at the new rate first (scripts/ops/2026-10-16-cc2-443-157-fix-13658-latch-reearn.mts)`
      );
    }
  }

  // 1. Void through the one dispatcher (postVoidReversal + the void stamp), then free the number.
  const voided = await voidDocument(client as never, {
    operatingCompanyId: co, type: "invoice", id: inv.id, reason: `${reason} (void and reissue)`,
    actor: { userId: input.actorUserId, role: input.actorRole }, currentBusinessDate: companyBusinessDate(),
  });
  const released = await releaseVoidedInvoiceNumber(client, { operatingCompanyId: co, invoiceId: inv.id, actorUserId: input.actorUserId, reason });

  // 2. The customer first (a customer-only load edit does not re-enter the proforma minter — only a RATE change does, and
  //    it would take the next free number), so the replacement mints under the number with the right customer; then the
  //    line haul, whose edit re-syncs this unsent invoice from the new rate (resyncProformaInvoiceFromLoadRate).
  const editLoad = (fields: Record<string, unknown>, charges?: Array<{ code: string; description: string; amount_cents: number }>) =>
    updateDispatchLoad(client as never, {
      loadId: inv.load_id, operatingCompanyId: co, requestingUserUuid: input.actorUserId, requestingUserRole: input.actorRole,
      override_reason: reason, fields, ...(charges ? { charges } : {}),
    } as never);
  if (input.newCustomerId) {
    const ok = (await client.query(`SELECT 1 FROM mdata.customers WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL`, [input.newCustomerId, co])).rows.length;
    if (!ok) throw new InvoiceReissueRefused("customer_not_in_company");
    await editLoad({ customer_id: input.newCustomerId });
  }
  const built = await buildInvoiceFromLoad(client as never, { operatingCompanyId: co, loadId: inv.load_id, requestedDisplayId: number === "next" ? null : number } as never);
  const newId = String(built.invoice.id);
  if (newTotal !== load.rate) await editLoad({}, [{ code: "linehaul", description: "Line haul", amount_cents: newTotal }]);
  if (String(built.invoice.status) === "proforma") {
    const c = await convertProformaToOfficial(client as never, { operatingCompanyId: co, loadId: inv.load_id, userId: input.actorUserId });
    if (!c.converted) throw new InvoiceReissueRefused(`proforma_convert_refused: ${c.reason}`);
  }
  const fresh = (await client.query<{ display_id: string; total: number; customer_id: string }>(`SELECT display_id, total_cents::int AS total, customer_id::text AS customer_id FROM accounting.invoices WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [newId, co])).rows[0]!;
  if (fresh.total !== newTotal) throw new InvoiceReissueRefused(`reissued_total_${fresh.total}_not_${newTotal}`);
  if (input.newCustomerId && fresh.customer_id !== input.newCustomerId) throw new InvoiceReissueRefused("reissued_customer_does_not_follow_the_load");
  const sent = await sendDraftInvoice(client as never, { invoiceId: newId, operatingCompanyId: co, userId: input.actorUserId, mode: input.sendMode ?? "live_feed" });
  if (!(sent as { ok: boolean }).ok) {
    const s = sent as { error?: string; message?: string };
    throw new InvoiceReissueRefused(`send_refused: ${s.error ?? ""} ${String(s.message ?? "").slice(0, 200)}`);
  }
  await appendCrudAudit(client as never, input.actorUserId, INVOICE_REISSUED_EVENT, {
    resource_type: "accounting.invoices", resource_id: newId, operating_company_id: co, load_id: inv.load_id, reason,
    voided_invoice_id: inv.id, original_display_id: released.original_display_id, released_display_id: released.released_display_id,
    reversal_journal_entry_id: voided.reversalJournalEntryId, new_display_id: fresh.display_id, before_total_cents: inv.total, after_total_cents: fresh.total,
  }, "info", "LEAD-443.151-B");
  return {
    load_id: inv.load_id, voided_invoice_id: inv.id, original_display_id: released.original_display_id, released_display_id: released.released_display_id,
    reversal_journal_entry_id: voided.reversalJournalEntryId, new_invoice_id: newId, new_display_id: fresh.display_id,
    before_total_cents: inv.total, after_total_cents: fresh.total,
  };
}
