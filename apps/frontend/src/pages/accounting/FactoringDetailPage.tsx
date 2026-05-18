import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  getFactoringAdvance,
  markAdvanced,
  markReserveHeld,
  recourseReturn,
  releaseReserve,
  type FactoringAdvanceDetail,
  voidFactoring,
} from "../../api/accounting";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { DataPanel } from "../../components/layout/DataPanel";
import { DataPanelRow } from "../../components/layout/DataPanelRow";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNav } from "./AccountingSubNav";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function statusPill(status: FactoringAdvanceDetail["status"]) {
  const base = "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
  if (status === "advanced") return `${base} bg-blue-50 text-blue-700 border border-blue-200`;
  if (status === "reserve_held" || status === "collected") return `${base} bg-amber-50 text-amber-700 border border-amber-200`;
  if (status === "released") return `${base} bg-emerald-50 text-emerald-700 border border-emerald-200`;
  if (status === "recourse_returned") return `${base} bg-red-50 text-red-700 border border-red-200`;
  if (status === "voided") return `${base} bg-slate-100 text-slate-500 border border-slate-200 line-through`;
  return `${base} bg-slate-50 text-slate-700 border border-slate-200`;
}

type ActionKind = "advance" | "reserve_held" | "release" | "recourse" | "void";

export function FactoringDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();

  const [action, setAction] = useState<ActionKind | null>(null);
  const [notes, setNotes] = useState("");
  const [collectedAt, setCollectedAt] = useState("");
  const [advancedAt, setAdvancedAt] = useState("");
  const [releasedAt, setReleasedAt] = useState("");
  const [releaseAmount, setReleaseAmount] = useState("0");
  const [feeAmount, setFeeAmount] = useState("0");
  const [recourseReason, setRecourseReason] = useState("");
  const [voidReason, setVoidReason] = useState("");

  const query = useQuery({
    queryKey: ["accounting", "factoring-advance", selectedCompanyId, id],
    queryFn: () => getFactoringAdvance(id, selectedCompanyId!),
    enabled: Boolean(id && selectedCompanyId),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId || !action) return;
      if (action === "advance") {
        await markAdvanced(id, selectedCompanyId, { advanced_at: advancedAt ? new Date(advancedAt).toISOString() : undefined, notes: notes || undefined });
      } else if (action === "reserve_held") {
        await markReserveHeld(id, selectedCompanyId, { collected_at: collectedAt ? new Date(collectedAt).toISOString() : undefined, notes: notes || undefined });
      } else if (action === "release") {
        await releaseReserve(id, selectedCompanyId, {
          released_at: releasedAt ? new Date(releasedAt).toISOString() : undefined,
          release_amount_cents: Math.max(0, Math.trunc(Number(releaseAmount || "0"))),
          factor_fee_cents: Math.max(0, Math.trunc(Number(feeAmount || "0"))),
          notes: notes || undefined,
        });
      } else if (action === "recourse") {
        await recourseReturn(id, selectedCompanyId, {
          recourse_reason: recourseReason,
        });
      } else if (action === "void") {
        await voidFactoring(id, selectedCompanyId, voidReason || undefined);
      }
    },
    onSuccess: () => {
      setAction(null);
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "factoring-advance", selectedCompanyId, id] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "factoring-advances"] });
    },
  });

  const detail = query.data;
  const showAdvance = detail?.status === "submitted";
  const showReserveHeld = detail?.status === "advanced";
  const showRelease = detail?.status === "reserve_held" || detail?.status === "collected";
  const showRecourse = detail?.status !== "released" && detail?.status !== "voided";
  const showVoid = detail?.status === "submitted" || detail?.status === "advanced";

  const totals = useMemo(() => {
    if (!detail) return null;
    return {
      total: money(detail.invoice_total_cents),
      advance: money(detail.advance_amount_cents),
      reserve: money(detail.reserve_amount_cents),
      fee: money(detail.factor_fee_cents),
      release: money(detail.release_amount_cents),
    };
  }, [detail]);

  if (query.isLoading) return <div className="text-sm text-gray-500">Loading factoring batch...</div>;
  if (!detail) return <div className="text-sm text-red-600">Factoring batch not found.</div>;

  return (
    <div className="space-y-3">
      <AccountingSubNav />
      <PageHeader
        title={detail.display_id}
        backHref="/accounting/factoring"
        breadcrumb={[
          { label: "Accounting", href: "/accounting" },
          { label: "Factoring", href: "/accounting/factoring" },
          { label: detail.display_id },
        ]}
        subtitle={`Factor: ${detail.factoring_company_name}`}
        actions={
          <div className="flex items-center gap-2">
            <span className={statusPill(detail.status)}>{detail.status.replaceAll("_", " ")}</span>
            <Button variant="secondary" onClick={() => navigate(`/vendors/${detail.factoring_company_vendor_id}`)}>
              Edit factoring company profile
            </Button>
            {showAdvance ? <Button onClick={() => setAction("advance")}>Mark Advanced</Button> : null}
            {showReserveHeld ? (
              <Button variant="secondary" onClick={() => setAction("reserve_held")}>
                Mark Reserve Held
              </Button>
            ) : null}
            {showRelease ? <Button onClick={() => setAction("release")}>Release Reserve</Button> : null}
            {showRecourse ? (
              <Button variant="secondary" onClick={() => setAction("recourse")}>
                Recourse Return
              </Button>
            ) : null}
            {showVoid ? (
              <Button variant="danger" onClick={() => setAction("void")}>
                Void
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-2">
        <DataPanel title="Header">
          <DataPanelRow>
            <span className="text-xs text-gray-600">Factor</span>
            <span className="text-sm text-gray-900">{detail.factoring_company_name}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Submitted</span>
            <span className="text-sm text-gray-900">{new Date(detail.submitted_at).toLocaleString()}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Status</span>
            <span className="text-sm text-gray-900">{detail.status}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Batch ref</span>
            <span className="text-sm text-gray-900">{detail.submission_batch_ref ?? "-"}</span>
          </DataPanelRow>
        </DataPanel>

        <DataPanel title="Amounts">
          <DataPanelRow>
            <span className="text-xs text-gray-600">Invoice Total</span>
            <span className="text-sm text-gray-900">{totals?.total}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Advance Rate</span>
            <span className="text-sm text-gray-900">{detail.advance_rate_pct}%</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Advance</span>
            <span className="text-sm text-gray-900">{totals?.advance}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Reserve</span>
            <span className="text-sm text-gray-900">{totals?.reserve}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Fee</span>
            <span className="text-sm text-gray-900">{totals?.fee}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Release</span>
            <span className="text-sm text-gray-900">{totals?.release}</span>
          </DataPanelRow>
        </DataPanel>
      </div>

      <DataPanel title="Linked invoices">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th className="px-2 py-1.5 font-semibold">Invoice #</th>
                <th className="px-2 py-1.5 font-semibold">Customer</th>
                <th className="px-2 py-1.5 font-semibold">Issue Date</th>
                <th className="px-2 py-1.5 font-semibold">Total</th>
                <th className="px-2 py-1.5 font-semibold">Factoring Status</th>
              </tr>
            </thead>
            <tbody>
              {detail.invoices.map((invoice) => (
                <tr key={invoice.id} className="cursor-pointer border-b border-gray-100 hover:bg-gray-50" onClick={() => navigate(`/accounting/invoices/${invoice.id}`)}>
                  <td className="px-2 py-1.5 text-gray-900">{invoice.display_id}</td>
                  <td className="px-2 py-1.5 text-gray-700">{invoice.customer_name}</td>
                  <td className="px-2 py-1.5 text-gray-700">{invoice.issue_date}</td>
                  <td className="px-2 py-1.5 text-gray-700">{money(invoice.total_cents)}</td>
                  <td className="px-2 py-1.5 text-gray-700">{invoice.factoring_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataPanel>

      <Modal
        open={Boolean(action)}
        title={
          action === "advance"
            ? "Mark Advanced"
            : action === "reserve_held"
              ? "Mark Reserve Held"
              : action === "release"
                ? "Release Reserve"
                : action === "recourse"
                  ? "Recourse Return"
                  : "Void Factoring Batch"
        }
        onClose={() => setAction(null)}
      >
        <div className="space-y-2 text-sm">
          {action === "advance" ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-600">Advanced at</span>
              <input type="datetime-local" className="h-9 rounded border border-gray-300 px-2 text-[13px]" value={advancedAt} onChange={(event) => setAdvancedAt(event.target.value)} />
            </label>
          ) : null}
          {action === "reserve_held" ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-600">Collected at</span>
              <input type="datetime-local" className="h-9 rounded border border-gray-300 px-2 text-[13px]" value={collectedAt} onChange={(event) => setCollectedAt(event.target.value)} />
            </label>
          ) : null}
          {action === "release" ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-gray-600">Released at</span>
                <input type="datetime-local" className="h-9 rounded border border-gray-300 px-2 text-[13px]" value={releasedAt} onChange={(event) => setReleasedAt(event.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-gray-600">Factor fee cents</span>
                <input type="number" min={0} className="h-9 rounded border border-gray-300 px-2 text-[13px]" value={feeAmount} onChange={(event) => setFeeAmount(event.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-gray-600">Release amount cents</span>
                <input type="number" min={0} className="h-9 rounded border border-gray-300 px-2 text-[13px]" value={releaseAmount} onChange={(event) => setReleaseAmount(event.target.value)} />
              </label>
            </>
          ) : null}
          {action === "recourse" ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-600">Recourse reason</span>
              <textarea className="min-h-[80px] rounded border border-gray-300 p-2 text-[13px]" value={recourseReason} onChange={(event) => setRecourseReason(event.target.value)} />
            </label>
          ) : null}
          {action === "void" ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-600">Void reason</span>
              <textarea className="min-h-[80px] rounded border border-gray-300 p-2 text-[13px]" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
            </label>
          ) : null}

          {action && action !== "recourse" && action !== "void" ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-600">Notes</span>
              <textarea className="min-h-[80px] rounded border border-gray-300 p-2 text-[13px]" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-2">
            <Button variant="secondary" onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button loading={mutation.isPending} onClick={() => mutation.mutate()}>
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
