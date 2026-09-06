/**
 * FactoringTab — standalone drawer child component (LDT-4 rewrite).
 * Mount in any load-detail drawer by passing loadId + operatingCompanyId.
 * Does NOT import from LoadDetailDrawer.tsx.
 *
 * LDT-4 step bar: Pro forma → In transit → POD → Submitted → Advance received → Reserve released
 * The money card: invoice face · broker advance applied · amount purchased · advance % · reserve % ·
 *   fee % · net cash — all from the Faro vendor terms (factor profile) + factoring_advances rows.
 * Packet card: real attachment chips (rate con, BOL, POD, invoice PDF) — no "upload under Documents tab" text.
 * Submit disabled until POD; chargebacks listed only when driver-caused and approved.
 * Submission reuses existing accounting factoring-advances batch API (Block-24/25 poster untouched).
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoad } from "../../../api/loads";
import {
  listInvoices,
  listFactoringCandidateInvoices,
  listBrokerAdvances,
  listFactoringAdvances,
} from "../../../api/accounting";
import { listAllFiles, getDownloadUrl, type DocsFile } from "../../../api/docs";
import { createFactor, listFactors } from "../../../api/factoring";
import { apiRequest } from "../../../api/client";
import { Button } from "../../Button";
import { Combobox } from "../../Combobox";
import { useToast } from "../../Toast";
import { userFacingApiError } from "../../../lib/api-error-message";
import { EntityLink } from "../../shared/EntityLink";
import { EntityLinkOrTombstone } from "../../shared/EntityLinkOrTombstone";
import { QueryErrorNote } from "./QueryErrorNote";
import { formatMoneyCents } from "../constants";

// ─── .ldt-* palette (GLOBAL-TYPE-SIZE-BASELINE tokens) ────────────────────────

const LDT_CSS = `
.ldt-stepbar { display: flex; flex-wrap: wrap; gap: 4px; }
.ldt-step { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; color: #6B7280; border: 1px solid #E5E7EB; border-radius: 2px; background: #FFFFFF; line-height: 1.4; }
.ldt-step--active { color: #0F1219; border-color: #1F2A44; background: #F7F8FA; }
.ldt-step--past { color: #16A34A; border-color: #E5E7EB; }
.ldt-step--future { color: #9CA3AF; border-color: #E5E7EB; background: #FFFFFF; }
.ldt-card { border: 1px solid #E5E7EB; border-radius: 2px; background: #FFFFFF; padding: 12px; }
.ldt-card__title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #4B5563; margin-bottom: 8px; letter-spacing: 0.02em; }
.ldt-card__row { display: flex; justify-content: space-between; align-items: baseline; padding: 4px 0; font-size: 12px; color: #1F2A44; border-bottom: 1px solid #F3F4F6; }
.ldt-card__row:last-child { border-bottom: none; }
.ldt-money { display: flex; flex-direction: column; gap: 0; }
.ldt-money__label { font-size: 11px; color: #6B7280; }
.ldt-money__sub { font-size: 11px; color: #9CA3AF; }
.ldt-money__value { font-size: 12px; font-weight: 600; color: #0F1219; text-align: right; font-variant-numeric: tabular-nums; }
.ldt-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; font-size: 12px; border: 1px solid #E5E7EB; border-radius: 2px; background: #FFFFFF; color: #1F2A44; cursor: pointer; text-decoration: none; }
.ldt-chip:disabled { opacity: 0.6; cursor: default; }
.ldt-chip--ok { color: #16A34A; }
.ldt-chip--ok:hover:not(:disabled) { border-color: #16A34A; }
.ldt-chip--missing { color: #DC2626; cursor: default; border-color: #FECACA; background: #FEF2F2; }
`;

// ─── constants ───────────────────────────────────────────────────────────────

const PACKET_PREFIX = "IH35_FACTORING_PACKAGE_V1::";

/** Load statuses from in_transit onward (factoring "In transit" step). */
const TRANSIT_STATUSES = [
  "in_transit", "at_delivery", "delivered", "delivered_pending_docs",
  "completed_docs_received", "invoiced", "paid", "closed",
] as const;

/** Load statuses from delivered onward (factoring "POD" precondition). */
const DELIVERED_STATUSES = [
  "delivered", "delivered_pending_docs", "completed_docs_received",
  "invoiced", "paid", "closed",
] as const;

type PacketMeta = {
  generated_at: string | null;
  approved_at: string | null;
  emailed_at: string | null;
  uploaded_at: string | null;
  invoice_id: string | null;
};

function parseMeta(notes: string | null | undefined): { meta: PacketMeta; visibleNotes: string } {
  const raw = String(notes ?? "");
  const empty: PacketMeta = {
    generated_at: null, approved_at: null, emailed_at: null, uploaded_at: null, invoice_id: null,
  };
  if (!raw.startsWith(PACKET_PREFIX)) return { meta: empty, visibleNotes: raw };
  const nl = raw.indexOf("\n");
  const chunk = nl >= 0 ? raw.slice(PACKET_PREFIX.length, nl) : raw.slice(PACKET_PREFIX.length);
  const rest = nl >= 0 ? raw.slice(nl + 1) : "";
  try {
    const parsed = JSON.parse(chunk) as Partial<PacketMeta>;
    return {
      meta: {
        generated_at: parsed.generated_at ?? null,
        approved_at: parsed.approved_at ?? null,
        emailed_at: parsed.emailed_at ?? null,
        uploaded_at: parsed.uploaded_at ?? null,
        invoice_id: parsed.invoice_id ?? null,
      },
      visibleNotes: rest,
    };
  } catch {
    return { meta: empty, visibleNotes: raw };
  }
}

function serializeMeta(meta: PacketMeta, visibleNotes: string): string {
  return `${PACKET_PREFIX}${JSON.stringify(meta)}\n${visibleNotes.trim()}`.trim();
}

// ─── step bar (LDT-4) ─────────────────────────────────────────────────────────

type FactoringStep =
  | "PRO_FORMA"
  | "IN_TRANSIT"
  | "POD"
  | "SUBMITTED"
  | "ADVANCE_RECEIVED"
  | "RESERVE_RELEASED";

const STEP_ORDER: FactoringStep[] = [
  "PRO_FORMA", "IN_TRANSIT", "POD", "SUBMITTED", "ADVANCE_RECEIVED", "RESERVE_RELEASED",
];

const STEP_LABELS: Record<FactoringStep, string> = {
  PRO_FORMA: "Pro forma",
  IN_TRANSIT: "In transit",
  POD: "POD",
  SUBMITTED: "Submitted",
  ADVANCE_RECEIVED: "Advance received",
  RESERVE_RELEASED: "Reserve released",
};

function deriveStep(
  loadStatus: string,
  hasPod: boolean,
  invoiceFactoringStatus?: string | null,
): FactoringStep {
  const fs = invoiceFactoringStatus ?? "not_factored";
  if (fs === "released") return "RESERVE_RELEASED";
  // recourse_returned: advance was received then charged back — step bar stays at ADVANCE_RECEIVED
  if (fs === "advanced" || fs === "reserve_held" || fs === "collected" || fs === "recourse_returned") return "ADVANCE_RECEIVED";
  if (fs === "submitted") return "SUBMITTED";
  if (hasPod && DELIVERED_STATUSES.includes(loadStatus as never)) return "POD";
  if (TRANSIT_STATUSES.includes(loadStatus as never)) return "IN_TRANSIT";
  return "PRO_FORMA";
}

// ─── small presentational helpers ─────────────────────────────────────────────

function PacketChip({ label, file }: { label: string; file?: DocsFile | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleClick = async () => {
    if (!file || loading) return;
    setLoading(true);
    setError(false);
    try {
      const res = await getDownloadUrl(file.id);
      window.open(res.presigned_url, "_blank");
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const testId = `factoring-chip-${label.toLowerCase().replace(/\s+/g, "-")}`;

  if (!file) {
    return (
      <div className="ldt-chip ldt-chip--missing" data-testid={testId}>
        <span>{label}</span>
        <span className="font-medium">Missing</span>
      </div>
    );
  }

  return (
    <button type="button" onClick={handleClick} disabled={loading} className="ldt-chip ldt-chip--ok" data-testid={testId}>
      <span>✓</span>
      <span>{label}</span>
      <span className="max-w-[140px] truncate text-gray-500">{file.original_filename}</span>
      {error ? <span className="text-red-600">!</span> : null}
    </button>
  );
}

function MoneyRow({
  label, value, sub,
}: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="ldt-card__row">
      <div>
        <div className="ldt-money__label">{label}</div>
        {sub ? <div className="ldt-money__sub">{sub}</div> : null}
      </div>
      <div className="ldt-money__value">{value}</div>
    </div>
  );
}

// ─── props ────────────────────────────────────────────────────────────────────

export type FactoringTabProps = {
  loadId: string;
  operatingCompanyId: string;
  canEdit: boolean;
  onPacketUpdated?: () => void;
};

// ─── component ───────────────────────────────────────────────────────────────

export function FactoringTab({ loadId, operatingCompanyId, canEdit, onPacketUpdated }: FactoringTabProps) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [selectedFactorId, setSelectedFactorId] = useState("");
  const [showAddFactorModal, setShowAddFactorModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "", advance_rate: "0.95", fee_rate: "0.025", reserve_rate: "0.10", recourse_days: "90",
  });

  // load (shared React Query key — deduped with drawer)
  const loadQ = useLoad(loadId, operatingCompanyId);
  const load = loadQ.data;
  const currency = load?.currency_code ?? "USD";

  // documents for this load
  const docsQ = useQuery({
    queryKey: ["factoring-tab", "docs", operatingCompanyId, loadId],
    queryFn: () => listAllFiles({ operating_company_id: operatingCompanyId, entity_type: "load", entity_id: loadId }),
    enabled: Boolean(operatingCompanyId && loadId),
  });
  const docs = docsQ.data?.files ?? [];

  // invoice linked to this load
  const invoicesQ = useQuery({
    queryKey: ["factoring-tab", "invoices", "by-load", operatingCompanyId, loadId],
    queryFn: () => listInvoices(operatingCompanyId, { source_load_id: loadId, limit: 1 }),
    enabled: Boolean(operatingCompanyId && loadId),
  });
  const linkedInvoice = useMemo(() => invoicesQ.data?.invoices?.[0] ?? null, [invoicesQ.data]);

  // invoice docs (for PDF link)
  const invoiceDocsQ = useQuery({
    queryKey: ["factoring-tab", "invoice-docs", operatingCompanyId, linkedInvoice?.id],
    queryFn: () => listAllFiles({ operating_company_id: operatingCompanyId, entity_type: "invoice", entity_id: linkedInvoice!.id }),
    enabled: Boolean(operatingCompanyId && linkedInvoice?.id),
  });

  // active factors for submission
  const factorsQ = useQuery({
    queryKey: ["factoring", "factors", "active", operatingCompanyId],
    queryFn: () => listFactors(operatingCompanyId, { active_only: true }).then((r) => r.factors),
    enabled: Boolean(operatingCompanyId),
  });
  const factorOptions = useMemo(
    () =>
      (factorsQ.data ?? []).map((f) => ({
        value: f.id,
        label: `${f.name} (adv ${f.advance_rate}% · res ${f.reserve_rate}% · fee ${f.fee_rate}%)`,
      })),
    [factorsQ.data],
  );

  // candidate invoices (confirms this invoice is submittable)
  const candidateQ = useQuery({
    queryKey: ["factoring-tab", "candidates", operatingCompanyId],
    queryFn: () => listFactoringCandidateInvoices(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });
  const candidateIds = useMemo(
    () => new Set((candidateQ.data?.rows ?? []).map((r) => r.id)),
    [candidateQ.data],
  );

  // broker advances for this load (money card: "broker advance applied")
  const brokerAdvancesQ = useQuery({
    queryKey: ["factoring-tab", "broker-advances", operatingCompanyId, loadId],
    queryFn: () => listBrokerAdvances(operatingCompanyId, { load_id: loadId }),
    enabled: Boolean(operatingCompanyId && loadId),
  });
  const brokerAdvanceTotalCents = useMemo(
    () => (brokerAdvancesQ.data?.rows ?? []).filter((r) => !r.voided_at).reduce((s, r) => s + Number(r.amount_cents), 0),
    [brokerAdvancesQ.data],
  );

  // factoring advance for this load (money card: amount purchased, rates, net cash)
  const factoringAdvanceQ = useQuery({
    queryKey: ["factoring-tab", "factoring-advance", operatingCompanyId, loadId],
    queryFn: () => listFactoringAdvances(operatingCompanyId, { load_id: loadId, limit: 1 }),
    enabled: Boolean(operatingCompanyId && loadId),
  });
  const factoringAdvance = factoringAdvanceQ.data?.rows?.[0] ?? null;

  // ── derived state ──────────────────────────────────────────────────────────

  const { meta, visibleNotes: _visibleNotes } = useMemo(() => parseMeta(load?.notes), [load?.notes]);

  const isDeliverable = DELIVERED_STATUSES.includes((load?.status ?? "") as never);
  const hasRateConf = docs.some((f) => f.category_code === "rate_confirmation");
  const hasBol = docs.some((f) => f.category_code === "bol");
  const hasPod = docs.some((f) => f.category_code === "pod");
  const hasInvoice = Boolean(linkedInvoice);
  const packetComplete = hasRateConf && hasBol && hasPod && hasInvoice;

  const step = deriveStep(load?.status ?? "", hasPod, linkedInvoice?.factoring_status);
  const stepIndex = STEP_ORDER.indexOf(step);
  const isFactorIdSet = selectedFactorId !== "";

  // specific docs for packet chips
  const rateConfFile = docs.find((f) => f.category_code === "rate_confirmation") ?? null;
  const bolFile = docs.find((f) => f.category_code === "bol") ?? null;
  const podFile = docs.find((f) => f.category_code === "pod") ?? null;
  const invoicePdfFile = (invoiceDocsQ.data?.files ?? []).find((f) => f.mime_type.includes("pdf")) ?? null;

  // net cash = advance_amount_cents - factor_fee_cents
  const netCashCents = (factoringAdvance?.advance_amount_cents ?? 0) - (factoringAdvance?.factor_fee_cents ?? 0);

  // ── mutations ──────────────────────────────────────────────────────────────

  const addFactorMutation = useMutation({
    mutationFn: async () =>
      createFactor(operatingCompanyId, {
        name: addForm.name.trim(),
        advance_rate: Number(addForm.advance_rate),
        fee_rate: Number(addForm.fee_rate),
        reserve_rate: Number(addForm.reserve_rate),
        recourse_days: Number(addForm.recourse_days),
      }),
    onSuccess: async (created) => {
      setShowAddFactorModal(false);
      setAddForm({ name: "", advance_rate: "0.95", fee_rate: "0.025", reserve_rate: "0.10", recourse_days: "90" });
      if (created?.id) setSelectedFactorId(created.id);
      pushToast("Factor created", "success");
      await queryClient.invalidateQueries({ queryKey: ["factoring", "factors", "active", operatingCompanyId] });
      await queryClient.invalidateQueries({ queryKey: ["factoring", "factors", operatingCompanyId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to create factor"), "error"),
  });

  const markReadyMutation = useMutation({
    mutationFn: async () => {
      if (!load) throw new Error("Load not loaded");
      const nextMeta: PacketMeta = {
        ...meta,
        generated_at: meta.generated_at ?? new Date().toISOString(),
        invoice_id: linkedInvoice?.id ?? null,
      };
      await apiRequest(`/api/v1/dispatch/loads/${loadId}`, {
        method: "PATCH",
        body: { operating_company_id: operatingCompanyId, notes: serializeMeta(nextMeta, _visibleNotes) },
      });
    },
    onSuccess: () => {
      pushToast("Packet marked ready", "success");
      void queryClient.invalidateQueries({ queryKey: ["load", loadId] });
      void queryClient.invalidateQueries({ queryKey: ["loads"] });
      onPacketUpdated?.();
    },
    onError: (err) => pushToast(userFacingApiError(err, "Failed"), "error"),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!load) throw new Error("Load not loaded");
      const nextMeta: PacketMeta = { ...meta, approved_at: new Date().toISOString() };
      await apiRequest(`/api/v1/dispatch/loads/${loadId}`, {
        method: "PATCH",
        body: { operating_company_id: operatingCompanyId, notes: serializeMeta(nextMeta, _visibleNotes) },
      });
    },
    onSuccess: () => {
      pushToast("Packet approved — ready to submit to FARO", "success");
      void queryClient.invalidateQueries({ queryKey: ["load", loadId] });
      onPacketUpdated?.();
    },
    onError: (err) => pushToast(userFacingApiError(err, "Failed"), "error"),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!linkedInvoice || !selectedFactorId) throw new Error("Invoice or factor missing");
      // Reuse existing factoring batch create + submit (Block-24/25 poster untouched)
      const batch = await apiRequest<{ id: string }>("/api/v1/factoring/batches", {
        method: "POST",
        body: { operating_company_id: operatingCompanyId, invoice_ids: [linkedInvoice.id] },
      });
      await apiRequest(
        `/api/v1/factoring/batches/${encodeURIComponent(batch.id)}/submit?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
        { method: "POST", body: {} },
      );
    },
    onSuccess: () => {
      pushToast("Invoice submitted to FARO batch", "success");
      setSubmitOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["factoring-tab"] });
      void queryClient.invalidateQueries({ queryKey: ["factoring"] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "factoring-advances"] });
      onPacketUpdated?.();
    },
    onError: (err) => pushToast(userFacingApiError(err, "Submission failed"), "error"),
  });

  // ── loading guard ──────────────────────────────────────────────────────────

  if (loadQ.isLoading) {
    return <div className="p-4 text-xs text-gray-500">Loading factoring data…</div>;
  }
  if (!load) {
    return <div className="rounded-sm border border-gray-200 p-4 text-xs text-gray-500">Load not found.</div>;
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{LDT_CSS}</style>
      <div className="space-y-4 text-xs">
        {/* Exact Leaves load.drawer.factoring:customer — customer_id was used for invoice queries only. */}
        {load.customer_id ? (
          <div className="text-xs text-slate-600" data-testid="factoring-tab-customer-entitylink">
            Customer:{" "}
            <EntityLinkOrTombstone kind="customer" id={load.customer_id} name={load.customer_name ?? null} noun="Customer" />
          </div>
        ) : null}

        {/* ── Step bar (LDT-4) ─────────────────────────────────────────────── */}
        <div className="ldt-card">
          <div className="ldt-card__title">Factoring Status</div>
          <div className="ldt-stepbar">
            {STEP_ORDER.map((s, idx) => {
              const cls =
                idx === stepIndex
                  ? "ldt-step ldt-step--active"
                  : idx < stepIndex
                  ? "ldt-step ldt-step--past"
                  : "ldt-step ldt-step--future";
              return (
                <div key={s} className={cls} data-testid={`factoring-step-${s.toLowerCase()}`}>
                  {idx < stepIndex ? "✓ " : idx === stepIndex ? "▶ " : ""}
                  {STEP_LABELS[s]}
                </div>
              );
            })}
          </div>

          {/* Reverse links — kept from original (Rule 07: never delete) */}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <EntityLink
              kind="factoring_queue_load"
              id={loadId}
              label="View in Dispatch Factoring Queue →"
              data-testid="factoring-tab-view-in-dispatch-queue"
              className="text-xs font-medium text-slate-700 hover:underline"
            />
            <EntityLink
              kind="factoring_recourse_load"
              id={loadId}
              label="View in Recourse Pipeline →"
              data-testid="factoring-tab-view-in-recourse-pipeline"
              className="text-xs font-medium text-slate-700 hover:underline"
            />
            <EntityLink
              kind="factoring_submit_queue_load"
              id={loadId}
              label="View in Submission Queue →"
              data-testid="factoring-tab-view-in-submission-queue"
              className="text-xs font-medium text-slate-700 hover:underline"
            />
            {linkedInvoice?.factoring_advance_id ? (
              <>
                <EntityLink
                  kind="factoring_advance"
                  id={linkedInvoice.factoring_advance_id}
                  label="View Advance Batch →"
                  data-testid="factoring-tab-view-advance-batch"
                  className="text-xs font-medium text-slate-700 hover:underline"
                />
                <Link
                  to={`/banking/factoring?load_id=${encodeURIComponent(loadId)}`}
                  data-testid="factoring-tab-view-banking-entry"
                  className="text-xs font-medium text-slate-700 hover:underline"
                >
                  View in Banking (Faro) →
                </Link>
              </>
            ) : null}
          </div>
        </div>

        {/* ── The money card (LDT-4) ───────────────────────────────────────── */}
        <div className="ldt-card">
          <div className="ldt-card__title">The money</div>
          <div className="ldt-money">
            <MoneyRow
              label="Invoice face"
              value={formatMoneyCents(linkedInvoice?.total_cents ?? null, currency)}
              sub={linkedInvoice?.display_id ?? null}
            />
            <MoneyRow
              label="Broker advance applied"
              value={formatMoneyCents(brokerAdvanceTotalCents || null, currency)}
              sub={brokerAdvancesQ.isError ? "fetch error" : brokerAdvanceTotalCents ? `${(brokerAdvancesQ.data?.rows ?? []).filter((r) => !r.voided_at).length} advance(s)` : null}
            />
            <MoneyRow
              label="Amount purchased"
              value={formatMoneyCents(factoringAdvance?.invoice_total_cents ?? null, currency)}
              sub={factoringAdvance?.display_id ?? null}
            />
            <MoneyRow
              label="Advance %"
              value={factoringAdvance ? `${factoringAdvance.advance_rate_pct}%` : "—"}
              sub="Factoring Advance liability 2150"
            />
            <MoneyRow
              label="Reserve %"
              value={factoringAdvance ? `${factoringAdvance.reserve_pct}%` : "—"}
              sub="Factoring Reserves 1230"
            />
            <MoneyRow
              label="Fee %"
              value={factoringAdvance ? `${factoringAdvance.factor_fee_pct}%` : "—"}
              sub={`Factoring Fee expense ${load?.load_number ?? ""}-F`}
            />
            <MoneyRow
              label="Net cash"
              value={formatMoneyCents(factoringAdvance ? netCashCents : null, currency)}
              sub="advance − fee"
            />
          </div>
        </div>

        {/* ── Packet card (LDT-4) — real attachment chips ──────────────────── */}
        <div className="ldt-card">
          <div className="ldt-card__title">Packet</div>
          <div className="flex flex-wrap gap-2">
            <PacketChip label="Rate con" file={rateConfFile} />
            <PacketChip label="BOL" file={bolFile} />
            <PacketChip label="POD" file={podFile} />
            <PacketChip label="Invoice PDF" file={invoicePdfFile} />
          </div>
          {/* Error notes for failed fetches (honest failure, not silent empty) */}
          {docsQ.isError ? (
            <div className="mt-2">
              <QueryErrorNote label="load documents" onRetry={() => docsQ.refetch()} />
            </div>
          ) : null}
          {invoiceDocsQ.isError ? (
            <div className="mt-2">
              <QueryErrorNote label="invoice documents" onRetry={() => invoiceDocsQ.refetch()} />
            </div>
          ) : null}
          {!isDeliverable ? (
            <p className="mt-2 text-[11px] text-slate-700">
              Packet assembles once load status is delivered or later.
            </p>
          ) : null}
        </div>

        {/* ── Chargebacks (LDT-4) — only when driver-caused and approved ────── */}
        {linkedInvoice?.factoring_status === "recourse_returned" ? (
          <div className="ldt-card">
            <div className="ldt-card__title">Chargebacks</div>
            {linkedInvoice.source_load_chargeback_requested ? (
              <div className="ldt-card__row">
                <div>
                  <div className="text-gray-800">Chargeback — driver-caused and approved</div>
                  {linkedInvoice.source_load_chargeback_reason ? (
                    <div className="ldt-money__sub">{linkedInvoice.source_load_chargeback_reason}</div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="ldt-card__row text-gray-500">No chargebacks</div>
            )}
          </div>
        ) : null}

        {/* ── Timestamps ────────────────────────────────────────────────────── */}
        {(meta.generated_at || meta.approved_at || meta.emailed_at || meta.uploaded_at) ? (
          <div className="rounded-sm border border-gray-200 p-3 text-xs text-gray-600">
            {meta.generated_at ? <div>Assembled: {new Date(meta.generated_at).toLocaleString()}</div> : null}
            {meta.approved_at ? <div>Approved: {new Date(meta.approved_at).toLocaleString()}</div> : null}
            {meta.emailed_at ? <div>Emailed to FARO: {new Date(meta.emailed_at).toLocaleString()}</div> : null}
            {meta.uploaded_at ? <div>Uploaded to portal: {new Date(meta.uploaded_at).toLocaleString()}</div> : null}
          </div>
        ) : null}

        {/* ── Actions ───────────────────────────────────────────────────────── */}
        {canEdit && (step === "PRO_FORMA" || step === "IN_TRANSIT" || step === "POD") ? (
          <div className="space-y-2">
            {/* Before POD: mark packet ready (if deliverable) */}
            {step !== "POD" && isDeliverable && !meta.generated_at ? (
              <div className="rounded-sm border border-slate-300 bg-slate-100 p-3">
                <p className="mb-2 text-xs text-slate-700">
                  {docsQ.isError || invoicesQ.isError
                    ? "Couldn't verify document completeness — see packet above and retry before relying on this."
                    : packetComplete
                    ? "All documents present. Mark packet ready for dispatcher approval."
                    : "Some documents are missing (see packet above). You can still mark ready and upload missing docs later."}
                </p>
                <Button size="sm" onClick={() => markReadyMutation.mutate()} loading={markReadyMutation.isPending}>
                  Mark Packet Ready
                </Button>
              </div>
            ) : null}

            {/* POD step: approve (if not yet approved) */}
            {step === "POD" && !meta.approved_at ? (
              <div className="rounded-sm border border-slate-200 bg-slate-100 p-3">
                <p className="mb-2 text-xs font-medium text-slate-700">
                  Dispatcher approval required before submitting to FARO.
                </p>
                <Button size="sm" onClick={() => approveMutation.mutate()} loading={approveMutation.isPending}>
                  Approve for FARO Submission
                </Button>
              </div>
            ) : null}

            {/* Approved + not yet submitted: submit to FARO */}
            {meta.approved_at && step === "POD" && !submitOpen ? (
              <div className="rounded-sm border border-slate-200 bg-slate-100 p-3">
                <p className="mb-2 text-xs text-slate-700">
                  Packet approved on {new Date(meta.approved_at).toLocaleString()}. Ready to submit to FARO.
                </p>
                <Button
                  size="sm"
                  disabled={!hasPod || !linkedInvoice || !candidateIds.has(linkedInvoice?.id ?? "")}
                  onClick={() => setSubmitOpen(true)}
                >
                  Submit to FARO
                </Button>
                {candidateQ.isError ? (
                  <QueryErrorNote label="submission eligibility" onRetry={() => candidateQ.refetch()} />
                ) : linkedInvoice && !candidateIds.has(linkedInvoice.id) ? (
                  <p className="mt-1 text-[11px] text-slate-700">Invoice may already be in a batch or already factored.</p>
                ) : null}
              </div>
            ) : null}

            {/* Submit form */}
            {submitOpen ? (
              <div className="rounded-sm border border-gray-200 p-3">
                <div className="mb-2 text-xs font-semibold text-gray-700">Select FARO factor account</div>
                <div className="mb-2" data-testid="factoring-tab-submit-factor-picker">
                  <Combobox
                    options={factorOptions}
                    value={selectedFactorId || null}
                    onChange={(next) => setSelectedFactorId(next ?? "")}
                    placeholder="— choose factor —"
                    loading={factorsQ.isLoading}
                    allowAddNew={{ label: "+ Add new factor", onAdd: () => setShowAddFactorModal(true) }}
                  />
                  {factorsQ.isError ? (
                    <QueryErrorNote label="factor accounts" onRetry={() => factorsQ.refetch()} />
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!hasPod || !isFactorIdSet || submitMutation.isPending}
                    loading={submitMutation.isPending}
                    onClick={() => submitMutation.mutate()}
                  >
                    Confirm Submit
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setSubmitOpen(false)}>
                    Cancel
                  </Button>
                </div>
                {!hasPod ? (
                  <p className="mt-1 text-[11px] text-red-600">POD required before submission.</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {showAddFactorModal ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-3">
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-sm border border-gray-200 bg-white p-4 shadow-xl">
              <div className="mb-3 text-xs font-semibold text-gray-900">Add Factor</div>
              <div className="space-y-2 text-xs">
                <label className="block">
                  <div className="mb-1">Name</div>
                  <input
                    value={addForm.name}
                    onChange={(event) => setAddForm((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-sm border border-gray-300 px-2 py-1"
                  />
                </label>
                <label className="block">
                  <div className="mb-1">Advance Rate (0-1)</div>
                  <input
                    value={addForm.advance_rate}
                    onChange={(event) => setAddForm((current) => ({ ...current, advance_rate: event.target.value }))}
                    className="w-full rounded-sm border border-gray-300 px-2 py-1"
                  />
                </label>
                <label className="block">
                  <div className="mb-1">Fee Rate (0-1)</div>
                  <input
                    value={addForm.fee_rate}
                    onChange={(event) => setAddForm((current) => ({ ...current, fee_rate: event.target.value }))}
                    className="w-full rounded-sm border border-gray-300 px-2 py-1"
                  />
                </label>
                <label className="block">
                  <div className="mb-1">Reserve Rate (0-1)</div>
                  <input
                    value={addForm.reserve_rate}
                    onChange={(event) => setAddForm((current) => ({ ...current, reserve_rate: event.target.value }))}
                    className="w-full rounded-sm border border-gray-300 px-2 py-1"
                  />
                </label>
                <label className="block">
                  <div className="mb-1">Recourse Days</div>
                  <input
                    value={addForm.recourse_days}
                    onChange={(event) => setAddForm((current) => ({ ...current, recourse_days: event.target.value }))}
                    className="w-full rounded-sm border border-gray-300 px-2 py-1"
                  />
                </label>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setShowAddFactorModal(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  loading={addFactorMutation.isPending}
                  onClick={() => {
                    if (!addForm.name.trim()) {
                      pushToast("Factor name is required", "error");
                      return;
                    }
                    void addFactorMutation.mutateAsync();
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Already submitted / beyond → informational */}
        {["SUBMITTED", "ADVANCE_RECEIVED", "RESERVE_RELEASED"].includes(step) ? (
          <div className="rounded-sm border border-gray-200 p-3 text-xs text-gray-600">
            {step === "SUBMITTED"
              ? "Invoice submitted to FARO factoring batch. Track progress in Accounting → Factoring."
              : step === "ADVANCE_RECEIVED"
              ? "Advance received from FARO. Reserve hold period active."
              : "Reserve released. Factoring cycle complete."}
          </div>
        ) : null}
      </div>
    </>
  );
}
