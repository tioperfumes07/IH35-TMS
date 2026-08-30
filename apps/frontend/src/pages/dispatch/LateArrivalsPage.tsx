import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listLateArrivalDispatchLoads, type DispatchAlertQuery } from "../../api/dispatch";
import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { StatusBadge } from "../../components/StatusBadge";
import { entityLabel, isUnresolvedEntityTombstone } from "../../lib/entity-label";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { DispatchAlertServerControls, type DispatchAlertRange } from "../../components/dispatch/DispatchAlertServerControls";

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
  const [range, setRange] = useState<DispatchAlertRange>({ from: "", to: "" });
  const [sort, setSort] = useState<Required<Pick<DispatchAlertQuery, "sort" | "direction">>>({ sort: "event_at", direction: "asc" });

  const lateQ = useQuery({
    queryKey: ["dispatch", "late-arrivals", companyId, range, sort],
    queryFn: () => listLateArrivalDispatchLoads(companyId, { ...range, ...sort }),
    enabled: Boolean(companyId),
  });

  if (!companyId) {
    return <div className="rounded-sm border bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  const loads = lateQ.data?.loads ?? [];
  const grace = lateQ.data?.grace_minutes ?? 30;
  type LateArrivalRow = (typeof loads)[number];

  // Migrated to the shared QBO-parity grid — columns, order, load deep-link, and the ETA signal
  // badge are preserved verbatim (§7 additive-only). Load drill-through uses EntityLink (canonical
  // /dispatch/loads/:id) — not a query-param board bookmark.
  const columns: Array<ParityColumn<LateArrivalRow>> = [
    {
      key: "load_number",
      label: "Load",
      sortable: true,
      className: "font-medium",
      render: (load) => {
        const label = entityLabel(load.load_number, load.id, "Load");
        // LV-DISPATCH-LATE-ARRIVALS-TOMBSTONE
        if (isUnresolvedEntityTombstone(load.load_number, load.id, "Load")) {
          return <span className="font-medium text-slate-600" data-testid="late-arrival-load-tombstone">{label}</span>;
        }
        return (
          <EntityLink
            kind="load"
            id={load.id}
            label={label}
            data-testid={`late-arrival-load-${load.id}`}
          />
        );
      },
    },
    {
      key: "customer_name",
      label: "Customer",
      sortable: true,
      render: (load) => {
        if (!load.customer_id) return <span className="text-slate-400">—</span>;
        const label = entityLabel(load.customer_name, load.customer_id, "Customer");
        if (isUnresolvedEntityTombstone(load.customer_name, load.customer_id, "Customer")) {
          return <span className="text-slate-600" data-testid="late-arrival-customer-tombstone">{label}</span>;
        }
        return <EntityLink kind="customer" id={load.customer_id} label={label} data-testid="late-arrival-customer-link" />;
      },
    },
    {
      key: "driver_name",
      label: "Driver",
      sortable: true,
      render: (load) => {
        if (!load.driver_id) return <span className="text-slate-400">—</span>;
        const label = entityLabel(load.driver_name, load.driver_id, "Driver");
        if (isUnresolvedEntityTombstone(load.driver_name, load.driver_id, "Driver")) {
          return <span className="text-slate-600" data-testid="late-arrival-driver-tombstone">{label}</span>;
        }
        return <EntityLink kind="driver" id={load.driver_id} label={label} data-testid="late-arrival-driver-link" />;
      },
    },
    {
      key: "unit_number",
      label: "Unit",
      sortable: true,
      render: (load) => {
        if (!load.unit_id) return <span className="text-slate-400">—</span>;
        const label = entityLabel(load.unit_number, load.unit_id, "Unit");
        if (isUnresolvedEntityTombstone(load.unit_number, load.unit_id, "Unit")) {
          return <span className="text-slate-600" data-testid="late-arrival-unit-tombstone">{label}</span>;
        }
        return <EntityLink kind="unit" id={load.unit_id} label={label} data-testid="late-arrival-unit-link" />;
      },
    },
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
          <Link to="/dispatch/alerts" className="rounded-sm border px-3 py-1.5 text-sm">
            Dispatch alerts
          </Link>
        }
      />

      <DispatchAlertServerControls value={range} onApply={setRange} />

      {lateQ.isError ? (
        <ListErrorBanner
          message="Failed to load late arrivals."
          onRetry={() => void lateQ.refetch()}
        />
      ) : null}

      {!lateQ.isError ? (
        <ParityTable<LateArrivalRow>
          columns={columns}
          rows={loads}
          rowKey={(load) => load.id}
          loading={lateQ.isLoading}
          emptyText="No late arrivals right now."
          storageKey="dispatch-late-arrivals"
          exportFilename="late-arrivals"
          suppressToolbarRange
          sortKey={sort.sort === "event_at" ? "next_stop_scheduled_at" : sort.sort}
          sortDirection={sort.direction}
          sortMode="external"
          onSortChange={(key, direction) => setSort({ sort: key === "next_stop_scheduled_at" ? "event_at" : key as DispatchAlertQuery["sort"], direction })}
        />
      ) : null}
    </div>
  );
}
