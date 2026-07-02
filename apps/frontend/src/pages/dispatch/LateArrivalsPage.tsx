import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listLateArrivalDispatchLoads } from "../../api/dispatch";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { StatusBadge } from "../../components/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";

function etaLabel(prediction: Record<string, unknown> | null | undefined): string {
  if (!prediction) return "No ETA";
  const cls = String(prediction.confidence_class ?? "");
  const at = prediction.predicted_arrival_at ? new Date(String(prediction.predicted_arrival_at)).toLocaleString() : "";
  const variance = prediction.variance_minutes != null ? `${prediction.variance_minutes}m variance` : "";
  return [cls, at, variance].filter(Boolean).join(" · ");
}

export function LateArrivalsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const lateQ = useQuery({
    queryKey: ["dispatch", "late-arrivals", companyId],
    queryFn: () => listLateArrivalDispatchLoads(companyId),
    enabled: Boolean(companyId),
  });

  if (!companyId) {
    return <div className="rounded border bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  const loads = lateQ.data?.loads ?? [];
  const grace = lateQ.data?.grace_minutes ?? 30;
  type LateArrivalRow = (typeof loads)[number];

  // Migrated to the shared QBO-parity grid — columns, order, load deep-link, and the ETA signal
  // badge are preserved verbatim (§7 additive-only).
  const columns: Array<ParityColumn<LateArrivalRow>> = [
    {
      key: "load_number",
      label: "Load",
      sortable: true,
      className: "font-medium",
      render: (load) => (
        <Link to={`/dispatch?load_id=${encodeURIComponent(load.id)}`} className="text-slate-700 hover:underline">
          {load.load_number}
        </Link>
      ),
    },
    { key: "customer_name", label: "Customer", sortable: true, render: (load) => load.customer_name ?? "—" },
    { key: "driver_name", label: "Driver", sortable: true, render: (load) => load.driver_name ?? "—" },
    {
      key: "next_stop_city",
      label: "Next stop",
      render: (load) => (
        <>
          {[load.next_stop_city, load.next_stop_state].filter(Boolean).join(", ") || "—"}
          {load.next_stop_type ? <span className="ml-1 text-xs text-slate-500">({load.next_stop_type})</span> : null}
        </>
      ),
    },
    {
      key: "next_stop_scheduled_at",
      label: "Scheduled",
      sortable: true,
      render: (load) => (load.next_stop_scheduled_at ? new Date(load.next_stop_scheduled_at).toLocaleString() : "—"),
    },
    {
      key: "eta_signal",
      label: "ETA signal",
      render: (load) => (
        <>
          <StatusBadge status={String(load.latest_eta_prediction?.confidence_class ?? "late")} />
          <span className="ml-2 text-xs text-slate-600">{etaLabel(load.latest_eta_prediction)}</span>
        </>
      ),
    },
  ];

  return (
    <div data-testid="dispatch-late-arrivals-page" className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Late arrivals"
        subtitle={`Loads past schedule + ${grace}m grace or with late ETA prediction`}
        actions={
          <Link to="/dispatch/alerts" className="rounded border px-3 py-1.5 text-sm">
            Dispatch alerts
          </Link>
        }
      />

      <ParityTable<LateArrivalRow>
        columns={columns}
        rows={loads}
        rowKey={(load) => load.id}
        loading={lateQ.isLoading}
        emptyText="No late arrivals right now."
        storageKey="dispatch-late-arrivals"
        exportFilename="late-arrivals"
      />
    </div>
  );
}
