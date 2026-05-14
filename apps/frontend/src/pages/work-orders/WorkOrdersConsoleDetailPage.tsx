import { useMemo } from "react";
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
  workOrderConsolePdfUrl,
} from "../../api/workOrdersConsole";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { Breadcrumb } from "../../components/shared/Breadcrumb";
import { useToast } from "../../components/Toast";
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

  const cancelMut = useMutation({
    mutationFn: () => cancelWorkOrderConsole(String(id), companyId, "Cancelled from console"),
    onSuccess: () => {
      pushToast("Work order cancelled", "success");
      invalidate();
    },
    onError: (error: unknown) => pushToast(String((error as Error)?.message ?? "Cancel failed"), "error"),
  });

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
        <Button variant="danger" type="button" onClick={() => void cancelMut.mutateAsync()} disabled={cancelMut.isPending}>
          Cancel
        </Button>
      </div>

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
