// ROUND 315 (FINAL) step 3 — the Submit to Factor tab's server side. No GL math lives here: the purchase itself is
// created and posted only through purchase.service.ts (createPurchaseDraft / postPurchase).
//   listPurchaseCandidates   EVERY open invoice of the company (sent / partial, not voided, not sample, not factored,
//                            not on a live purchase line, not marked customer direct pay) with its customer, PO, load,
//                            settlement / pre-settlement, PU / DEL dates, docs and the expected split from the
//                            customer's factor assignment (the same getFactorForCustomer rates createPurchaseDraft uses).
//   markInvoiceDirectPay /   Owner marks an invoice "Customer direct pay" (never sold to the factor) and can undo it;
//   undoInvoiceDirectPay     one audit row each. Owner-only is enforced by the route gate.
//   runPurchaseFeedGate      the FEED GATE (driver_finance.feed_intakes, kind 'invoice') for every invoice entering a
//                            purchase — a red invoice cannot enter one.
//   loadPurchaseSendPacket   what "Save and send" emails to the factor: the posted purchase's lines + their load docs.
import { appendCrudAudit } from "../audit/crud-audit.js";
import { INVOICE_PLEDGE_CENTS_SQL } from "../accounting/shared.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { assertSubjectMayCloseOnClient, FeedGateError, type FeedCheckRow } from "../driver-finance/feed-gate/feed-gate.service.js";
import { resolvePurchaseRate, type PurchaseRateSource } from "./factor.service.js";
import { loadHasApprovedPodSql, loadHasFileCategorySql } from "./submission-queue.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export class PurchaseCandidateError extends Error {
  constructor(readonly code: string, readonly statusCode: number, readonly details?: unknown) {
    super(code);
  }
}

export const CANDIDATE_LIMIT = 2000;

export type PurchaseCandidate = {
  invoice_id: string;
  invoice_display_id: string | null;
  invoice_status: string;
  issue_date: string | null;
  due_date: string | null;
  total_cents: number;
  open_cents: number;
  customer_id: string | null;
  customer_name: string | null;
  customer_po_number: string | null;
  customer_wo_number: string | null;
  load_id: string | null;
  load_number: string | null;
  settlement_id: string | null;
  settlement_display_id: string | null;
  settlement_is_presettlement: boolean;
  settlement_status: string | null;
  pickup_at: string | null;
  delivery_at: string | null;
  factor_id: string | null;
  factor_name: string | null;
  reserve_rate: number;
  fee_rate: number;
  cash_reserve_rate: number;
  /** Lead ROUND 297 — ONE base for every amount on the row: the open amount Faro would purchase. */
  base_cents: number;
  /** Where the rate came from: the customer's assignment, the company's Faro agreement, or none (with the reason). */
  rate_source: PurchaseRateSource;
  rate_reason: string | null;
  /** null (never 0) when no rate applies — rate_reason says why. */
  expected_escrow_reserve_cents: number | null;
  expected_cash_reserve_cents: number | null;
  expected_fee_cents: number | null;
  has_bol: boolean;
  has_pod: boolean;
  has_rate_confirmation: boolean;
  docs_complete: boolean;
  missing_docs: string[];
};

export type FactoringVendorOption = { id: string; vendor_name: string; email: string | null; is_default: boolean };

export type CandidateFilters = { from?: string; to?: string; customer_id?: string; search?: string };

const num = (v: unknown) => (v == null ? 0 : Number(v));
const str = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));
const day = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

/** The SQL behind the candidate list — exported so its shape is pinned by a unit test. */
export function buildCandidateQuery(oci: string, f: CandidateFilters): { sql: string; values: unknown[] } {
  const values: unknown[] = [oci];
  const where: string[] = [];
  const add = (sql: (n: number) => string, v: unknown) => {
    values.push(v);
    where.push(sql(values.length));
  };
  if (f.customer_id) add((n) => `i.customer_id = $${n}::uuid`, f.customer_id);
  if (f.from) add((n) => `i.issue_date >= $${n}::date`, f.from);
  if (f.to) add((n) => `i.issue_date <= $${n}::date`, f.to);
  if (f.search?.trim()) {
    add(
      (n) => `(i.display_id ILIKE $${n} OR COALESCE(c.customer_name, c2.customer_name) ILIKE $${n} OR l.load_number::text ILIKE $${n}
               OR l.customer_po_number ILIKE $${n} OR l.customer_wo_number ILIKE $${n})`,
      `%${f.search.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    );
  }
  const sql = `
    SELECT i.id::text AS invoice_id, i.display_id AS invoice_display_id, i.status::text AS invoice_status,
           i.issue_date::text AS issue_date, i.due_date::text AS due_date, i.total_cents::bigint AS total_cents,
           (${INVOICE_PLEDGE_CENTS_SQL})::bigint AS open_cents,
           i.customer_id::text AS customer_id, COALESCE(c.customer_name, c2.customer_name) AS customer_name,
           l.id::text AS load_id, l.load_number::text AS load_number, l.customer_po_number, l.customer_wo_number,
           st.id::text AS settlement_id, st.display_id AS settlement_display_id,
           COALESCE(st.is_presettlement, false) AS settlement_is_presettlement, st.status::text AS settlement_status,
           pu.at AS pickup_at, del.at AS delivery_at,
           CASE WHEN l.id IS NULL THEN false ELSE ${loadHasFileCategorySql("l.id", "bol")} END AS has_bol,
           CASE WHEN l.id IS NULL THEN false ELSE (${loadHasApprovedPodSql("l.id", "i.operating_company_id")} OR ${loadHasFileCategorySql("l.id", "pod")}) END AS has_pod,
           CASE WHEN l.id IS NULL THEN false ELSE ${loadHasFileCategorySql("l.id", ["rate_confirmation", "rate_con"])} END AS has_rate_confirmation
      FROM accounting.invoices i
      -- ACCT-F5787 pattern: an archived customer must not silently drop a real open invoice from the list.
      LEFT JOIN mdata.customers c ON c.id = i.customer_id AND c.operating_company_id = $1::uuid
      LEFT JOIN LATERAL (SELECT * FROM mdata.get_customer_same_company(i.customer_id, i.operating_company_id) WHERE c.id IS NULL) c2 ON true
      LEFT JOIN mdata.loads l ON l.id = i.source_load_id AND l.operating_company_id = i.operating_company_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(s.actual_arrival_at, s.appointment_start_at, s.scheduled_arrival_at)::text AS at
          FROM mdata.load_stops s
         WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL AND s.stop_type::text = 'pickup'
         ORDER BY s.sequence_number ASC LIMIT 1
      ) pu ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(s.actual_departure_at, s.actual_arrival_at, s.appointment_start_at, s.scheduled_arrival_at)::text AS at
          FROM mdata.load_stops s
         WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL AND s.stop_type::text = 'delivery'
         ORDER BY s.sequence_number DESC LIMIT 1
      ) del ON true
      LEFT JOIN LATERAL (
        SELECT ds.id, ds.display_id, ds.is_presettlement, ds.status
          FROM driver_finance.settlement_lines sl
          JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id AND ds.operating_company_id = i.operating_company_id
         WHERE sl.load_id = l.id AND sl.voided_at IS NULL AND ds.voided_at IS NULL
         ORDER BY COALESCE(ds.is_presettlement, false) ASC, ds.created_at DESC
         LIMIT 1
      ) st ON true
     WHERE i.operating_company_id = $1::uuid
       AND i.voided_at IS NULL
       AND COALESCE(i.is_sample_data, false) = false
       AND i.status::text IN ('sent', 'partial')
       -- ROUND 297: ONE definition of an open invoice (Customers tile, Factoring): live, not void, balance above $0.
       -- Status alone let invoice 13525 ($0.00, status 'sent') count as a candidate -- 105 here vs 104 on Customers.
       AND i.amount_open_cents > 0
       AND COALESCE(i.factoring_status, 'not_factored') = 'not_factored'
       AND i.factoring_direct_pay_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM accounting.factoring_purchase_lines pl WHERE pl.invoice_id = i.id AND pl.voided_at IS NULL)
       ${where.length ? `AND ${where.join(" AND ")}` : ""}
     ORDER BY i.issue_date ASC NULLS LAST, i.display_id ASC
     LIMIT ${CANDIDATE_LIMIT + 1}
  `;
  return { sql, values };
}

/** Faro (the factoring company) as mdata.vendors rows of this company; the default is the one already used by a purchase/advance. */
export async function listFactoringVendorOptions(client: DbClient, oci: string): Promise<FactoringVendorOption[]> {
  const r = await client.query<Record<string, unknown>>(
    `
      -- ROUND 321 item 4: "Send to" default = the factor setup's submission email (then its general email, then the vendor's).
      SELECT v.id::text, v.vendor_name, COALESCE(
               (SELECT NULLIF(TRIM(COALESCE(f.remittance_details->>'submissionEmail', f.remittance_details->>'generalEmail', f.remittance_details->>'general_email')), '')
                  FROM factoring.canonical_factor_agreements a JOIN factoring.factor f ON f.id = a.factor_profile_id
                 WHERE a.factor_vendor_id = v.id AND a.voided_at IS NULL AND f.voided_at IS NULL
                 ORDER BY a.effective_from DESC LIMIT 1),
               NULLIF(TRIM(v.email), '')) AS email,
             (EXISTS (SELECT 1 FROM accounting.factoring_purchases p WHERE p.factoring_company_vendor_id = v.id AND p.operating_company_id = $1::uuid)
              OR EXISTS (SELECT 1 FROM accounting.factoring_advances fa WHERE fa.factoring_company_vendor_id = v.id AND fa.operating_company_id = $1::uuid)) AS used,
             (COALESCE(v.is_duplicate, false) OR v.merge_target_id IS NOT NULL) AS dup
        FROM mdata.vendors v
       WHERE v.operating_company_id = $1::uuid
         AND v.deactivated_at IS NULL
         AND v.vendor_name ~* '\\mfaro\\M'
       ORDER BY 4 DESC, 5 ASC, v.created_at ASC
    `,
    [oci]
  );
  return r.rows.map((row, idx) => ({
    id: String(row.id),
    vendor_name: String(row.vendor_name),
    email: row.email ? String(row.email) : null,
    is_default: idx === 0,
  }));
}

export async function listPurchaseCandidates(client: DbClient, oci: string, filters: CandidateFilters) {
  const { sql, values } = buildCandidateQuery(oci, filters);
  const res = await client.query<Record<string, unknown>>(sql, values);
  const capped = res.rows.length > CANDIDATE_LIMIT;
  const rows = capped ? res.rows.slice(0, CANDIDATE_LIMIT) : res.rows;

  // Expected split: the SAME effective-dated assignment createPurchaseDraft prices a line with (as of today, the
  // tab's default purchase date). The factor carries no cash-reserve rate, so the expected cash reserve is 0 —
  // Faro's actual cash reserve, when it holds one, is entered from the purchase report.
  const asOf = companyBusinessDate();
  const rates = new Map<string, Awaited<ReturnType<typeof resolvePurchaseRate>>>();
  const candidates: PurchaseCandidate[] = [];
  for (const row of rows) {
    const customerId = row.customer_id ? String(row.customer_id) : null;
    let rate = customerId ? rates.get(customerId) : undefined;
    if (customerId && !rate) {
      rate = await resolvePurchaseRate(client as never, oci, customerId, asOf);
      rates.set(customerId, rate);
    }
    const open = num(row.open_cents);
    const hasBol = Boolean(row.has_bol);
    const hasPod = Boolean(row.has_pod);
    const hasRc = Boolean(row.has_rate_confirmation);
    const missing: string[] = [];
    if (!row.load_id) missing.push("Load");
    if (!hasBol) missing.push("BOL");
    if (!hasPod) missing.push("POD");
    if (!hasRc) missing.push("Rate confirmation");
    candidates.push({
      invoice_id: String(row.invoice_id),
      invoice_display_id: str(row.invoice_display_id),
      invoice_status: String(row.invoice_status),
      issue_date: day(row.issue_date),
      due_date: day(row.due_date),
      total_cents: num(row.total_cents),
      open_cents: open,
      customer_id: customerId,
      customer_name: str(row.customer_name),
      customer_po_number: str(row.customer_po_number),
      customer_wo_number: str(row.customer_wo_number),
      load_id: str(row.load_id),
      load_number: str(row.load_number),
      settlement_id: str(row.settlement_id),
      settlement_display_id: str(row.settlement_display_id),
      settlement_is_presettlement: Boolean(row.settlement_is_presettlement),
      settlement_status: str(row.settlement_status),
      pickup_at: str(row.pickup_at),
      delivery_at: str(row.delivery_at),
      factor_id: rate?.factor_id ?? null,
      factor_name: rate?.factor_name ?? null,
      reserve_rate: rate?.reserve ?? 0,
      fee_rate: rate?.fee ?? 0,
      cash_reserve_rate: rate?.cash ?? 0,
      base_cents: open,
      rate_source: rate?.source ?? "none",
      rate_reason: rate ? rate.reason : "Invoice has no customer — no factor agreement can apply",
      expected_escrow_reserve_cents: rate && rate.source !== "none" ? Math.round(open * rate.reserve) : null,
      expected_cash_reserve_cents: rate && rate.source !== "none" ? Math.round(open * rate.cash) : null,
      expected_fee_cents: rate && rate.source !== "none" ? Math.round(open * rate.fee) : null,
      has_bol: hasBol,
      has_pod: hasPod,
      has_rate_confirmation: hasRc,
      docs_complete: missing.length === 0,
      missing_docs: missing,
    });
  }
  return { candidates, capped, limit: CANDIDATE_LIMIT, factoring_vendors: await listFactoringVendorOptions(client, oci), as_of: asOf };
}

async function lockInvoice(client: DbClient, oci: string, invoiceId: string) {
  const r = await client.query<Record<string, unknown>>(
    `SELECT i.id::text, i.display_id, i.status::text AS status, COALESCE(i.factoring_status, 'not_factored') AS factoring_status,
            i.factoring_direct_pay_at, i.voided_at,
            EXISTS (SELECT 1 FROM accounting.factoring_purchase_lines pl WHERE pl.invoice_id = i.id AND pl.voided_at IS NULL) AS on_purchase
       FROM accounting.invoices i WHERE i.id = $1::uuid AND i.operating_company_id = $2::uuid FOR UPDATE`,
    [invoiceId, oci]
  );
  const row = r.rows[0];
  if (!row) throw new PurchaseCandidateError("invoice_not_found", 404);
  return row;
}

export async function markInvoiceDirectPay(client: DbClient, input: { operatingCompanyId: string; actorUserId: string; invoiceId: string; reason: string }) {
  const oci = input.operatingCompanyId;
  const inv = await lockInvoice(client, oci, input.invoiceId);
  if (inv.voided_at) throw new PurchaseCandidateError("invoice_voided", 409);
  if (inv.factoring_direct_pay_at) throw new PurchaseCandidateError("invoice_already_direct_pay", 409);
  if (inv.factoring_status !== "not_factored") throw new PurchaseCandidateError(`invoice_already_factored:${inv.factoring_status}`, 409);
  if (inv.on_purchase) throw new PurchaseCandidateError("invoice_on_live_purchase", 409);
  await client.query(
    `UPDATE accounting.invoices
        SET factoring_direct_pay_at = now(), factoring_direct_pay_by_user_id = $3::uuid, factoring_direct_pay_reason = $4,
            updated_at = now(), updated_by_user_id = $3::uuid
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [input.invoiceId, oci, input.actorUserId, input.reason]
  );
  await appendCrudAudit(client as never, input.actorUserId, "accounting.invoice_factoring_direct_pay_marked", {
    resource_type: "accounting.invoices", resource_id: input.invoiceId, operating_company_id: oci,
    display_id: inv.display_id, reason: input.reason,
  }, "info", "ROUND-315-SUBMIT-TO-FACTOR");
  return { invoice_id: input.invoiceId, factoring_direct_pay: true };
}

export async function undoInvoiceDirectPay(client: DbClient, input: { operatingCompanyId: string; actorUserId: string; invoiceId: string; reason: string }) {
  const oci = input.operatingCompanyId;
  const inv = await lockInvoice(client, oci, input.invoiceId);
  if (!inv.factoring_direct_pay_at) throw new PurchaseCandidateError("invoice_not_direct_pay", 409);
  await client.query(
    `UPDATE accounting.invoices
        SET factoring_direct_pay_at = NULL, factoring_direct_pay_by_user_id = NULL, factoring_direct_pay_reason = NULL,
            updated_at = now(), updated_by_user_id = $3::uuid
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [input.invoiceId, oci, input.actorUserId]
  );
  await appendCrudAudit(client as never, input.actorUserId, "accounting.invoice_factoring_direct_pay_undone", {
    resource_type: "accounting.invoices", resource_id: input.invoiceId, operating_company_id: oci,
    display_id: inv.display_id, reason: input.reason,
  }, "info", "ROUND-315-SUBMIT-TO-FACTOR");
  return { invoice_id: input.invoiceId, factoring_direct_pay: false };
}

/** Direct-pay invoices of the company (the tab's "undo" list). */
export async function listDirectPayInvoices(client: DbClient, oci: string) {
  const r = await client.query<Record<string, unknown>>(
    `SELECT i.id::text AS invoice_id, i.display_id AS invoice_display_id, i.customer_id::text AS customer_id,
            COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(i.customer_id, i.operating_company_id)) AS customer_name,
            i.total_cents::bigint AS total_cents, i.factoring_direct_pay_at::text AS direct_pay_at, i.factoring_direct_pay_reason AS reason
       FROM accounting.invoices i
       LEFT JOIN mdata.customers c ON c.id = i.customer_id AND c.operating_company_id = $1::uuid
      WHERE i.operating_company_id = $1::uuid AND i.voided_at IS NULL AND i.factoring_direct_pay_at IS NOT NULL
      ORDER BY i.factoring_direct_pay_at DESC LIMIT 500`,
    [oci]
  );
  return r.rows.map((row) => ({ ...row, total_cents: num(row.total_cents) }));
}

export type FeedGateInvoiceResult = {
  invoice_id: string;
  passed: boolean;
  intake_id: string | null;
  error: string | null;
  reds: Array<Pick<FeedCheckRow, "check_key" | "check_group" | "subject_label" | "missing" | "fix_link">>;
};

/**
 * FEED GATE for a purchase: runs the canonical invoice check set (assertSubjectMayCloseOnClient, kind 'invoice') for
 * each invoice and collects the reds instead of stopping at the first. The intake + check rows are WORM evidence, so the
 * caller runs this in its own scope that COMMITS (it returns, never throws, on a red).
 */
export async function runPurchaseFeedGate(
  client: DbClient,
  oci: string,
  invoiceIds: string[],
  userId: string,
  // ROUND 321 item 3: the Owner's override reason for missing BOL / POD / rate confirmation (>= 10 chars). With it the
  // documents check is recorded on the intake as 'na' WITH the reason (never a silent pass); without it, missing docs are red.
  docsOverrideReason: string | null = null
): Promise<FeedGateInvoiceResult[]> {
  const override = (docsOverrideReason ?? "").trim();
  // Purchase-entry pre-checks the generic invoice check set does not carry: the invoice is tied to a load (the
  // receivable Faro buys is a load's freight bill) and its A/R journal entry is posted (the invoice feed set filters
  // the load set's invoice.* keys, so invoice.ar_je_posted does not run on kind 'invoice'). Same SQL as that check.
  const pre = await client.query<{ id: string; display_id: string | null; has_load: boolean; ar_je_posted: boolean; missing_docs: string[] }>(
    `SELECT i.id::text, i.display_id,
            CASE WHEN i.source_load_id IS NULL THEN '{}'::text[] ELSE array_remove(ARRAY[
              CASE WHEN ${loadHasFileCategorySql("i.source_load_id", "bol")} THEN NULL ELSE 'BOL' END,
              CASE WHEN (${loadHasApprovedPodSql("i.source_load_id", "i.operating_company_id")} OR ${loadHasFileCategorySql("i.source_load_id", "pod")}) THEN NULL ELSE 'POD' END,
              CASE WHEN ${loadHasFileCategorySql("i.source_load_id", ["rate_confirmation", "rate_con"])} THEN NULL ELSE 'Rate confirmation' END
            ], NULL) END AS missing_docs,
            (i.source_load_id IS NOT NULL AND EXISTS (SELECT 1 FROM mdata.loads l WHERE l.id = i.source_load_id AND l.operating_company_id = i.operating_company_id AND l.soft_deleted_at IS NULL)) AS has_load,
            EXISTS (SELECT 1 FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
                     WHERE p.source_transaction_type = 'invoice' AND p.source_transaction_id = i.id::text AND je.status = 'posted'
                       AND je.operating_company_id = i.operating_company_id) AS ar_je_posted
       FROM accounting.invoices i WHERE i.operating_company_id = $1::uuid AND i.id = ANY($2::uuid[])`,
    [oci, invoiceIds]
  );
  const preById = new Map(pre.rows.map((r) => [r.id, r]));
  const out: FeedGateInvoiceResult[] = [];
  for (const invoiceId of invoiceIds) {
    const p = preById.get(invoiceId);
    const extra: FeedGateInvoiceResult["reds"] = [];
    const label = `Invoice ${p?.display_id ?? invoiceId}`;
    const fix = `/accounting/invoices/${invoiceId}`;
    if (!p) extra.push({ check_key: "purchase.invoice_in_company", check_group: "purchase", subject_label: label, missing: "invoice not found in this company", fix_link: null });
    else {
      if (!p.has_load) extra.push({ check_key: "purchase.invoice_has_load", check_group: "purchase", subject_label: label, missing: "invoice has no load", fix_link: fix });
      if (!p.ar_je_posted) extra.push({ check_key: "purchase.invoice_ar_je_posted", check_group: "purchase", subject_label: label, missing: "no posted A/R journal entry for this invoice", fix_link: fix });
      // Documents: an override covers DOCUMENTS only -- the load and the posted A/R JE above stay hard requirements.
      if (p.missing_docs.length && override.length < 10) {
        extra.push({ check_key: "purchase.invoice_billing_docs", check_group: "purchase", subject_label: label, missing: `load missing ${p.missing_docs.join(", ")} (an Owner override reason releases it)`, fix_link: fix });
      }
    }
    if (!p) {
      out.push({ invoice_id: invoiceId, passed: false, intake_id: null, error: "feed_gate_subject_not_found", reds: extra });
      continue;
    }
    try {
      const run = await assertSubjectMayCloseOnClient(client as never, oci, "invoice", invoiceId, userId);
      if (p.missing_docs.length && override.length >= 10) {
        await recordDocsOverrideCheck(client, oci, run.intake.id, invoiceId, label, p.missing_docs, override);
      }
      out.push({ invoice_id: invoiceId, passed: extra.length === 0, intake_id: run.intake.id, error: extra.length ? "feed_gate_blocked" : null, reds: extra });
    } catch (err) {
      if (!(err instanceof FeedGateError)) throw err;
      const details = (err.details ?? {}) as { intake_id?: string; reds?: FeedCheckRow[] };
      if (details.intake_id && p.missing_docs.length && override.length >= 10) {
        await recordDocsOverrideCheck(client, oci, details.intake_id, invoiceId, label, p.missing_docs, override);
      }
      out.push({
        invoice_id: invoiceId,
        passed: false,
        intake_id: details.intake_id ?? null,
        error: err.code,
        reds: [
          ...extra,
          ...(details.reds ?? []).map((r) => ({
            check_key: r.check_key, check_group: r.check_group, subject_label: r.subject_label, missing: r.missing, fix_link: r.fix_link,
          })),
        ],
      });
    }
  }
  return out;
}

/** Owner docs override on the invoice's Feed Gate intake: one WORM check row, status 'na', carrying the reason. */
async function recordDocsOverrideCheck(
  client: DbClient,
  oci: string,
  intakeId: string,
  invoiceId: string,
  label: string,
  missingDocs: string[],
  reason: string
) {
  await client.query(
    `INSERT INTO driver_finance.feed_intake_checks
       (operating_company_id, intake_id, run_no, check_group, check_key, status, subject_table, subject_id, subject_label, missing, fix_link, measured)
     SELECT $1::uuid, $2::uuid, fi.last_run_no, 'purchase', 'purchase.invoice_billing_docs', 'na', 'accounting.invoices', $3::uuid, $4,
            $5, $6, $7::jsonb
       FROM driver_finance.feed_intakes fi WHERE fi.id = $2::uuid AND fi.operating_company_id = $1::uuid`,
    [oci, intakeId, invoiceId, label, `Owner override: ${reason} (missing ${missingDocs.join(", ")})`, `/accounting/invoices/${invoiceId}`,
      JSON.stringify({ override: true, missing_docs: missingDocs, reason })]
  );
}

export type SendPacketDoc = { load_id: string; load_number: string | null; category_code: string; file_id: string; filename: string; mime_type: string | null; size_bytes: number; r2_key: string };

/** Everything "Save and send" needs about a POSTED purchase: header, recipient, lines and each line's load docs. */
export async function loadPurchaseSendPacket(client: DbClient, oci: string, purchaseId: string) {
  const head = (await client.query<Record<string, unknown>>(
    `SELECT p.id::text, p.display_id, p.status, p.purchase_date::text AS purchase_date, p.faro_report_ref, p.invoice_count,
            p.gross_cents, v.vendor_name, COALESCE(
               (SELECT NULLIF(TRIM(COALESCE(f.remittance_details->>'submissionEmail', f.remittance_details->>'generalEmail', f.remittance_details->>'general_email')), '')
                  FROM factoring.canonical_factor_agreements a JOIN factoring.factor f ON f.id = a.factor_profile_id
                 WHERE a.factor_vendor_id = v.id AND a.voided_at IS NULL AND f.voided_at IS NULL
                 ORDER BY a.effective_from DESC LIMIT 1),
               NULLIF(TRIM(v.email), '')) AS vendor_email, co.legal_name AS company_name,
            p.docs_override_at::text AS docs_override_at, p.docs_override_reason
       FROM accounting.factoring_purchases p
       JOIN mdata.vendors v ON v.id = p.factoring_company_vendor_id
       JOIN org.companies co ON co.id = p.operating_company_id
      WHERE p.id = $1::uuid AND p.operating_company_id = $2::uuid`,
    [purchaseId, oci]
  )).rows[0];
  if (!head) throw new PurchaseCandidateError("factoring_purchase_not_found", 404);
  if (head.status !== "posted") throw new PurchaseCandidateError(`factoring_purchase_not_posted:${head.status}`, 409);
  const lines = (await client.query<Record<string, unknown>>(
    `SELECT pl.line_no, pl.invoice_id::text, i.display_id AS invoice_display_id, pl.gross_cents, pl.load_id::text,
            l.load_number::text AS load_number, l.customer_po_number,
            COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(pl.customer_id, pl.operating_company_id)) AS customer_name,
            CASE WHEN pl.load_id IS NULL THEN false ELSE ${loadHasFileCategorySql("pl.load_id", "bol")} END AS has_bol,
            CASE WHEN pl.load_id IS NULL THEN false ELSE (${loadHasApprovedPodSql("pl.load_id", "pl.operating_company_id")} OR ${loadHasFileCategorySql("pl.load_id", "pod")}) END AS has_pod,
            CASE WHEN pl.load_id IS NULL THEN false ELSE ${loadHasFileCategorySql("pl.load_id", ["rate_confirmation", "rate_con"])} END AS has_rate_confirmation
       FROM accounting.factoring_purchase_lines pl
       JOIN accounting.invoices i ON i.id = pl.invoice_id AND i.operating_company_id = pl.operating_company_id
       LEFT JOIN mdata.customers c ON c.id = pl.customer_id AND c.operating_company_id = pl.operating_company_id
       LEFT JOIN mdata.loads l ON l.id = pl.load_id AND l.operating_company_id = pl.operating_company_id
      WHERE pl.purchase_id = $1::uuid AND pl.operating_company_id = $2::uuid AND pl.voided_at IS NULL
      ORDER BY pl.line_no`,
    [purchaseId, oci]
  )).rows;
  const loadIds = [...new Set(lines.map((l) => l.load_id).filter(Boolean) as string[])];
  const docs = loadIds.length
    ? (await client.query<Record<string, unknown>>(
        `SELECT fl.entity_id::text AS load_id, l.load_number::text AS load_number, fc.code AS category_code, f.id::text AS file_id,
                f.original_filename AS filename, f.mime_type, COALESCE(f.size_bytes, 0)::bigint AS size_bytes, f.r2_key
           FROM docs.file_links fl
           JOIN docs.files f ON f.id = fl.file_id AND f.operating_company_id = $2::uuid
           JOIN catalogs.file_categories fc ON fc.id = f.category_id
           JOIN mdata.loads l ON l.id = fl.entity_id AND l.operating_company_id = $2::uuid
          WHERE fl.entity_type = 'load' AND fl.entity_id = ANY($1::uuid[]) AND fl.deleted_at IS NULL AND f.deleted_at IS NULL
            AND f.upload_completed_at IS NOT NULL AND f.r2_key IS NOT NULL
            AND fc.code IN ('bol', 'pod', 'rate_confirmation', 'rate_con')
          ORDER BY l.load_number, fc.code, f.created_at`,
        [loadIds, oci]
      )).rows
    : [];
  const missing = lines
    .map((l) => ({
      invoice_id: String(l.invoice_id),
      invoice_display_id: str(l.invoice_display_id),
      load_id: str(l.load_id),
      load_number: str(l.load_number),
      missing: [!l.load_id && "Load", !l.has_bol && "BOL", !l.has_pod && "POD", !l.has_rate_confirmation && "Rate confirmation"].filter(Boolean) as string[],
    }))
    .filter((m) => m.missing.length > 0);
  return {
    head,
    lines,
    docs: docs.map((d) => ({ ...d, size_bytes: num(d.size_bytes) })) as unknown as SendPacketDoc[],
    missing,
  };
}

const money = (cents: unknown) => `$${(num(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The plain-text schedule of accounts in the email body (one line per invoice) and the CSV attachment. */
export function buildSchedule(head: Record<string, unknown>, lines: Array<Record<string, unknown>>) {
  const text = [
    `Schedule of accounts ${head.display_id} — ${head.company_name ?? ""}`,
    `Purchase date: ${head.purchase_date}${head.faro_report_ref ? ` · Report ref: ${head.faro_report_ref}` : ""}`,
    `Invoices: ${lines.length} · Gross: ${money(head.gross_cents)}`,
    "",
    ...lines.map((l) => `${l.invoice_display_id} · ${l.customer_name ?? ""} · Load ${l.load_number ?? "—"} · PO ${l.customer_po_number ?? "—"} · ${money(l.gross_cents)}`),
    "",
    "Attached: the invoices (PDF) and each load's BOL, POD and rate confirmation.",
  ].join("\n");
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    ["Invoice", "Customer", "Load", "Customer PO", "Gross"].map(esc).join(","),
    ...lines.map((l) => [l.invoice_display_id, l.customer_name, l.load_number, l.customer_po_number, (num(l.gross_cents) / 100).toFixed(2)].map(esc).join(",")),
  ].join("\n");
  return { text, csv };
}
