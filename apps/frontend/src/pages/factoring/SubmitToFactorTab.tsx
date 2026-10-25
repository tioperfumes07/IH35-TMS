// ROUND 315 (FINAL) step 3 — the Factoring module's "Submit Invoice" tab: Submit to Factor.
// Every open invoice of the company (not the 13-of-105 submission-queue subset), selectable, with its customer, PO,
// load, settlement / pre-settlement, PU / DEL dates, expected escrow reserve / cash reserve / fee from the customer's
// factor assignment, docs (BOL / POD / rate confirmation) and a per-row "Customer direct pay" action. The totals panel
// previews the purchase; Save creates the purchase (POST /factoring/purchases — the server runs the FEED GATE on every
// invoice first) and posts it (POST /:id/post) through the one secured-borrowing poster. "Save and send" also emails
// the invoices + their documents to the factor. Owner-only: the server refuses everyone else (403).
import { OverrideButton } from "../../components/override/OverrideButton";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import {
  createFactoringPurchase,
  editFactoringPurchase,
  getFactoringPurchase,
  listDirectPayInvoices,
  listPurchaseCandidates,
  markInvoiceDirectPay,
  postFactoringPurchase,
  sendFactoringPurchase,
  undoInvoiceDirectPay,
  voidFactoringPurchase,
  type EditFactoringPurchaseBody,
  type FactoringPurchaseDetail,
  type FeedGateBlocked,
  type PurchaseCandidate,
  type DocsOverride,
} from "../../api/factoring-purchases";
import { Button } from "../../components/Button";
import { EntityMultiSelect } from "../../components/EntityMultiSelect";
import { Modal } from "../../components/Modal";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { SaveDropdown } from "../../components/forms/SaveDropdown";
import { DataPanel } from "../../components/layout/DataPanel";
import { InfoPopover } from "../../components/shared/InfoPopover";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { CollapsedListFilters } from "../../components/table/CollapsedListFilters";
import { TableSearch } from "../../components/table/TableSearch";
import {colors, FORM_FIELD_CONTROL_SIZE_CLASS, typography, FILTER_CONTROL_SIZE_CLASS} from "../../design/tokens";
import { entityLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";

export const OWNER_ONLY_MESSAGE = "Only the Owner creates, closes or matches a factoring purchase.";

type Filters = { customerId: string; from: string; to: string };
const EMPTY_FILTERS: Filters = { customerId: "", from: "", to: "" };

const FIELD_LABEL_STYLE = {
  fontSize: typography.sectionSubhead,
  fontWeight: 700,
  color: colors.columnHeader,
  letterSpacing: typography.tightUpper,
} as const;

function todayIso() {
  return companyToday();
}

function dateCell(v: string | null) {
  return v ? formatDateUS(v) : "—";
}

export function loadDocsUploadPath(loadId: string) {
  return `/dispatch/loads/${encodeURIComponent(loadId)}?tab=Documents`;
}

/** Selection totals — the same formula the purchase engine applies (purchase.service.ts). */
/** Faro's actual split for one invoice (from its purchase report). Absent = the expected split from the factor rates. */
export type LineActuals = { escrow_reserve_cents: number; cash_reserve_cents: number; fee_cents: number };

/** 443.171 — Faro may buy less than the open balance (bought 3,000 of 4,000). Purchased is editable DOWN only:
 *  never above the open balance, never zero (an invoice Faro did not buy is simply not selected). */
export function clampPurchased(purchasedCents: number | null | undefined, openCents: number) {
  if (purchasedCents == null || !Number.isFinite(purchasedCents)) return openCents;
  return Math.min(openCents, Math.max(1, Math.round(purchasedCents)));
}

/** 443.171 — split a total across lines pro rata by weight, to the cent (largest remainder): the parts always sum to
 *  exactly `total`; ties go to the later line, so a residual cent lands on the last line. All-zero weights put the
 *  whole total on the last line. */
export function distributeTotalProRata(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const t = Math.round(total);
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sumW = w.reduce((a, x) => a + x, 0);
  if (sumW <= 0) return w.map((_, i) => (i === n - 1 ? t : 0));
  const raw = w.map((x) => (t * x) / sumW);
  const parts = raw.map((x) => Math.floor(x));
  let residual = t - parts.reduce((a, x) => a + x, 0);
  const order = raw.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || b.i - a.i);
  for (let k = 0; residual > 0; k = (k + 1) % n, residual--) parts[order[k]!.i]! += 1;
  return parts;
}

/** The figures one line posts with. Faro's actuals win; else the expected split scaled to the purchased amount
 *  (round(expected × purchased / open)). */
export function lineFigures(r: PurchaseCandidate, actuals?: LineActuals, purchasedCents?: number) {
  if (actuals) return actuals;
  const base = r.base_cents;
  const p = purchasedCents == null ? base : clampPurchased(purchasedCents, base);
  const scale = (x: number | null) => (x == null ? 0 : base > 0 && p !== base ? Math.round((x * p) / base) : x);
  return { escrow_reserve_cents: scale(r.expected_escrow_reserve_cents), cash_reserve_cents: scale(r.expected_cash_reserve_cents), fee_cents: scale(r.expected_fee_cents) };
}

/** The purchased amount of one line (default: the whole open balance). */
export function linePurchased(r: PurchaseCandidate, purchased: Record<string, number> = {}) {
  return clampPurchased(purchased[r.invoice_id], r.base_cents);
}

/** Lead ROUND 297: an amount with no factor agreement behind it says so — never a silent $0.00. */
function expectedCell(r: PurchaseCandidate, cents: number | null) {
  if (cents != null) return formatUsdCents(cents);
  return (
    <span className="text-[#1F2A44]" title={r.rate_reason ?? "No factor agreement"}>
      — no factor agreement
    </span>
  );
}

export function computeSelectionTotals(
  rows: PurchaseCandidate[],
  wireFeeCents: number,
  actuals: Record<string, LineActuals> = {},
  purchased: Record<string, number> = {},
) {
  const fig = (r: PurchaseCandidate) => lineFigures(r, actuals[r.invoice_id], linePurchased(r, purchased));
  const gross = rows.reduce((a, r) => a + linePurchased(r, purchased), 0);
  const escrow = rows.reduce((a, r) => a + fig(r).escrow_reserve_cents, 0);
  const cash = rows.reduce((a, r) => a + fig(r).cash_reserve_cents, 0);
  const fee = rows.reduce((a, r) => a + fig(r).fee_cents, 0);
  const advance = gross - escrow - fee;
  const net = advance - cash - wireFeeCents;
  return { count: rows.length, gross, escrow, cash, fee, wire: wireFeeCents, advance, net };
}

/** The open balance Faro did NOT buy across the selection (open − purchased). */
export function selectionNotPurchased(rows: PurchaseCandidate[], purchased: Record<string, number> = {}) {
  return rows.reduce((a, r) => a + r.base_cents - linePurchased(r, purchased), 0);
}

/** 443.171 D — the Owner edits a Selection total; it is written back into the per-line state (never a separate total),
 *  split pro rata so the lines sum exactly to what was typed. Purchased: DOWN only, weighted by open, no line above its
 *  open. Escrow / cash reserve / fee: weighted by each line's purchased amount; the result becomes that line's actuals. */
export type TotalField = "gross" | "escrow_reserve_cents" | "cash_reserve_cents" | "fee_cents";

export function applyTotalEdit(
  rows: PurchaseCandidate[],
  field: TotalField,
  totalCents: number | null,
  actuals: Record<string, LineActuals>,
  purchased: Record<string, number>,
): { actuals: Record<string, LineActuals>; purchased: Record<string, number> } {
  if (!rows.length) return { actuals, purchased };
  if (field === "gross") {
    const open = rows.reduce((a, r) => a + r.base_cents, 0);
    const target = totalCents == null ? open : Math.min(open, Math.max(rows.length, Math.round(totalCents)));
    const parts = distributeTotalProRata(target, rows.map((r) => r.base_cents));
    const next = { ...purchased };
    rows.forEach((r, i) => {
      const p = clampPurchased(parts[i]!, r.base_cents);
      if (p === r.base_cents) delete next[r.invoice_id];
      else next[r.invoice_id] = p;
    });
    return { actuals, purchased: next };
  }
  const parts = distributeTotalProRata(Math.max(0, totalCents ?? 0), rows.map((r) => linePurchased(r, purchased)));
  const next = { ...actuals };
  rows.forEach((r, i) => {
    const f = lineFigures(r, actuals[r.invoice_id], linePurchased(r, purchased));
    next[r.invoice_id] = { ...f, [field]: parts[i]! };
  });
  return { actuals: next, purchased };
}

/** 443.171 E — edit mode pre-fill. A posted purchase's own invoices are factored, so they are not candidates: their rows
 *  are built from the purchase lines. base_cents (the cap a line may be edited up to) = the invoice's open balance before
 *  this purchase when the server reports it, else the line's current gross (capFromGross lists those lines). */
export type EditPrefill = {
  rows: PurchaseCandidate[];
  purchased: Record<string, number>;
  actuals: Record<string, LineActuals>;
  faroNumbers: Record<string, string>;
  capFromGross: string[];
};

const toCents = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? Math.round(n) : 0;
};

export function editPrefillFromPurchase(detail: FactoringPurchaseDetail): EditPrefill {
  const out: EditPrefill = { rows: [], purchased: {}, actuals: {}, faroNumbers: {}, capFromGross: [] };
  for (const l of detail.lines ?? []) {
    const gross = toCents(l.gross_cents);
    const reported = l.invoice_open_cents == null ? null : toCents(l.invoice_open_cents);
    const cap = reported != null && reported >= gross ? reported : gross;
    if (reported == null) out.capFromGross.push(l.invoice_id);
    out.rows.push({
      invoice_id: l.invoice_id,
      invoice_display_id: l.invoice_display_id,
      invoice_status: l.invoice_status ?? "factored",
      issue_date: null,
      due_date: null,
      total_cents: toCents(l.invoice_total_cents),
      open_cents: cap,
      customer_id: l.customer_id,
      customer_name: l.customer_name,
      customer_po_number: null,
      customer_wo_number: null,
      load_id: l.load_id,
      load_number: l.load_number,
      settlement_id: l.settlement_id,
      settlement_display_id: l.settlement_display_id,
      settlement_is_presettlement: false,
      settlement_status: null,
      pickup_at: null,
      delivery_at: null,
      factor_id: null,
      factor_name: detail.factoring_company_name,
      reserve_rate: 0,
      fee_rate: 0,
      cash_reserve_rate: 0,
      base_cents: cap,
      rate_source: "none",
      rate_reason: `On ${detail.display_id}`,
      expected_escrow_reserve_cents: null,
      expected_cash_reserve_cents: null,
      expected_fee_cents: null,
      has_bol: true,
      has_pod: true,
      has_rate_confirmation: true,
      docs_complete: true,
      missing_docs: [],
    });
    if (gross < cap) out.purchased[l.invoice_id] = gross;
    out.actuals[l.invoice_id] = {
      escrow_reserve_cents: toCents(l.escrow_reserve_cents),
      cash_reserve_cents: toCents(l.cash_reserve_cents),
      fee_cents: toCents(l.fee_cents),
    };
    if (l.faro_invoice_number) out.faroNumbers[l.invoice_id] = String(l.faro_invoice_number);
  }
  return out;
}

/** 443.171 E — the PATCH body for Save changes: every selected line with its purchased amount and posted figures. */
export function buildEditPurchaseBody(input: {
  rows: PurchaseCandidate[];
  purchased: Record<string, number>;
  actuals: Record<string, LineActuals>;
  faroNumbers: Record<string, string>;
  purchaseDate: string;
  wireDate: string;
  reportRef: string;
  wireFeeCents: number;
  notes: string;
  reason: string;
}): EditFactoringPurchaseBody {
  return {
    purchase_date: input.purchaseDate,
    wire_date: input.wireDate || null,
    faro_report_ref: input.reportRef.trim() || null,
    wire_fee_cents: input.wireFeeCents,
    notes: input.notes.trim() || null,
    reason: input.reason.trim(),
    lines: input.rows.map((r) => {
      const p = linePurchased(r, input.purchased);
      const faro = input.faroNumbers[r.invoice_id]?.trim();
      return {
        invoice_id: r.invoice_id,
        gross_cents: p,
        ...lineFigures(r, input.actuals[r.invoice_id], p),
        ...(faro ? { faro_invoice_number: faro } : {}),
      };
    }),
  };
}

type SaveError =
  | { kind: "owner_only" }
  | { kind: "bank_matched"; bankTransactionId: string | null }
  | { kind: "feed_gate"; blocked: FeedGateBlocked[] }
  | { kind: "per_invoice"; title: string; rows: Array<{ invoice_id: string; reason: string }> }
  | { kind: "missing_docs"; rows: Array<{ invoice_id: string; invoice_display_id: string | null; load_id: string | null; load_number: string | null; missing: string[] }> }
  | { kind: "message"; text: string };

function toSaveError(err: unknown, fallback: string): SaveError {
  if (err instanceof ApiError) {
    const data = (err.data ?? {}) as { error?: string; details?: unknown; message?: string };
    if (err.status === 403 && data.error === "factoring_purchase_owner_only") return { kind: "owner_only" };
    if (data.error === "factoring_purchase_matched_to_bank_unmatch_first") {
      const d = (data.details ?? {}) as { bank_transaction_id?: string };
      return { kind: "bank_matched", bankTransactionId: d.bank_transaction_id ?? null };
    }
    if (data.error === "purchase_invoices_not_eligible" && Array.isArray(data.details)) {
      return {
        kind: "per_invoice",
        title: "These invoices cannot be on this purchase:",
        rows: (data.details as Array<Record<string, unknown>>).map((d) => ({ invoice_id: String(d.invoice_id ?? ""), reason: String(d.reason ?? "") })),
      };
    }
    const code = String(data.error ?? "");
    const detailText = data.details && typeof data.details === "object" && !Array.isArray(data.details) ? (data.details as { message?: string }).message : undefined;
    if (code === "purchase_line_gross_exceeds_open") {
      return { kind: "message", text: `A line's purchased amount is above the invoice's open balance — lower it.${detailText ? ` ${detailText}` : ""}` };
    }
    if (code.startsWith("period_closed")) return { kind: "message", text: data.message ?? detailText ?? code };
    if (code.startsWith("factoring_purchase_has_later_events")) {
      const status = code.split(":")[1] ?? "";
      return { kind: "message", text: `This purchase already has later events${status ? ` (${status})` : ""} — it cannot be edited.` };
    }
    if (code === "factoring_purchase_not_posted") return { kind: "message", text: "Only a posted purchase can be edited." };
    if (data.error === "feed_gate_blocked" && Array.isArray(data.details)) return { kind: "feed_gate", blocked: data.details as FeedGateBlocked[] };
    if (data.error === "factoring_send_missing_docs" && Array.isArray(data.details)) {
      return { kind: "missing_docs", rows: data.details as Extract<SaveError, { kind: "missing_docs" }>["rows"] };
    }
    if (Array.isArray(data.details)) {
      return {
        kind: "per_invoice",
        title: String(data.error ?? fallback),
        rows: (data.details as Array<Record<string, unknown>>).map((d) => ({
          invoice_id: String(d.invoice_id ?? ""),
          reason: String(d.reason ?? data.error ?? ""),
        })),
      };
    }
    const detailMsg = data.details && typeof data.details === "object" ? (data.details as { message?: string }).message : undefined;
    return { kind: "message", text: detailMsg ?? data.message ?? data.error ?? err.message ?? fallback };
  }
  return { kind: "message", text: err instanceof Error ? err.message : fallback };
}

type Props = {
  companyId: string;
  isOwner: boolean;
  /** 443.171 E — open this posted purchase in the SAME form, pre-filled, in Edit mode. */
  editPurchaseId?: string | null;
  /** After Save changes: back to the purchase detail. */
  onEditDone?: (purchaseId: string) => void;
  onEditCancel?: () => void;
};

export function SubmitToFactorTab({ companyId, isOwner, editPurchaseId = null, onEditDone, onEditCancel }: Props) {
  const editing = Boolean(editPurchaseId);
  const queryClient = useQueryClient();
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [vendorId, setVendorId] = useState<string>("");
  const [purchaseDate, setPurchaseDate] = useState(todayIso());
  const [wireDate, setWireDate] = useState(todayIso());
  const [reportRef, setReportRef] = useState("");
  const [wireFeeCents, setWireFeeCents] = useState<number | null>(0);
  const [sendTo, setSendTo] = useState("");
  // Faro's actual escrow / cash reserve / fee per invoice (its purchase report): Faro holds ONE 1.5% Security Reserve per
  // invoice, normally as Escrow Rsv and on some invoices as Cash Rsv instead (measured on all 89 Faro purchases).
  const [lineActuals, setLineActuals] = useState<Record<string, LineActuals>>({});
  // Faro's own invoice number (Inv on its reports: 001, 002, ...) — every Faro reserve entry resolves through it.
  const [faroNumbers, setFaroNumbers] = useState<Record<string, string>>({});
  // 443.171 — what Faro actually bought per invoice (default: the whole open balance; editable DOWN only).
  const [purchased, setPurchased] = useState<Record<string, number>>({});
  // 443.171 — the wire amount on Faro's report, to tie Net to IH35 out to the cent before posting.
  const [faroWireCents, setFaroWireCents] = useState<number | null>(null);
  // Owner override approval: send although selected loads are missing BOL / POD / rate confirmation.
  // LEAD 443.294: the ONE override button (Owner confirms; nothing typed) — null until confirmed.
  const [docsOverride, setDocsOverride] = useState<DocsOverride | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<SaveError | null>(null);
  const [created, setCreated] = useState<{ purchase: FactoringPurchaseDetail; sentTo: string | null; sendError: SaveError | null } | null>(null);
  const [directPay, setDirectPay] = useState<{ row: { invoice_id: string; label: string }; mode: "mark" | "undo" } | null>(null);
  const [directPayReason, setDirectPayReason] = useState("");
  const [directPayError, setDirectPayError] = useState<string | null>(null);
  const [directPayBusy, setDirectPayBusy] = useState(false);
  const [showDirectPayList, setShowDirectPayList] = useState(false);
  // 443.171 E — edit mode state (the purchase's own lines, the Owner's edit reason, notes).
  const [editRows, setEditRows] = useState<PurchaseCandidate[]>([]);
  const [capFromGross, setCapFromGross] = useState<string[]>([]);
  const [editReason, setEditReason] = useState("");
  const [notes, setNotes] = useState("");

  const filters = { from: applied.from || undefined, to: applied.to || undefined, customer_id: applied.customerId || undefined, search: search.trim() || undefined };
  const candidatesQuery = useQuery({
    queryKey: ["factoring", "purchase-candidates", companyId, filters],
    queryFn: () => listPurchaseCandidates(companyId, filters),
    enabled: Boolean(companyId),
  });
  const directPayQuery = useQuery({
    queryKey: ["factoring", "purchase-direct-pay", companyId],
    queryFn: () => listDirectPayInvoices(companyId).then((r) => r.invoices),
    enabled: Boolean(companyId) && showDirectPayList,
  });

  const editQuery = useQuery({
    queryKey: ["factoring", "purchases", "detail", companyId, editPurchaseId],
    queryFn: () => getFactoringPurchase(companyId, editPurchaseId!),
    enabled: Boolean(companyId && editPurchaseId),
  });
  const editDetail = editing ? editQuery.data ?? null : null;
  // Pre-fill once per purchase opened (adjust-state-during-render, not an effect); later refetches of the same purchase
  // must not wipe the Owner's edits.
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  if ((editDetail?.id ?? null) !== prefilledFor) {
    setPrefilledFor(editDetail?.id ?? null);
    const p = editDetail ? editPrefillFromPurchase(editDetail) : null;
    setEditRows(p?.rows ?? []);
    setCapFromGross(p?.capFromGross ?? []);
    if (editDetail && p) {
      setSelected(p.rows.map((r) => r.invoice_id));
      setPurchased(p.purchased);
      setLineActuals(p.actuals);
      setFaroNumbers(p.faroNumbers);
      setPurchaseDate(editDetail.purchase_date?.slice(0, 10) ?? todayIso());
      setWireDate(editDetail.wire_date?.slice(0, 10) ?? "");
      setReportRef(editDetail.faro_report_ref ?? "");
      setWireFeeCents(toCents(editDetail.wire_fee_cents));
      setNotes(editDetail.notes ?? "");
      setEditReason("");
      setSaveError(null);
      setCreated(null);
    } else if (prefilledFor) {
      // Left Edit mode: the purchase's lines must not leak into a new submission.
      setSelected([]);
      setPurchased({});
      setLineActuals({});
      setFaroNumbers({});
      setNotes("");
      setEditReason("");
      setReportRef("");
      setWireFeeCents(0);
      setPurchaseDate(todayIso());
      setWireDate(todayIso());
    }
  }

  const candidateData = candidatesQuery.data?.candidates;
  const rows = useMemo(() => {
    const candidateRows = candidateData ?? [];
    if (!editing) return candidateRows;
    const own = new Set(editRows.map((r) => r.invoice_id));
    return [...editRows, ...candidateRows.filter((r) => !own.has(r.invoice_id))];
  }, [editing, editRows, candidateData]);
  const vendors = candidatesQuery.data?.factoring_vendors ?? [];
  const effectiveVendorId = vendorId || vendors.find((v) => v.is_default)?.id || "";
  const vendor = vendors.find((v) => v.id === effectiveVendorId) ?? null;
  const recipient = sendTo.trim() || vendor?.email || "";

  // Selection survives a filter change only for rows still listed (the totals are over what is actually sent).
  const byId = useMemo(() => new Map(rows.map((r) => [r.invoice_id, r])), [rows]);
  const selectedRows = useMemo(() => selected.map((id) => byId.get(id)).filter(Boolean) as PurchaseCandidate[], [selected, byId]);
  const totals = computeSelectionTotals(selectedRows, wireFeeCents ?? 0, lineActuals, purchased);
  const figuresOf = (r: PurchaseCandidate) => lineFigures(r, lineActuals[r.invoice_id], linePurchased(r, purchased));
  const editTotal = (field: TotalField, cents: number | null) => {
    const next = applyTotalEdit(selectedRows, field, cents, lineActuals, purchased);
    setLineActuals(next.actuals);
    setPurchased(next.purchased);
  };
  const notPurchased = selectionNotPurchased(selectedRows, purchased);
  const faroWireDiff = faroWireCents == null ? null : faroWireCents - totals.net;
  const docsOverrideOk = docsOverride != null;
  // Edit mode has no documents override (the PATCH takes none): the server's eligibility check answers for added invoices.
  const missingDocsRows = editing ? [] : selectedRows.filter((r) => !r.docs_complete);
  const editReasonOk = editReason.trim().length >= 10;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["factoring"] });
  };

  async function save(andSend: boolean) {
    setSaveError(null);
    setCreated(null);
    if (!isOwner) {
      setSaveError({ kind: "owner_only" });
      return;
    }
    if (!selectedRows.length) {
      setSaveError({ kind: "message", text: "Select at least one invoice." });
      return;
    }
    if (!effectiveVendorId) {
      setSaveError({ kind: "message", text: "Select the factoring company." });
      return;
    }
    // ROUND 321: missing documents block Save AND Save and send unless the Owner gives an override reason (the Feed Gate
    // records it as 'na' with the reason; the load + posted A/R JE stay hard requirements).
    if (missingDocsRows.length && !docsOverrideOk) {
      setSaveError({
        kind: "missing_docs",
        rows: missingDocsRows.map((r) => ({ invoice_id: r.invoice_id, invoice_display_id: r.invoice_display_id, load_id: r.load_id, load_number: r.load_number, missing: r.missing_docs })),
      });
      return;
    }
    if (andSend && !recipient) {
      setSaveError({ kind: "message", text: "The factoring company has no email on file — enter the factor's submission email in Send to." });
      return;
    }
    if (totals.net < 0) {
      setSaveError({ kind: "message", text: "Net to IH35 is negative — check the wire fee." });
      return;
    }
    setSaving(true);
    try {
      const draftPurchase = await createFactoringPurchase(companyId, {
        factoring_company_vendor_id: effectiveVendorId,
        purchase_date: purchaseDate,
        wire_date: wireDate || null,
        faro_report_ref: reportRef.trim() || null,
        wire_fee_cents: wireFeeCents ?? 0,
        lines: selectedRows.map((r) => ({
          invoice_id: r.invoice_id,
          gross_cents: linePurchased(r, purchased),
          ...figuresOf(r),
          ...(faroNumbers[r.invoice_id]?.trim() ? { faro_invoice_number: faroNumbers[r.invoice_id]!.trim() } : {}),
        })),
        ...(missingDocsRows.length && docsOverride ? { docs_override: docsOverride } : {}),
      });
      let posted: FactoringPurchaseDetail;
      try {
        posted = await postFactoringPurchase(companyId, draftPurchase.id);
      } catch (postErr) {
        // A draft that failed to post must not hold its invoices off the list: void it (nothing was posted, so the
        // void reverses nothing) and show why the post failed.
        const e = toSaveError(postErr, "Post failed");
        const why = e.kind === "message" ? e.text : e.kind === "owner_only" ? OWNER_ONLY_MESSAGE : "post refused";
        let voidNote = `Draft ${draftPurchase.display_id} was voided; the invoices are back on the list.`;
        try {
          await voidFactoringPurchase(companyId, draftPurchase.id, `Post failed from Submit to Factor: ${why}`.slice(0, 500));
        } catch {
          voidNote = `Draft ${draftPurchase.display_id} could not be voided automatically — void it before retrying.`;
        }
        setSaveError(e.kind === "message" ? { kind: "message", text: `${e.text} — ${voidNote}` } : e);
        if (e.kind !== "message") setCreated(null);
        await refresh();
        return;
      }
      let sentTo: string | null = null;
      let sendError: SaveError | null = null;
      if (andSend) {
        try {
          const sent = await sendFactoringPurchase(companyId, posted.id, sendTo.trim() || null, missingDocsRows.length ? docsOverride : null);
          sentTo = sent.to;
        } catch (err) {
          sendError = toSaveError(err, "Send failed");
        }
      }
      setCreated({ purchase: posted, sentTo, sendError });
      setSelected([]);
      setReportRef("");
      setLineActuals({});
      setFaroNumbers({});
      setPurchased({});
      setFaroWireCents(null);
      setDocsOverride(null);
      await refresh();
    } catch (err) {
      setSaveError(toSaveError(err, "Save failed"));
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    setSaveError(null);
    if (!editPurchaseId) return;
    if (!isOwner) {
      setSaveError({ kind: "owner_only" });
      return;
    }
    if (!selectedRows.length) {
      setSaveError({ kind: "message", text: "A purchase keeps at least one invoice — undo the purchase instead of removing every line." });
      return;
    }
    if (!editReasonOk) {
      setSaveError({ kind: "message", text: "Enter the reason for the change (at least 10 characters)." });
      return;
    }
    if (totals.net < 0) {
      setSaveError({ kind: "message", text: "Net to IH35 is negative — check the totals." });
      return;
    }
    setSaving(true);
    try {
      const saved = await editFactoringPurchase(
        companyId,
        editPurchaseId,
        buildEditPurchaseBody({
          rows: selectedRows,
          purchased,
          actuals: lineActuals,
          faroNumbers,
          purchaseDate,
          wireDate,
          reportRef,
          wireFeeCents: wireFeeCents ?? 0,
          notes,
          reason: editReason,
        }),
      );
      await refresh();
      onEditDone?.(saved.id ?? editPurchaseId);
    } catch (err) {
      setSaveError(toSaveError(err, "Save changes failed"));
    } finally {
      setSaving(false);
    }
  }

  async function retrySend() {
    if (!created) return;
    setSaving(true);
    try {
      const sent = await sendFactoringPurchase(companyId, created.purchase.id, sendTo.trim() || null, docsOverride);
      setCreated({ ...created, sentTo: sent.to, sendError: null });
    } catch (err) {
      setCreated({ ...created, sendError: toSaveError(err, "Send failed") });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDirectPay() {
    if (!directPay) return;
    if (directPayReason.trim().length < 3) {
      setDirectPayError("Enter a reason (at least 3 characters).");
      return;
    }
    setDirectPayBusy(true);
    setDirectPayError(null);
    try {
      if (directPay.mode === "mark") await markInvoiceDirectPay(companyId, directPay.row.invoice_id, directPayReason.trim());
      else await undoInvoiceDirectPay(companyId, directPay.row.invoice_id, directPayReason.trim());
      setSelected((s) => s.filter((id) => id !== directPay.row.invoice_id));
      setDirectPay(null);
      setDirectPayReason("");
      await refresh();
    } catch (err) {
      const e = toSaveError(err, "Request failed");
      setDirectPayError(e.kind === "owner_only" ? OWNER_ONLY_MESSAGE : e.kind === "message" ? e.text : "Request failed");
    } finally {
      setDirectPayBusy(false);
    }
  }

  const columns: Array<ParityColumn<PurchaseCandidate>> = [
    {
      key: "invoice_display_id",
      label: "Invoice #",
      sortable: true,
      render: (r) => <EntityLink kind="invoice" id={r.invoice_id} label={entityLabel(r.invoice_display_id, r.invoice_id, "Invoice")} />,
    },
    { key: "issue_date", label: "Invoice date", sortable: true, render: (r) => dateCell(r.issue_date) },
    {
      key: "customer_name",
      label: "Customer",
      sortable: true,
      render: (r) => <EntityLink kind="customer" id={r.customer_id} label={entityLabel(r.customer_name, r.customer_id, "Customer")} />,
    },
    {
      key: "customer_po_number",
      label: "Customer PO",
      sortable: true,
      render: (r) => r.customer_po_number || r.customer_wo_number || "—",
    },
    {
      key: "load_number",
      label: "Load #",
      sortable: true,
      render: (r) => (r.load_id ? <EntityLink kind="load" id={r.load_id} label={entityLabel(r.load_number, r.load_id, "Load")} /> : "—"),
    },
    {
      key: "settlement_display_id",
      label: "Settlement",
      sortable: true,
      render: (r) =>
        r.settlement_id ? (
          <EntityLink
            kind="settlement"
            id={r.settlement_id}
            label={`${r.settlement_is_presettlement ? "Pre " : ""}${entityLabel(r.settlement_display_id, r.settlement_id, "Settlement")}`}
            title={r.settlement_is_presettlement ? "Pre-settlement" : `Settlement · ${r.settlement_status ?? ""}`}
          />
        ) : (
          "—"
        ),
    },
    { key: "pickup_at", label: "PU date", sortable: true, render: (r) => dateCell(r.pickup_at) },
    { key: "delivery_at", label: "DEL date", sortable: true, render: (r) => dateCell(r.delivery_at) },
    { key: "total_cents", label: "Total", sortable: true, kind: "money", render: (r) => formatUsdCents(r.total_cents) },
    { key: "open_cents", label: "Open", sortable: true, kind: "money", render: (r) => formatUsdCents(r.open_cents) },
    {
      key: "expected_escrow_reserve_cents",
      label: "Escrow reserve",
      sortable: true,
      kind: "money",
      headerTitle: "Expected on the Open amount: the customer's factor assignment, else the company's Faro agreement",
      render: (r) => expectedCell(r, r.expected_escrow_reserve_cents),
    },
    { key: "expected_cash_reserve_cents", label: "Cash reserve", sortable: true, kind: "money", render: (r) => expectedCell(r, r.expected_cash_reserve_cents) },
    { key: "expected_fee_cents", label: "Fee", sortable: true, kind: "money", render: (r) => expectedCell(r, r.expected_fee_cents) },
    {
      key: "docs_complete",
      label: "Docs",
      sortable: true,
      sortValue: (r) => (r.docs_complete ? 1 : 0),
      render: (r) =>
        r.docs_complete ? (
          <span className="font-semibold text-[#16A34A]" data-testid={`submit-factor-docs-ok-${r.invoice_id}`}>
            BOL · POD · RC
          </span>
        ) : r.load_id ? (
          <Link
            to={loadDocsUploadPath(r.load_id)}
            className="text-red-700 underline"
            title={`Missing: ${r.missing_docs.join(", ")} — upload on the load`}
            data-testid={`submit-factor-docs-upload-${r.invoice_id}`}
          >
            Upload {r.missing_docs.join(", ")}
          </Link>
        ) : (
          <span className="text-red-700">No load</span>
        ),
    },
    {
      key: "direct_pay",
      label: "Direct pay",
      render: (r) => editing && editRows.some((e) => e.invoice_id === r.invoice_id) ? (
        <span className="text-[#4B5563]">On this purchase</span>
      ) : (
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          disabled={!isOwner}
          title={isOwner ? "Customer pays IH35 directly — not sold to the factor" : OWNER_ONLY_MESSAGE}
          onClick={() => {
            setDirectPayReason("");
            setDirectPayError(null);
            setDirectPay({ row: { invoice_id: r.invoice_id, label: r.invoice_display_id ?? r.invoice_id }, mode: "mark" });
          }}
          data-testid={`submit-factor-direct-pay-${r.invoice_id}`}
        >
          Customer direct pay
        </Button>
      ),
    },
  ];

  const activeFilterCount = [applied.customerId, applied.from, applied.to].filter(Boolean).length;

  // LEAD 443.180 — a click on a purchase anywhere in the app lands HERE; bring the purchase into view instead of
  // leaving the owner at the top of the Factoring page with the purchase below the fold.
  const editBannerRef = useRef<HTMLDivElement | null>(null);
  const editDetailId = editDetail?.id ?? null;
  useEffect(() => {
    if (editDetailId) editBannerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [editDetailId]);

  return (
    <div className="space-y-3" data-testid="submit-to-factor-tab">
      {editing ? (
        <div ref={editBannerRef} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#1F2A44]" data-testid="submit-factor-edit-banner">
          <span>
            {editQuery.isLoading ? "Loading purchase…" : null}
            {editQuery.isError ? <span className="text-red-700">Could not load the purchase to edit.</span> : null}
            {editDetail ? (
              <>
                <span className="text-section-header font-semibold uppercase tracking-wide text-[#1F2A44]" data-testid="submit-factor-edit-title">
                  Purchase {editDetail.display_id}
                </span>{" "}
                · Editing purchase <strong><EntityLink kind="factoring_purchase" id={editDetail.id} label={editDetail.display_id} /></strong>
                {editDetail.factoring_company_name ? ` · ${editDetail.factoring_company_name}` : ""} — change dates, amounts or invoices, then Save changes.
              </>
            ) : null}
          </span>
          <Button type="button" variant="secondary" size="sm" onClick={onEditCancel} data-testid="submit-factor-edit-cancel">
            Cancel edit
          </Button>
        </div>
      ) : null}
      {editing && editDetail && editDetail.status !== "posted" ? (
        <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
          <EntityLink kind="factoring_purchase" id={editDetail.id} label={editDetail.display_id} /> is {editDetail.status} — only a posted purchase can be edited.
        </div>
      ) : null}
      {!isOwner ? (
        <div className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#1F2A44]" data-testid="submit-factor-owner-only-note">
          {OWNER_ONLY_MESSAGE} You can review the open invoices; Save is the Owner&apos;s.
        </div>
      ) : null}

      {candidatesQuery.isError ? <ListErrorBanner onRetry={() => void candidatesQuery.refetch()} /> : null}

      <ParityTable
        title={editing ? "Invoices on this purchase — and eligible to add" : "Invoices ready to factor"}
        rows={rows}
        rowKey={(r) => r.invoice_id}
        columns={columns}
        storageKey="factoring-submit-to-factor"
        tableTestId="submit-factor-candidates-table"
        exportFilename="factoring-submit-candidates"
        loading={candidatesQuery.isLoading}
        emptyText={candidatesQuery.isLoading ? "Loading open invoices…" : "No open invoice is waiting to be factored."}
        selectable
        selectedKeys={selected}
        onSelectionChange={setSelected}
        initialPageSize={100}
        allowAllPageSize
        suppressToolbarSearch
        suppressToolbarRange
        filterBar={
          <CollapsedListFilters
            activeFilterCount={activeFilterCount}
            onApply={() => setApplied(draft)}
            onCancel={() => setDraft(applied)}
            onReset={() => {
              setDraft(EMPTY_FILTERS);
              setApplied(EMPTY_FILTERS);
            }}
            applyDisabled={JSON.stringify(draft) === JSON.stringify(applied)}
            testIdPrefix="submit-factor"
            applyTestId="submit-factor-filter-apply"
            cancelTestId="submit-factor-filter-cancel"
            resetTestId="submit-factor-filter-reset"
            searchSlot={
              <TableSearch value={search} onChange={setSearch} placeholder="Search invoice, customer, load, PO…" data-testid="submit-factor-search" />
            }
          >
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-[#4B5563]">
                Customer
                <EntityMultiSelect
                  kind="customer"
                  operatingCompanyId={companyId}
                  value={draft.customerId || null}
                  onChange={(next) => setDraft((d) => ({ ...d, customerId: next ?? "" }))}
                  placeholder="All customers"
                  dataTestId="submit-factor-filter-customer"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[#4B5563]">
                Invoice date from
                <DatePicker value={draft.from} onChange={(v) => setDraft((d) => ({ ...d, from: v }))} className={FILTER_CONTROL_SIZE_CLASS} data-testid="submit-factor-filter-from" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[#4B5563]">
                Invoice date to
                <DatePicker value={draft.to} onChange={(v) => setDraft((d) => ({ ...d, to: v }))} className={FILTER_CONTROL_SIZE_CLASS} data-testid="submit-factor-filter-to" />
              </label>
            </div>
          </CollapsedListFilters>
        }
      />
      {candidatesQuery.data?.capped ? (
        <div className="text-xs text-[#4B5563]">Showing the first {candidatesQuery.data.limit} open invoices — narrow the filters to see the rest.</div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <DataPanel title="Purchase">
          <div className="grid grid-cols-2 gap-3 p-3 text-xs" data-testid="submit-factor-form">
            <label className="col-span-2 flex flex-col gap-1">
              <span className="uppercase" style={FIELD_LABEL_STYLE}>Factoring company</span>
              {editing ? (
                <span className="py-1 text-[#1F2A44]" data-testid="submit-factor-edit-vendor">{editDetail?.factoring_company_name ?? "—"}</span>
              ) : (
              <ReferenceSelect
                value={effectiveVendorId || null}
                onChange={(next) => setVendorId(next ?? "")}
                options={vendors.map((v) => ({ value: v.id, label: v.vendor_name, type: v.email ?? "no email on file" }))}
                createKind="vendor"
                operatingCompanyId={companyId}
                placeholder={vendors.length ? "Select factoring company…" : "No Faro vendor found"}
                onOptionCreated={() => void candidatesQuery.refetch()}
                size="sm"
              />
              )}
            </label>
            <label className="flex flex-col gap-1">
              <span className="uppercase" style={FIELD_LABEL_STYLE}>Purchase date</span>
              <DatePicker value={purchaseDate} onChange={setPurchaseDate} className={FORM_FIELD_CONTROL_SIZE_CLASS} data-testid="submit-factor-purchase-date" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="uppercase" style={FIELD_LABEL_STYLE}>Wire date</span>
              <DatePicker value={wireDate} onChange={setWireDate} className={FORM_FIELD_CONTROL_SIZE_CLASS} data-testid="submit-factor-wire-date" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="uppercase" style={FIELD_LABEL_STYLE}>Faro report ref</span>
              <input
                className={`${FORM_FIELD_CONTROL_SIZE_CLASS} rounded-sm border border-gray-300 px-2`}
                value={reportRef}
                maxLength={80}
                onChange={(e) => setReportRef(e.target.value)}
                data-testid="submit-factor-report-ref"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="uppercase" style={FIELD_LABEL_STYLE}>Wire fee</span>
              <MoneyInput valueCents={wireFeeCents} onChangeCents={(c) => setWireFeeCents(c ?? 0)} className={FORM_FIELD_CONTROL_SIZE_CLASS} ariaLabel="Wire fee" />
            </label>
            {editing ? (
              <>
                <label className="col-span-2 flex flex-col gap-1">
                  <span className="uppercase" style={FIELD_LABEL_STYLE}>Notes</span>
                  <input
                    className={`${FORM_FIELD_CONTROL_SIZE_CLASS} rounded-sm border border-gray-300 px-2`}
                    value={notes}
                    maxLength={1000}
                    onChange={(e) => setNotes(e.target.value)}
                    data-testid="submit-factor-edit-notes"
                  />
                </label>
                <label className="col-span-2 flex flex-col gap-1">
                  <span className="uppercase" style={FIELD_LABEL_STYLE}>Reason for the change (required)</span>
                  <input
                    className={`${FORM_FIELD_CONTROL_SIZE_CLASS} rounded-sm border border-gray-300 px-2`}
                    value={editReason}
                    maxLength={500}
                    placeholder="At least 10 characters — e.g. wrong purchase date entered"
                    onChange={(e) => setEditReason(e.target.value)}
                    data-testid="submit-factor-edit-reason"
                  />
                </label>
              </>
            ) : (
            <label className="col-span-2 flex flex-col gap-1">
              <span className="uppercase" style={FIELD_LABEL_STYLE}>Send to (Save and send)</span>
              <input
                type="email"
                className={`${FORM_FIELD_CONTROL_SIZE_CLASS} rounded-sm border border-gray-300 px-2`}
                value={sendTo}
                placeholder={vendor?.email ?? "Factor submission email"}
                onChange={(e) => setSendTo(e.target.value)}
                data-testid="submit-factor-send-to"
              />
            </label>
            )}
          </div>
        </DataPanel>

        {selectedRows.length ? (
          <DataPanel title="Selected invoices — Faro actuals">
            <div className="p-3 text-xs" data-testid="submit-factor-actuals">
              <p className="mb-2 text-[#4B5563]">
                Enter Faro's purchase-report figures here when they differ from the expected split.{" "}
                <InfoPopover label="About Faro's security reserve">
                  Faro holds one 1.5% Security Reserve per invoice — normally as escrow reserve, on some invoices as cash reserve instead.
                </InfoPopover>
              </p>
              {/* 443.99 — the shared ParityTable (was a hand-rolled HTML table). */}
              <ParityTable<PurchaseCandidate>
                embedded
                rows={selectedRows}
                rowKey={(r) => r.invoice_id}
                storageKey="submit-factor-actuals"
                suppressToolbarSearch
                suppressToolbarRange
                hidePager
                rowTestId={(r) => `submit-factor-actuals-row-${r.invoice_id}`}
                columns={[
                  {
                    key: "invoice_display_id",
                    label: "Invoice",
                    sortable: true,
                    sortValue: (r) => r.invoice_display_id,
                    render: (r) => <EntityLink kind="invoice" id={r.invoice_id} label={r.invoice_display_id ?? "invoice"} />,
                  },
                  {
                    key: "faro_invoice_number",
                    label: "Faro Inv #",
                    sortable: true,
                    sortValue: (r) => faroNumbers[r.invoice_id] ?? "",
                    overflowVisible: true,
                    render: (r) => (
                      <input
                        value={faroNumbers[r.invoice_id] ?? ""}
                        onChange={(e) => setFaroNumbers((m) => ({ ...m, [r.invoice_id]: e.target.value.replace(/[^0-9]/g, "").slice(0, 6) }))}
                        inputMode="numeric"
                        placeholder="001"
                        className={`${FORM_FIELD_CONTROL_SIZE_CLASS} w-[104px] tabular-nums`}
                        aria-label={`Faro invoice number ${r.invoice_display_id ?? ""}`}
                        data-testid={`submit-factor-faro-inv-${r.invoice_id}`}
                      />
                    ),
                  },
                  {
                    key: "purchased_cents",
                    label: "Purchased",
                    kind: "money",
                    sortable: true,
                    sortValue: (r) => linePurchased(r, purchased),
                    headerTitle: "What Faro bought — the open balance unless Faro bought less (editable down only)",
                    overflowVisible: true,
                    render: (r) => {
                      const p = linePurchased(r, purchased);
                      return (
                        <div className="flex flex-col gap-0.5" data-testid={`submit-factor-purchased-${r.invoice_id}`}>
                          <MoneyInput
                            valueCents={p}
                            onChangeCents={(c) =>
                              setPurchased((m) => {
                                const next = { ...m };
                                const v = clampPurchased(c, r.base_cents);
                                if (v === r.base_cents) delete next[r.invoice_id];
                                else next[r.invoice_id] = v;
                                return next;
                              })
                            }
                            className={FORM_FIELD_CONTROL_SIZE_CLASS}
                            ariaLabel={`Purchased ${r.invoice_display_id ?? ""}`}
                          />
                          {editing && capFromGross.includes(r.invoice_id) ? (
                            <span className="text-[#4B5563]" data-testid={`submit-factor-cap-note-${r.invoice_id}`}>
                              Capped at the purchased amount (open balance not reported)
                            </span>
                          ) : null}
                          {p < r.base_cents ? (
                            <span className="text-[#4B5563]" data-testid={`submit-factor-not-purchased-${r.invoice_id}`}>
                              Not purchased: {formatUsdCents(r.base_cents - p)}
                            </span>
                          ) : null}
                        </div>
                      );
                    },
                  },
                  {
                    key: "escrow_reserve_cents",
                    label: "Escrow reserve",
                    kind: "money",
                    sortable: true,
                    sortValue: (r) => figuresOf(r).escrow_reserve_cents,
                    overflowVisible: true,
                    render: (r) => {
                      const f = figuresOf(r);
                      const setF = (patch: Partial<LineActuals>) => setLineActuals((m) => ({ ...m, [r.invoice_id]: { ...f, ...patch } }));
                      return <MoneyInput valueCents={f.escrow_reserve_cents} onChangeCents={(c) => setF({ escrow_reserve_cents: c ?? 0 })} className={FORM_FIELD_CONTROL_SIZE_CLASS} ariaLabel={`Escrow reserve ${r.invoice_display_id ?? ""}`} />;
                    },
                  },
                  {
                    key: "cash_reserve_cents",
                    label: "Cash reserve",
                    kind: "money",
                    sortable: true,
                    sortValue: (r) => figuresOf(r).cash_reserve_cents,
                    overflowVisible: true,
                    render: (r) => {
                      const f = figuresOf(r);
                      const setF = (patch: Partial<LineActuals>) => setLineActuals((m) => ({ ...m, [r.invoice_id]: { ...f, ...patch } }));
                      return <MoneyInput valueCents={f.cash_reserve_cents} onChangeCents={(c) => setF({ cash_reserve_cents: c ?? 0 })} className={FORM_FIELD_CONTROL_SIZE_CLASS} ariaLabel={`Cash reserve ${r.invoice_display_id ?? ""}`} />;
                    },
                  },
                  {
                    key: "fee_cents",
                    label: "Fee",
                    kind: "money",
                    sortable: true,
                    sortValue: (r) => figuresOf(r).fee_cents,
                    overflowVisible: true,
                    render: (r) => {
                      const f = figuresOf(r);
                      const setF = (patch: Partial<LineActuals>) => setLineActuals((m) => ({ ...m, [r.invoice_id]: { ...f, ...patch } }));
                      return <MoneyInput valueCents={f.fee_cents} onChangeCents={(c) => setF({ fee_cents: c ?? 0 })} className={FORM_FIELD_CONTROL_SIZE_CLASS} ariaLabel={`Fee ${r.invoice_display_id ?? ""}`} />;
                    },
                  },
                ]}
                rowActions={(r) => {
                  const f = figuresOf(r);
                  return (
                    <button
                      type="button"
                      className="rounded-sm border border-gray-300 px-2 py-0.5 text-xs text-[#1F2A44]"
                      onClick={() => setLineActuals((m) => ({ ...m, [r.invoice_id]: { ...f, cash_reserve_cents: f.cash_reserve_cents + f.escrow_reserve_cents, escrow_reserve_cents: 0 } }))}
                      disabled={f.escrow_reserve_cents === 0}
                      data-testid={`submit-factor-reserve-to-cash-${r.invoice_id}`}
                    >
                      Reserve in cash
                    </button>
                  );
                }}
              />
            </div>
          </DataPanel>
        ) : null}

        {missingDocsRows.length ? (
          <DataPanel title="Override approval — missing documents">
            <div className="p-3 text-xs" data-testid="submit-factor-docs-override">
              <p className="mb-2 text-[#4B5563]">
                {missingDocsRows.length} selected load(s) are missing BOL / POD / rate confirmation. The Owner may approve sending to the factor
                anyway with one confirm; the override is stamped on the purchase and audited.
              </p>
              {docsOverride ? (
                <p className="font-semibold text-[#1F2A44]" data-testid="submit-factor-docs-override-approved">Override approved.</p>
              ) : (
                <OverrideButton
                  context="factoring"
                  disabled={!isOwner}
                  onConfirm={(reasonCode) => setDocsOverride({ reason_code: reasonCode })}
                  testId="submit-factor-docs-override-button"
                />
              )}
            </div>
          </DataPanel>
        ) : null}

        <DataPanel title="Selection totals">
          <dl className="grid grid-cols-2 items-center gap-x-4 gap-y-1 p-3 text-xs" data-testid="submit-factor-totals">
            <dt className="text-[#4B5563]">Invoices</dt>
            <dd className="text-right font-semibold" data-testid="submit-factor-total-count">{totals.count}</dd>
            <dt className="text-[#4B5563]">Purchased (gross)</dt>
            <dd data-testid="submit-factor-total-gross">
              <MoneyInput valueCents={totals.gross} onChangeCents={(c) => editTotal("gross", c)} disabled={!selectedRows.length} className={FORM_FIELD_CONTROL_SIZE_CLASS} ariaLabel="Purchased total" />
            </dd>
            {notPurchased > 0 ? (
              <>
                <dt className="text-[#4B5563]">Not purchased</dt>
                <dd className="text-right" data-testid="submit-factor-total-not-purchased">{formatUsdCents(notPurchased)}</dd>
              </>
            ) : null}
            <dt className="text-[#4B5563]">Escrow reserve</dt>
            <dd data-testid="submit-factor-total-escrow">
              <MoneyInput valueCents={totals.escrow} onChangeCents={(c) => editTotal("escrow_reserve_cents", c)} disabled={!selectedRows.length} className={FORM_FIELD_CONTROL_SIZE_CLASS} ariaLabel="Escrow reserve total" />
            </dd>
            <dt className="text-[#4B5563]">Factoring fee</dt>
            <dd data-testid="submit-factor-total-fee">
              <MoneyInput valueCents={totals.fee} onChangeCents={(c) => editTotal("fee_cents", c)} disabled={!selectedRows.length} className={FORM_FIELD_CONTROL_SIZE_CLASS} ariaLabel="Factoring fee total" />
            </dd>
            <dt className="text-[#4B5563]">Advance (gross − escrow − fee)</dt>
            <dd className="text-right font-semibold" data-testid="submit-factor-total-advance">{formatUsdCents(totals.advance)}</dd>
            <dt className="text-[#4B5563]">Cash reserve</dt>
            <dd data-testid="submit-factor-total-cash">
              <MoneyInput valueCents={totals.cash} onChangeCents={(c) => editTotal("cash_reserve_cents", c)} disabled={!selectedRows.length} className={FORM_FIELD_CONTROL_SIZE_CLASS} ariaLabel="Cash reserve total" />
            </dd>
            <dt className="text-[#4B5563]">Wire fee</dt>
            <dd data-testid="submit-factor-total-wire">
              <MoneyInput valueCents={wireFeeCents} onChangeCents={(c) => setWireFeeCents(c ?? 0)} className={FORM_FIELD_CONTROL_SIZE_CLASS} ariaLabel="Wire fee total" />
            </dd>
            <dt className="font-semibold text-[#0F1219]">Net to IH35</dt>
            <dd className={`text-right font-semibold ${totals.net < 0 ? "text-red-700" : "text-[#16A34A]"}`} data-testid="submit-factor-total-net">
              {formatUsdCents(totals.net)}
            </dd>
            <dt className="text-[#4B5563]">Faro wire (from Faro&apos;s report)</dt>
            <dd data-testid="submit-factor-total-faro-wire">
              <MoneyInput valueCents={faroWireCents} onChangeCents={setFaroWireCents} className={FORM_FIELD_CONTROL_SIZE_CLASS} ariaLabel="Faro wire from Faro's report" />
            </dd>
            {faroWireDiff != null ? (
              <>
                <dt className="text-[#4B5563]">Difference (Faro wire − Net)</dt>
                <dd className={`text-right font-semibold ${faroWireDiff === 0 ? "text-[#16A34A]" : "text-red-700"}`} data-testid="submit-factor-total-faro-diff">
                  {faroWireDiff === 0 ? "Ties to the cent" : formatUsdCents(faroWireDiff)}
                </dd>
              </>
            ) : null}
          </dl>
          <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-3 py-2">
            <span className="text-xs text-[#4B5563]">
              {missingDocsRows.length
                ? docsOverrideOk
                  ? `${missingDocsRows.length} invoice(s) missing docs — Owner override approved`
                  : `${missingDocsRows.length} selected invoice(s) missing docs — Save needs an Owner override approval`
                : "Expected split from the factor rates unless Faro's actuals are entered per invoice."}
            </span>
            {editing ? (
              <Button
                type="button"
                onClick={() => void saveEdit()}
                loading={saving}
                disabled={!isOwner || saving || !editDetail || editDetail.status !== "posted" || selectedRows.length === 0 || totals.net < 0 || !editReasonOk}
                title={
                  !isOwner
                    ? OWNER_ONLY_MESSAGE
                    : totals.net < 0
                      ? "Net to IH35 is negative — check the totals"
                      : !editReasonOk
                        ? "Enter the reason for the change (at least 10 characters)"
                        : undefined
                }
                data-testid="submit-factor-save-changes"
              >
                Save changes
              </Button>
            ) : (
            <SaveDropdown
              storageKey="factoring-submit-to-factor"
              primaryLabel="Save"
              onSave={() => save(false)}
              onSaveAndSend={() => save(true)}
              disabled={!isOwner || saving || selectedRows.length === 0 || totals.net < 0}
              loading={saving}
              title={!isOwner ? OWNER_ONLY_MESSAGE : selectedRows.length === 0 ? "Select at least one invoice" : totals.net < 0 ? "Net to IH35 is negative — check the totals" : undefined}
            />
            )}
          </div>
        </DataPanel>
      </div>

      {saveError ? <SaveErrorPanel error={saveError} rows={byId} /> : null}

      {created ? (
        <div className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#1F2A44]" data-testid="submit-factor-created">
          Purchase{" "}
          {created.purchase.factoring_advance_id ? (
            <EntityLink kind="factoring_advance" id={created.purchase.factoring_advance_id} label={created.purchase.display_id} data-testid="submit-factor-created-link" />
          ) : (
            <span>(not posted)</span>
          )}{" "}
          posted — {created.purchase.invoice_count} invoice(s), gross {formatUsdCents(created.purchase.gross_cents)}, net to IH35{" "}
          {formatUsdCents(created.purchase.net_to_company_cents)}.
          {created.purchase.journal_entry_id ? (
            <>
              {" "}
              Journal entry <EntityLink kind="journal_entry" id={created.purchase.journal_entry_id} label="view" />.
            </>
          ) : null}
          {created.sentTo ? <> Sent to {created.sentTo}.</> : null}
          {created.sendError ? (
            <div className="mt-2">
              <SaveErrorPanel error={created.sendError} rows={byId} prefix="Not sent: " />
              <Button type="button" variant="secondary" size="sm" className="mt-1" onClick={() => void retrySend()} disabled={saving}>
                Retry send
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="text-xs">
        <button type="button" className="text-[#1F2A44] underline" onClick={() => setShowDirectPayList((v) => !v)} data-testid="submit-factor-direct-pay-toggle">
          {showDirectPayList ? "Hide" : "Show"} customer direct pay invoices
        </button>
        {showDirectPayList ? (
          <ul className="mt-2 space-y-1" data-testid="submit-factor-direct-pay-list">
            {(directPayQuery.data ?? []).length === 0 ? <li className="text-[#6B7280]">None marked.</li> : null}
            {(directPayQuery.data ?? []).map((d) => (
              <li key={d.invoice_id} className="flex flex-wrap items-center gap-2">
                <EntityLink kind="invoice" id={d.invoice_id} label={entityLabel(d.invoice_display_id, d.invoice_id, "Invoice")} />
                <EntityLink kind="customer" id={d.customer_id} label={entityLabel(d.customer_name, d.customer_id, "Customer")} />
                <span>{formatUsdCents(d.total_cents)}</span>
                <span className="text-[#6B7280]">{d.reason}</span>
                <Button
                  type="button"
                  variant="tertiary"
                  size="sm"
                  disabled={!isOwner}
                  onClick={() => {
                    setDirectPayReason("");
                    setDirectPayError(null);
                    setDirectPay({ row: { invoice_id: d.invoice_id, label: d.invoice_display_id ?? d.invoice_id }, mode: "undo" });
                  }}
                >
                  Undo direct pay
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <Modal
        open={Boolean(directPay)}
        onClose={() => setDirectPay(null)}
        title={directPay?.mode === "undo" ? `Undo customer direct pay — ${directPay.row.label}` : `Customer direct pay — ${directPay?.row.label ?? ""}`}
      >
        <div className="space-y-2 text-xs">
          <p>
            {directPay?.mode === "undo"
              ? "The invoice returns to the Submit to Factor list."
              : "The customer pays IH35 directly; this invoice will not be sold to the factor and leaves the Submit to Factor list."}
          </p>
          <label className="flex flex-col gap-1">
            <span className="uppercase" style={FIELD_LABEL_STYLE}>Reason</span>
            <textarea
              className="min-h-[60px] rounded-sm border border-gray-300 p-2 text-xs"
              value={directPayReason}
              onChange={(e) => setDirectPayReason(e.target.value)}
              data-testid="submit-factor-direct-pay-reason"
            />
          </label>
          {directPayError ? <div className="text-red-700">{directPayError}</div> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDirectPay(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void confirmDirectPay()} loading={directPayBusy} data-testid="submit-factor-direct-pay-confirm">
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SaveErrorPanel({ error, rows, prefix = "" }: { error: SaveError; rows: Map<string, PurchaseCandidate>; prefix?: string }) {
  const label = (invoiceId: string) => rows.get(invoiceId)?.invoice_display_id ?? invoiceId;
  return (
    <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert" data-testid="submit-factor-error">
      {error.kind === "owner_only" ? <strong>{prefix}{OWNER_ONLY_MESSAGE}</strong> : null}
      {error.kind === "message" ? <span>{prefix}{error.text}</span> : null}
      {error.kind === "bank_matched" ? (
        <span data-testid="submit-factor-error-bank-matched">
          {prefix}Unmatch the Faro wire in Banking first —{" "}
          {error.bankTransactionId ? (
            <>
              <EntityLink kind="bank_transaction" id={error.bankTransactionId} label="open the bank line" />
              {" · "}
            </>
          ) : null}
          <Link to="/banking" className="underline">
            Banking
          </Link>
        </span>
      ) : null}
      {error.kind === "feed_gate" ? (
        <>
          <strong>{prefix}Feed Gate blocked {error.blocked.length} invoice(s) — fix these before they can enter a purchase:</strong>
          <ul className="mt-1 space-y-1">
            {error.blocked.map((b) => (
              <li key={b.invoice_id}>
                <EntityLink kind="invoice" id={b.invoice_id} label={label(b.invoice_id)} />
                <ul className="ml-4 list-disc">
                  {b.reds.length === 0 ? <li>{b.error}</li> : null}
                  {b.reds.map((r, i) => (
                    <li key={`${r.check_key}-${i}`}>
                      {r.subject_label ? `${r.subject_label}: ` : ""}
                      {r.missing ?? r.check_key}{" "}
                      {r.fix_link ? (
                        <Link to={r.fix_link} className="underline">
                          fix
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {error.kind === "per_invoice" ? (
        <>
          <strong>{prefix}{error.title}</strong>
          <ul className="mt-1 ml-4 list-disc">
            {error.rows.map((r, i) => (
              <li key={`${r.invoice_id}-${i}`}>
                {r.invoice_id ? <EntityLink kind="invoice" id={r.invoice_id} label={label(r.invoice_id)} /> : null} {r.reason}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {error.kind === "missing_docs" ? (
        <>
          <strong>{prefix}Save and send is blocked — these loads are missing documents:</strong>
          <ul className="mt-1 ml-4 list-disc">
            {error.rows.map((r) => (
              <li key={r.invoice_id}>
                <EntityLink kind="invoice" id={r.invoice_id} label={r.invoice_display_id ?? label(r.invoice_id)} /> — {r.missing.join(", ")}{" "}
                {r.load_id ? (
                  <Link to={loadDocsUploadPath(r.load_id)} className="underline">
                    upload on load {r.load_number ?? ""}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
import { companyToday } from "../../lib/businessDate";
