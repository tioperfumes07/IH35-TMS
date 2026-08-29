/**
 * FactoringTab — standalone drawer child component.
 * Mount in any load-detail drawer by passing loadId + operatingCompanyId.
 * Does NOT import from LoadDetailDrawer.tsx.
 *
 * Lifecycle displayed:
 *   NOT_FACTORED → PACKET_READY → SUBMITTED → ADVANCE_RECEIVED → RESERVE_RELEASED → CHARGED_BACK
 *
 * PACKET_READY is derived: load.status in delivered+ AND notes carry IH35_FACTORING_PACKAGE_V1::{"generated_at":"…"}
 * Submission reuses existing accounting factoring-advances batch API (Block-24/25 poster untouched).
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoad } from "../../../api/loads";
import { listInvoices, listFactoringCandidateInvoices } from "../../../api/accounting";
import { listAllFiles } from "../../../api/docs";
import { createFactor, listFactors } from "../../../api/factoring";
import { apiRequest } from "../../../api/client";
import { Button } from "../../Button";
import { Combobox } from "../../Combobox";
import { useToast } from "../../Toast";
import { userFacingApiError } from "../../../lib/api-error-message";
import { EntityLink } from "../../shared/EntityLink";
import { EntityLinkOrTombstone } from "../../shared/EntityLinkOrTombstone";
import { QueryErrorNote } from "./QueryErrorNote";

// ─── constants ───────────────────────────────────────────────────────────────

const PACKET_PREFIX = "IH35_FACTORING_PACKAGE_V1::";
const DELIVERABLE_STATUSES = ["delivered", "invoiced", "paid", "closed"] as const;

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
    generated_at: null,
    approved_at: null,
    emailed_at: null,
    uploaded_at: null,
    invoice_id: null,
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

// ─── status helpers ───────────────────────────────────────────────────────────

type FactoringStage =
  | "NOT_FACTORED"
  | "PACKET_READY"
  | "SUBMITTED"
  | "ADVANCE_RECEIVED"
  | "RESERVE_RELEASED"
  | "CHARGED_BACK";

function deriveStage(
  loadStatus: string,
  meta: PacketMeta,
  invoiceFactoringStatus?: string | null,
): FactoringStage {
  const fs = invoiceFactoringStatus ?? "not_factored";
  if (fs === "released") return "RESERVE_RELEASED";
  if (fs === "recourse_returned") return "CHARGED_BACK";
  if (fs === "advanced" || fs === "reserve_held" || fs === "collected") return "ADVANCE_RECEIVED";
  if (fs === "submitted") return "SUBMITTED";
  if (meta.generated_at && DELIVERABLE_STATUSES.includes(loadStatus as never)) return "PACKET_READY";
  return "NOT_FACTORED";
}

const STAGE_ORDER: FactoringStage[] = [
  "NOT_FACTORED",
  "PACKET_READY",
  "SUBMITTED",
  "ADVANCE_RECEIVED",
  "RESERVE_RELEASED",
];

const STAGE_LABELS: Record<FactoringStage, string> = {
  NOT_FACTORED: "Not Factored",
  PACKET_READY: "Packet Ready",
  SUBMITTED: "Submitted",
  ADVANCE_RECEIVED: "Advance Received",
  RESERVE_RELEASED: "Reserve Released",
  CHARGED_BACK: "Charged Back",
};

const STAGE_COLORS: Record<FactoringStage, string> = {
  NOT_FACTORED: "bg-gray-100 text-gray-600 border-gray-200",
  PACKET_READY: "bg-slate-100 text-slate-700 border-slate-300",
  SUBMITTED: "bg-slate-100 text-slate-700 border-slate-200",
  ADVANCE_RECEIVED: "bg-slate-100 text-slate-700 border-slate-200",
  RESERVE_RELEASED: "bg-slate-100 text-slate-700 border-slate-200",
  CHARGED_BACK: "bg-red-50 text-red-700 border-red-200",
};

// ─── checklist item ───────────────────────────────────────────────────────────

function CheckItem({ label, ok, note }: { label: string; ok: boolean; note?: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className={`mt-0.5 text-base leading-none ${ok ? "text-slate-700" : "text-gray-300"}`}>
        {ok ? "✓" : "○"}
      </span>
      <div>
        <span className={ok ? "text-gray-800" : "text-gray-400"}>{label}</span>
        {note ? <span className="ml-1 text-xs text-gray-400">{note}</span> : null}
      </div>
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
    name: "",
    advance_rate: "0.95",
    fee_rate: "0.025",
    reserve_rate: "0.10",
    recourse_days: "90",
  });

  // load (shared React Query key — deduped with drawer)
  const loadQ = useLoad(loadId, operatingCompanyId);
  const load = loadQ.data;

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
  const linkedInvoice = useMemo(() => {
    return invoicesQ.data?.invoices?.[0] ?? null;
  }, [invoicesQ.data]);

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

  // ── derived state ──────────────────────────────────────────────────────────

  const { meta, visibleNotes: _visibleNotes } = useMemo(
    () => parseMeta(load?.notes),
    [load?.notes],
  );

  const isDeliverable = DELIVERABLE_STATUSES.includes((load?.status ?? "") as never);
  const stage = deriveStage(load?.status ?? "", meta, linkedInvoice?.factoring_status);

  const hasRateConf = docs.some((f) => f.category_code === "rate_confirmation");
  const hasBol = docs.some((f) => f.category_code === "bol");
  const hasPod = docs.some((f) => f.category_code === "pod");
  const hasInvoice = Boolean(linkedInvoice);
  const hasInvoicePdf = Boolean((invoiceDocsQ.data?.files ?? []).find((f) => f.mime_type.includes("pdf")));
  const packetComplete = hasRateConf && hasBol && hasPod && hasInvoice;

  const isFactorIdSet = selectedFactorId !== "";

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
        body: {
          operating_company_id: operatingCompanyId,
          notes: serializeMeta(nextMeta, _visibleNotes),
        },
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
      const nextMeta: PacketMeta = {
        ...meta,
        approved_at: new Date().toISOString(),
      };
      await apiRequest(`/api/v1/dispatch/loads/${loadId}`, {
        method: "PATCH",
        body: {
          operating_company_id: operatingCompanyId,
          notes: serializeMeta(nextMeta, _visibleNotes),
        },
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
        body: {
          operating_company_id: operatingCompanyId,
          invoice_ids: [linkedInvoice.id],
        },
      });
      await apiRequest(`/api/v1/factoring/batches/${encodeURIComponent(batch.id)}/submit?operating_company_id=${encodeURIComponent(operatingCompanyId)}`, {
        method: "POST",
        body: {},
      });
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
    return <div className="p-4 text-sm text-gray-500">Loading factoring data…</div>;
  }
  if (!load) {
    return <div className="rounded-sm border border-gray-200 p-4 text-sm text-gray-500">Load not found.</div>;
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 text-sm">
      {/* Exact Leaves load.drawer.factoring:customer — customer_id was used for invoice queries only. */}
      {load.customer_id ? (
        <div className="text-xs text-slate-600" data-testid="factoring-tab-customer-entitylink">
          Customer:{" "}
          <EntityLinkOrTombstone
            kind="customer"
            id={load.customer_id}
            name={load.customer_name ?? null}
            noun="Customer"
          />
        </div>
      ) : null}
      {/* Status badge + stepper */}
      <div className="rounded-sm border border-gray-200 bg-gray-50 p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Factoring Status</span>
          <span className={`rounded-sm border px-2 py-0.5 text-xs font-semibold ${STAGE_COLORS[stage]}`}>
            {STAGE_LABELS[stage]}
          </span>
        </div>
        {/* stepper */}
        <div className="flex flex-wrap gap-1">
          {(stage === "CHARGED_BACK" ? [...STAGE_ORDER, "CHARGED_BACK" as FactoringStage] : STAGE_ORDER).map(
            (s, idx) => {
              const isActive = s === stage;
              const isPast = STAGE_ORDER.indexOf(stage) > idx || stage === "CHARGED_BACK";
              return (
                <div
                  key={s}
                  className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${
                    isActive
                      ? STAGE_COLORS[s]
                      : isPast
                      ? "bg-gray-200 text-gray-500"
                      : "bg-gray-100 text-gray-300"
                  }`}
                >
                  {isActive ? "▶ " : isPast ? "✓ " : ""}
                  {STAGE_LABELS[s]}
                </div>
              );
            },
          )}
        </div>
        {/* LINK-F5171/LINK-F5179 — reverse_link: this tab's own packet-stage lifecycle is derived
        locally from load.notes; the canonical dispatch factoring queue (with its own doc-presence
        checks across every load) never linked back from here. */}
        <EntityLink
          kind="factoring_queue_load"
          id={loadId}
          label="View in Dispatch Factoring Queue →"
          data-testid="factoring-tab-view-in-dispatch-queue"
          className="mt-2 inline-block text-xs font-medium text-slate-700 hover:underline"
        />
        {/* LINK-F5171/LINK-F5180 — reverse_link: factoring:home.recourse_pipeline. */}
        <EntityLink
          kind="factoring_recourse_load"
          id={loadId}
          label="View in Recourse Pipeline →"
          data-testid="factoring-tab-view-in-recourse-pipeline"
          className="mt-2 ml-3 inline-block text-xs font-medium text-slate-700 hover:underline"
        />
        {/* LINK-F5171/LINK-F5181 — reverse_link: factoring:submit.queue. */}
        <EntityLink
          kind="factoring_submit_queue_load"
          id={loadId}
          label="View in Submission Queue →"
          data-testid="factoring-tab-view-in-submission-queue"
          className="mt-2 ml-3 inline-block text-xs font-medium text-slate-700 hover:underline"
        />
        {linkedInvoice?.factoring_advance_id ? (
          <>
            {/* LINK-F5171/LINK-F5184 — reverse_link: factoring:accounting.list — this load's own
            advance batch, direct detail drill. */}
            <EntityLink
              kind="factoring_advance"
              id={linkedInvoice.factoring_advance_id}
              label="View Advance Batch →"
              data-testid="factoring-tab-view-advance-batch"
              className="mt-2 ml-3 inline-block text-xs font-medium text-slate-700 hover:underline"
            />
            {/* LINK-F5171/LINK-F5184 — reverse_link: factoring:banking.entry — Banking (Faro) tab
            filtered to this load's advance(s). */}
            <Link
              to={`/banking/factoring?load_id=${encodeURIComponent(loadId)}`}
              data-testid="factoring-tab-view-banking-entry"
              className="mt-2 ml-3 inline-block text-xs font-medium text-slate-700 hover:underline"
            >
              View in Banking (Faro) →
            </Link>
          </>
        ) : null}
      </div>

      {/* Document checklist */}
      <div className="rounded-sm border border-gray-200 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Packet Checklist</div>
        <div className="space-y-1.5">
          {/* DSP-MONEY-F7283 — docsQ failure used to silently default `docs` to [], indistinguishable
          from a genuine empty document set: hasRateConf/hasBol/hasPod all read false and the operator
          saw "Upload under Documents tab" for documents that may actually already exist. */}
          <CheckItem
            label="Rate Confirmation"
            ok={hasRateConf}
            note={docsQ.isError ? <QueryErrorNote label="documents" onRetry={() => docsQ.refetch()} /> : hasRateConf ? undefined : "Upload under Documents tab"}
          />
          <CheckItem
            label="Bill of Lading (BOL)"
            ok={hasBol}
            note={docsQ.isError ? <QueryErrorNote label="documents" onRetry={() => docsQ.refetch()} /> : hasBol ? undefined : "Upload under Documents tab"}
          />
          <CheckItem
            label="Proof of Delivery (POD)"
            ok={hasPod}
            note={docsQ.isError ? <QueryErrorNote label="documents" onRetry={() => docsQ.refetch()} /> : hasPod ? undefined : "Driver PWA or upload under Documents tab"}
          />
          {/* DSP-MONEY-F7283 — invoicesQ failure used to silently default linkedInvoice to null,
          showing "Create invoice from Overview tab" even when a real linked invoice exists. */}
          <CheckItem
            label="Invoice"
            ok={hasInvoice}
            note={
              invoicesQ.isError ? (
                <QueryErrorNote label="invoice" onRetry={() => invoicesQ.refetch()} />
              ) : hasInvoice && linkedInvoice?.id ? (
                <EntityLinkOrTombstone kind="invoice" id={linkedInvoice.id} name={linkedInvoice.display_id} noun="Invoice" className="text-slate-700 hover:underline" data-testid="load-factoring-invoice-link" />
              ) : (
                "Create invoice from Overview tab"
              )
            }
          />
          {hasInvoice ? (
            <CheckItem
              label="Invoice PDF"
              ok={hasInvoicePdf}
              note={invoiceDocsQ.isError ? <QueryErrorNote label="invoice documents" onRetry={() => invoiceDocsQ.refetch()} /> : hasInvoicePdf ? undefined : "Generate from Invoice page"}
            />
          ) : null}
        </div>
        {!isDeliverable ? (
          <p className="mt-2 text-[11px] text-slate-700">
            Packet assembles once load status is delivered or later.
          </p>
        ) : null}
      </div>

      {/* Timestamps */}
      {(meta.generated_at || meta.approved_at || meta.emailed_at || meta.uploaded_at) ? (
        <div className="rounded-sm border border-gray-200 p-3 text-xs text-gray-600">
          {meta.generated_at ? (
            <div>Assembled: {new Date(meta.generated_at).toLocaleString()}</div>
          ) : null}
          {meta.approved_at ? (
            <div>Approved: {new Date(meta.approved_at).toLocaleString()}</div>
          ) : null}
          {meta.emailed_at ? (
            <div>Emailed to FARO: {new Date(meta.emailed_at).toLocaleString()}</div>
          ) : null}
          {meta.uploaded_at ? (
            <div>Uploaded to portal: {new Date(meta.uploaded_at).toLocaleString()}</div>
          ) : null}
        </div>
      ) : null}

      {/* Actions */}
      {canEdit ? (
        <div className="space-y-2">
          {/* Stage: NOT_FACTORED → mark packet ready */}
          {stage === "NOT_FACTORED" && isDeliverable && (
            <div className="rounded-sm border border-slate-300 bg-slate-100 p-3">
              <p className="mb-2 text-xs text-slate-700">
                {/* DSP-MONEY-F7283 — packetComplete is derived from docsQ/invoicesQ; a fetch failure
                on either used to silently read as "documents missing" instead of "can't verify yet". */}
                {docsQ.isError || invoicesQ.isError
                  ? "Couldn't verify document completeness — see checklist above and retry before relying on this."
                  : packetComplete
                  ? "All documents present. Mark packet ready for dispatcher approval."
                  : "Some documents are missing (see checklist). You can still mark ready and upload missing docs later."}
              </p>
              <Button
                size="sm"
                onClick={() => markReadyMutation.mutate()}
                loading={markReadyMutation.isPending}
              >
                Mark Packet Ready
              </Button>
            </div>
          )}

          {/* Stage: PACKET_READY → dispatcher approves */}
          {stage === "PACKET_READY" && !meta.approved_at && (
            <div className="rounded-sm border border-slate-200 bg-slate-100 p-3">
              <p className="mb-2 text-xs font-medium text-slate-700">
                Dispatcher approval required before submitting to FARO.
              </p>
              <Button
                size="sm"
                onClick={() => approveMutation.mutate()}
                loading={approveMutation.isPending}
              >
                Approve for FARO Submission
              </Button>
            </div>
          )}

          {/* Stage: PACKET_READY + approved → submit to FARO */}
          {stage === "PACKET_READY" && meta.approved_at && !submitOpen && (
            <div className="rounded-sm border border-slate-200 bg-slate-100 p-3">
              <p className="mb-2 text-xs text-slate-700">
                Packet approved on {new Date(meta.approved_at).toLocaleString()}. Ready to submit to FARO.
              </p>
              <Button
                size="sm"
                disabled={!linkedInvoice || !candidateIds.has(linkedInvoice?.id ?? "")}
                onClick={() => setSubmitOpen(true)}
              >
                Submit to FARO
              </Button>
              {/* DSP-MONEY-F7283 — candidateQ failure used to silently default candidateIds to an
              empty Set, disabling submission with the WRONG explanation ("may already be in a
              batch") when the real cause was a fetch failure. The button stays safely disabled
              either way (we cannot fabricate eligibility we failed to read); only the message
              changes to the honest one. */}
              {candidateQ.isError ? (
                <QueryErrorNote label="submission eligibility" onRetry={() => candidateQ.refetch()} />
              ) : linkedInvoice && !candidateIds.has(linkedInvoice.id) ? (
                <p className="mt-1 text-[11px] text-slate-700">Invoice may already be in a batch or already factored.</p>
              ) : null}
            </div>
          )}

          {/* Submit form */}
          {submitOpen && (
            <div className="rounded-sm border border-gray-200 p-3">
              <div className="mb-2 text-xs font-semibold text-gray-700">Select FARO factor account</div>
              {/* LST-F153: bare <select> had no + Add new — operators left load factoring to create a factor. */}
              <div className="mb-2" data-testid="factoring-tab-submit-factor-picker">
                <Combobox
                  options={factorOptions}
                  value={selectedFactorId || null}
                  onChange={(next) => setSelectedFactorId(next ?? "")}
                  placeholder="— choose factor —"
                  loading={factorsQ.isLoading}
                  allowAddNew={{
                    label: "+ Add new factor",
                    onAdd: () => setShowAddFactorModal(true),
                  }}
                />
                {/* DSP-MONEY-F7283 — factorsQ failure used to silently default the picker to an
                empty option list with no explanation, indistinguishable from "no factors set up". */}
                {factorsQ.isError ? (
                  <QueryErrorNote label="factor accounts" onRetry={() => factorsQ.refetch()} />
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!isFactorIdSet || submitMutation.isPending}
                  loading={submitMutation.isPending}
                  onClick={() => submitMutation.mutate()}
                >
                  Confirm Submit
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setSubmitOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {showAddFactorModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-3">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-sm border border-gray-200 bg-white p-4 shadow-xl">
            <div className="mb-3 text-sm font-semibold text-gray-900">Add Factor</div>
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
      {["SUBMITTED", "ADVANCE_RECEIVED", "RESERVE_RELEASED", "CHARGED_BACK"].includes(stage) ? (
        <div className="rounded-sm border border-gray-200 p-3 text-xs text-gray-600">
          {stage === "SUBMITTED"
            ? "Invoice submitted to FARO factoring batch. Track progress in Accounting → Factoring."
            : stage === "ADVANCE_RECEIVED"
            ? "Advance received from FARO. Reserve hold period active."
            : stage === "RESERVE_RELEASED"
            ? "Reserve released. Factoring cycle complete."
            : "Chargeback recorded. See Accounting → Factoring for recourse details."}
        </div>
      ) : null}
    </div>
  );
}
