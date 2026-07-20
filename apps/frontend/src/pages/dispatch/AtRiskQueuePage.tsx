import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { listAtRiskDispatchLoads } from "../../api/dispatch";
import { ListErrorState } from "../../components/ListErrorState";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { StatusBadge } from "../../components/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";

function etaLabel(prediction: Record<string, unknown> | null | undefined): string {
  if (!prediction) return "No ETA";
  const cls = String(prediction.confidence_class ?? "");
  const at = prediction.predicted_arrival_at ? new Date(String(prediction.predicted_arrival_at)).toLocaleString() : "";
  const variance = prediction.variance_minutes != null ? `${prediction.variance_minutes}m variance` : "";
  return [cls, at, variance].filter(Boolean).join(" · ");
}

export function AtRiskQueuePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const loadsQ = useQuery({
    queryKey: ["dispatch", "at-risk-loads", companyId],
    queryFn: () => listAtRiskDispatchLoads(companyId),
    enabled: Boolean(companyId),
  });

  const loads = loadsQ.data?.loads ?? [];
  type AtRiskRow = (typeof loads)[number];

  // Migrated to the shared QBO-parity grid — columns, order, load deep-link, and the ETA signal badge
  // are preserved verbatim (§7 additive-only). Declared BEFORE the `!companyId` early return below so
  // the hook call is unconditional (Rules of Hooks — companyId can change between renders).
  // Load cell uses EntityLink (Law of the Land reverse drill-through) instead of ad-hoc Link.
  const columns = useMemo<ParityColumn<AtRiskRow>[]>(
    () => [
      {
        key: "load_number",
        label: "Load",
        sortable: true,
        className: "font-medium",
        render: (load) => <EntityLink kind="load" id={load.id} label={load.load_number ?? load.id} />,
      },
      { key: "customer_name", label: "Customer", sortable: true, render: (load) => load.customer_name ?? "—" },
      { key: "driver_name", label: "Driver", sortable: true, render: (load) => load.driver_name ?? "—" },
      { key: "unit_number", label: "Unit", sortable: true, render: (load) => load.unit_number ?? "—" },
      {
        key: "delivery_city",
        label: "Delivery",
        render: (load) => [load.delivery_city, load.delivery_state].filter(Boolean).join(", ") || "—",
      },
      {
        key: "eta_signal",
        label: "ETA signal",
        render: (load) => (
          <>
            <StatusBadge status={String(load.latest_eta_prediction?.confidence_class ?? "warning")} />
            <span className="ml-2 text-xs text-slate-600">{etaLabel(load.latest_eta_prediction)}</span>
          </>
        ),
      },
    ],
    [],
  );

  if (!companyId) {
    return <div className="rounded-sm border bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  return (
    <div data-testid="dispatch-at-risk-page" className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="At-Risk Queue"
        subtitle="In-transit loads with late or near-late ETA predictions"
        actions={
          <Link to="/dispatch" className="rounded-sm border px-3 py-1.5 text-sm">
            Dispatch Home
          </Link>
        }
      />

      {loadsQ.isError ? (
        <ListErrorState
          title="Couldn't load at-risk queue"
          status={0}
          message={(loadsQ.error as Error)?.message}
          onRetry={() => void loadsQ.refetch()}
        />
      ) : (
        <ParityTable<AtRiskRow>
          columns={columns}
          rows={loads}
          rowKey={(load) => load.id}
          loading={loadsQ.isLoading}
          emptyText="No at-risk loads right now."
          storageKey="dispatch-at-risk-queue"
          exportFilename="at-risk-queue"
        />
      )}
    </div>
  );
}
