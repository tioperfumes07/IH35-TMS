import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { listAtRiskOrLateDispatchLoads } from "../../api/dispatch";
import { ListErrorState } from "../../components/ListErrorState";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
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
    queryKey: ["dispatch", "at-risk-or-late-loads", companyId],
    queryFn: () => listAtRiskOrLateDispatchLoads(companyId),
    enabled: Boolean(companyId),
  });

  const loads = loadsQ.data?.loads ?? [];
  type AtRiskRow = (typeof loads)[number];

  // Migrated to the shared QBO-parity grid — columns, order, load deep-link, and the ETA signal badge
  // are preserved verbatim (§7 additive-only). Declared BEFORE the `!companyId` early return below so
  // the hook call is unconditional (Rules of Hooks — companyId can change between renders).
  // Resolved identities drill through; unavailable historical identities remain honest,
  // non-interactive tombstones instead of dead links.
  const columns = useMemo<ParityColumn<AtRiskRow>[]>(
    () => [
      {
        key: "load_number",
        label: "Load",
        sortable: true,
        className: "font-medium",
        render: (load) => <EntityLinkOrTombstone kind="load" id={load.id} name={load.load_number} noun="Load" />,
      },
      {
        key: "customer_name",
        label: "Customer",
        sortable: true,
        render: (load) => <EntityLinkOrTombstone kind="customer" id={load.customer_id} name={load.customer_name} noun="Customer" />,
      },
      {
        key: "driver_name",
        label: "Driver",
        sortable: true,
        render: (load) => <EntityLinkOrTombstone kind="driver" id={load.driver_id} name={load.driver_name} noun="Driver" />,
      },
      {
        key: "unit_number",
        label: "Unit",
        sortable: true,
        render: (load) => <EntityLinkOrTombstone kind="unit" id={load.unit_id} name={load.unit_number} noun="Unit" />,
      },
      {
        key: "delivery_city",
        label: "Delivery",
        render: (load) => [load.delivery_city, load.delivery_state].filter(Boolean).join(", ") || "—",
      },
      {
        key: "risk_state",
        label: "Risk state",
        render: (load) => [load.is_at_risk ? "At-risk" : null, load.is_late ? "Late" : null].filter(Boolean).join(" + "),
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
        title="At-Risk / Late Queue"
        subtitle="Active dispatched, pickup, in-transit, or delivery loads with an at-risk or late ETA signal"
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
          emptyText="No at-risk or late loads right now."
          storageKey="dispatch-at-risk-late-queue"
          exportFilename="at-risk-late-queue"
        />
      )}
    </div>
  );
}
