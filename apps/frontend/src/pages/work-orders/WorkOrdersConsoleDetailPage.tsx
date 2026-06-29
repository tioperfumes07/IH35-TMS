import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  appendWorkOrderPhotoKey,
  approveWorkOrderConsole,
  cancelWorkOrderConsole,
  completeWorkOrderConsole,
  getWorkOrderConsoleDetail,
  requestWorkOrderPhotoUpload,
  startWorkOrderConsole,
  voidWorkOrderConsole,
  workOrderConsolePdfUrl,
} from "../../api/workOrdersConsole";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { Breadcrumb } from "../../components/shared/Breadcrumb";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../auth/useAuth";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { WOTimeTrackingPanel } from "./WOTimeTrackingPanel";

export function WorkOrdersConsoleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["work-orders-console", "detail", id, companyId],
    queryFn: () => getWorkOrderConsoleDetail(String(id), companyId),
    enabled: Boolean(id && companyId),
  });

  const wo = detailQuery.data?.work_order;

  const title = useMemo(() => `Work order ${String(wo?.display_id ?? id ?? "")}`, [id, wo?.display_id]);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["work-orders-console"] });

  const approveMut = useMutation({
    mutationFn: () => approveWorkOrderConsole(String(id), companyId),
    onSuccess: () => {
      pushToast("Work order approved", "success");
      invalidate();
    },
    onError: (error: unknown) => pushToast(String((error as Error)?.message ?? "Approve failed"), "error"),
  });

  const startMut = useMutation({
    mutationFn: () => startWorkOrderConsole(String(id), companyId),
    onSuccess: () => {
      pushToast("Work marked in progress", "success");
      invalidate();
    },
    onError: (error: unknown) => pushToast(String((error as Error)?.message ?? "Start failed"), "error"),
  });

  const completeMut = useMutation({
    mutationFn: () => completeWorkOrderConsole(String(id), companyId),
    onSuccess: () => {
      pushToast("Work order completed", "success");
      invalidate();
    },
    onError: (error: unknown) => pushToast(String((error as Error)?.message ?? "Complete failed"), "error"),
  });

  // Cancel/Void = Owner/Administrator ONLY, reason REQUIRED, soft (never deletes). A reason modal
  // captures the WHY, which the backend writes to the immutable audit trail.
  const auth = useAuth();
  const canCancelVoid = ["Owner", "Administrator"].includes(String(auth.user?.role ?? ""));
  const [reasonModal, setReasonModal] = useState<{ kind: "cancel" | "void" } | null>(null);
  const [reasonText, setReasonText] = useState("");

  const cancelMut = useMutation({
    mutationFn: (reason: string) => cancelWorkOrderConsole(String(id), companyId, reason),
    onSuccess: () => {
      pushToast("Work order cancelled", "success");
      setReasonModal(null);
      setReasonText("");
      invalidate();
    },
    onError: (error: unknown) => pushToast(String((error as Error)?.message ?? "Cancel failed"), "error"),
  });

  const voidMut = useMutation({
    mutationFn: (reason: string) => voidWorkOrderConsole(String(id), companyId, reason),
    onSuccess: () => {
      pushToast("Work order voided", "success");
      setReasonModal(null);
      setReasonText("");
      invalidate();
    },
    onError: (error: unknown) => pushToast(String((error as Error)?.message ?? "Void failed"), "error"),
  });

  const reasonValid = reasonText.trim().length >= 3;
  const submitReason = () => {
    if (!reasonValid || !reasonModal) return;
    if (reasonModal.kind === "cancel") void cancelMut.mutateAsync(reasonText.trim());
    else void voidMut.mutateAsync(reasonText.trim());
  };

  const pdfHref = id ? workOrderConsolePdfUrl(String(id), companyId) : "";

  const uploadPhoto = async (file: File | null) => {
    if (!id || !companyId || !file) return;
    try {
      const intent = await requestWorkOrderPhotoUpload(String(id), companyId, file.type || "application/octet-stream");
      const put = await fetch(intent.upload_url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) {
        pushToast("Upload to storage failed", "error");
        return;
      }
      await appendWorkOrderPhotoKey(String(id), companyId, intent.object_key);
      pushToast("Photo attached", "success");
      invalidate();
    } catch (error) {
      pushToast(String((error as Error)?.message ?? "Photo upload failed"), "error");
    }
  };

  const photoPaths = Array.isArray(wo?.r2_photo_paths) ? (wo?.r2_photo_paths as string[]) : [];

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:underline"
          onClick={() => navigate("/work-orders")}
        >
          <span aria-hidden="true">←</span>
          <span>Back</span>
        </button>
        <Breadcrumb
          items={[
            { label: "Work orders", href: "/work-orders" },
            { label: String(wo?.display_id ?? "Detail") },
          ]}
        />
      </div>

      <PageHeader title={title} subtitle={String(wo?.description ?? "").slice(0, 160)} />

      {!companyId ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">Select a company.</div> : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" type="button" onClick={() => window.open(pdfHref, "_blank", "noopener,noreferrer")}>
          Download PDF (HTML print)
        </Button>
        <Button variant="secondary" type="button" onClick={() => void approveMut.mutateAsync()} disabled={approveMut.isPending}>
          Approve
        </Button>
        <Button variant="secondary" type="button" onClick={() => void startMut.mutateAsync()} disabled={startMut.isPending}>
          Start work
        </Button>
        <Button variant="primary" type="button" onClick={() => void completeMut.mutateAsync()} disabled={completeMut.isPending}>
          Complete
        </Button>
        {canCancelVoid ? (
          <>
            <Button
              variant="danger"
              type="button"
              onClick={() => {
                setReasonText("");
                setReasonModal({ kind: "cancel" });
              }}
              disabled={cancelMut.isPending}
            >
              Cancel WO
            </Button>
            <Button
              variant="danger"
              type="button"
              onClick={() => {
                setReasonText("");
                setReasonModal({ kind: "void" });
              }}
              disabled={voidMut.isPending}
            >
              Void
            </Button>
          </>
        ) : null}
      </div>

      {reasonModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
            <h2 className="text-sm font-semibold text-slate-900">
              {reasonModal.kind === "cancel" ? "Cancel work order" : "Void work order"}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {reasonModal.kind === "cancel"
                ? "This cancels the work order. It is never deleted — it stays on record with your reason in the audit trail."
                : "This voids the work order (incl. completed). It is never deleted — it stays on record with your reason in the audit trail."}
            </p>
            <label className="mt-3 block text-xs font-semibold text-slate-700" htmlFor="wo-reason">
              Reason (required)
            </label>
            <textarea
              id="wo-reason"
              className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
              rows={3}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="Why is this being cancelled/voided?"
              autoFocus
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setReasonModal(null);
                  setReasonText("");
                }}
              >
                Close
              </Button>
              <Button
                variant="danger"
                type="button"
                onClick={submitReason}
                disabled={!reasonValid || cancelMut.isPending || voidMut.isPending}
              >
                {reasonModal.kind === "cancel" ? "Confirm cancel" : "Confirm void"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Details</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
            <div className="text-slate-500">Status</div>
            <div>{String(wo?.status ?? "—")}</div>
            <div className="text-slate-500">Billing type</div>
            <div>{String(wo?.wo_billing_type ?? "—")}</div>
            <div className="text-slate-500">Service class</div>
            <div>{String(wo?.wo_service_class ?? "—")}</div>
            <div className="text-slate-500">Vendor invoice #</div>
            <div className="font-mono text-xs">{String(wo?.vendor_invoice_number ?? wo?.external_vendor_invoice_number ?? "—")}</div>
            <div className="text-slate-500">Vendor WO #</div>
            <div className="font-mono text-xs">{String(wo?.vendor_work_order_number ?? wo?.external_vendor_wo_number ?? "—")}</div>
            <div className="text-slate-500">Labor cost (tracked)</div>
            <div>{String(wo?.labor_cost_cents ?? "0")} ¢</div>
          </div>
        </div>

        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Photos</div>
          <p className="mt-2 text-xs text-slate-600">Upload evidence photos (R2 signed URL).</p>
          <input
            type="file"
            accept="image/*"
            className="mt-2 block w-full text-xs"
            onChange={(event) => void uploadPhoto(event.target.files?.[0] ?? null)}
          />
          <div className="mt-3 space-y-1 text-xs">
            {photoPaths.map((path) => (
              <div key={path} className="font-mono text-[11px] text-slate-700">
                {path}
              </div>
            ))}
          </div>
        </div>
      </div>

      {id && companyId ? <WOTimeTrackingPanel workOrderId={String(id)} operatingCompanyId={companyId} /> : null}

      <div className="rounded border border-gray-200 bg-white p-3 text-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Line items</div>
        <pre className="mt-2 max-h-[320px] overflow-auto rounded bg-slate-50 p-2 text-[11px]">
          {JSON.stringify(detailQuery.data?.line_items ?? [], null, 2)}
        </pre>
      </div>
    </div>
  );
}
