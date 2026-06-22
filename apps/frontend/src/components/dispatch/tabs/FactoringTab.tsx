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
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoad } from "../../../api/loads";
import { listInvoices, listFactoringCandidateInvoices } from "../../../api/accounting";
import { listFiles } from "../../../api/docs";
import { listFactors } from "../../../api/factoring";
import { apiRequest } from "../../../api/client";
import { Button } from "../../Button";
import { useToast } from "../../Toast";

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
  SUBMITTED: "bg-amber-50 text-amber-700 border-amber-200",
  ADVANCE_RECEIVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  RESERVE_RELEASED: "bg-green-100 text-green-800 border-green-200",
  CHARGED_BACK: "bg-red-50 text-red-700 border-red-200",
};

// ─── checklist item ───────────────────────────────────────────────────────────

function CheckItem({ label, ok, note }: { label: string; ok: boolean; note?: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className={`mt-0.5 text-base leading-none ${ok ? "text-emerald-600" : "text-gray-300"}`}>
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

  // load (shared React Query key — deduped with drawer)
  const loadQ = useLoad(loadId);
  const load = loadQ.data;

  // documents for this load
  const docsQ = useQuery({
    queryKey: ["factoring-tab", "docs", loadId],
    queryFn: () => listFiles({ entity_type: "load", entity_id: loadId, limit: 200, offset: 0 }),
    enabled: Boolean(loadId),
  });
  const docs = docsQ.data?.files ?? [];

  // invoice linked to this load
  const invoicesQ = useQuery({
    queryKey: ["factoring-tab", "invoices", operatingCompanyId, load?.customer_id],
    queryFn: () => listInvoices(operatingCompanyId, { customer_id: load!.customer_id }),
    enabled: Boolean(load?.customer_id),
  });
  const linkedInvoice = useMemo(() => {
    return (invoicesQ.data?.invoices ?? []).find((inv) => inv.source_load_id === loadId) ?? null;
  }, [invoicesQ.data, loadId]);

  // invoice docs (for PDF link)
  const invoiceDocsQ = useQuery({
    queryKey: ["factoring-tab", "invoice-docs", linkedInvoice?.id],
    queryFn: () => listFiles({ entity_type: "invoice", entity_id: linkedInvoice!.id, limit: 50, offset: 0 }),
    enabled: Boolean(linkedInvoice?.id),
  });

  // active factors for submission
  const factorsQ = useQuery({
    queryKey: ["factoring", "factors", "active", operatingCompanyId],
    queryFn: () => listFactors(operatingCompanyId, { active_only: true }).then((r) => r.factors),
    enabled: Boolean(operatingCompanyId),
  });

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
    onError: (err) => pushToast(String((err as Error).message ?? "Failed"), "error"),
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
    onError: (err) => pushToast(String((err as Error).message ?? "Failed"), "error"),
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
    onError: (err) => pushToast(String((err as Error).message ?? "Submission failed"), "error"),
  });

  // ── loading guard ──────────────────────────────────────────────────────────

  if (loadQ.isLoading) {
    return <div className="p-4 text-sm text-gray-500">Loading factoring data…</div>;
  }
  if (!load) {
    return <div className="rounded border border-gray-200 p-4 text-sm text-gray-500">Load not found.</div>;
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 text-sm">
      {/* Status badge + stepper */}
      <div className="rounded border border-gray-200 bg-gray-50 p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Factoring Status</span>
          <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${STAGE_COLORS[stage]}`}>
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
      </div>

      {/* Document checklist */}
      <div className="rounded border border-gray-200 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Packet Checklist</div>
        <div className="space-y-1.5">
          <CheckItem
            label="Rate Confirmation"
            ok={hasRateConf}
            note={hasRateConf ? undefined : "Upload under Documents tab"}
          />
          <CheckItem
            label="Bill of Lading (BOL)"
            ok={hasBol}
            note={hasBol ? undefined : "Upload under Documents tab"}
          />
          <CheckItem
            label="Proof of Delivery (POD)"
            ok={hasPod}
            note={hasPod ? undefined : "Driver PWA or upload under Documents tab"}
          />
          <CheckItem
            label="Invoice"
            ok={hasInvoice}
            note={hasInvoice ? (linkedInvoice?.display_id ?? undefined) : "Create invoice from Overview tab"}
          />
          {hasInvoice ? (
            <CheckItem
              label="Invoice PDF"
              ok={hasInvoicePdf}
              note={hasInvoicePdf ? undefined : "Generate from Invoice page"}
            />
          ) : null}
        </div>
        {!isDeliverable ? (
          <p className="mt-2 text-[11px] text-amber-700">
            Packet assembles once load status is delivered or later.
          </p>
        ) : null}
      </div>

      {/* Timestamps */}
      {(meta.generated_at || meta.approved_at || meta.emailed_at || meta.uploaded_at) ? (
        <div className="rounded border border-gray-200 p-3 text-xs text-gray-600">
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
            <div className="rounded border border-slate-300 bg-slate-100 p-3">
              <p className="mb-2 text-xs text-slate-700">
                {packetComplete
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
            <div className="rounded border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-xs font-medium text-amber-900">
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
            <div className="rounded border border-emerald-200 bg-emerald-50 p-3">
              <p className="mb-2 text-xs text-emerald-800">
                Packet approved on {new Date(meta.approved_at).toLocaleString()}. Ready to submit to FARO.
              </p>
              <Button
                size="sm"
                disabled={!linkedInvoice || !candidateIds.has(linkedInvoice?.id ?? "")}
                onClick={() => setSubmitOpen(true)}
              >
                Submit to FARO
              </Button>
              {linkedInvoice && !candidateIds.has(linkedInvoice.id) ? (
                <p className="mt-1 text-[11px] text-amber-700">Invoice may already be in a batch or already factored.</p>
              ) : null}
            </div>
          )}

          {/* Submit form */}
          {submitOpen && (
            <div className="rounded border border-gray-200 p-3">
              <div className="mb-2 text-xs font-semibold text-gray-700">Select FARO factor account</div>
              <select
                className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                value={selectedFactorId}
                onChange={(e) => setSelectedFactorId(e.target.value)}
              >
                <option value="">— choose factor —</option>
                {(factorsQ.data ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} (adv {f.advance_rate}% · res {f.reserve_rate}% · fee {f.fee_rate}%)
                  </option>
                ))}
              </select>
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

      {/* Already submitted / beyond → informational */}
      {["SUBMITTED", "ADVANCE_RECEIVED", "RESERVE_RELEASED", "CHARGED_BACK"].includes(stage) ? (
        <div className="rounded border border-gray-200 p-3 text-xs text-gray-600">
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
