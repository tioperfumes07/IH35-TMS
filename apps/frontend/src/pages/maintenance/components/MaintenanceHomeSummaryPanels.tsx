import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getArrivingSoon, listMaintenancePredictiveAlerts, type ArrivingSoonCard, type PredictiveAlertRow } from "../../../api/maintenance";
import { V3Panel } from "../../../components/v3/V3Panel";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ListErrorState } from "../../../components/ListErrorState";
import { formatDateTimeUS, formatDateUS } from "../../../lib/formatDate";

const arrivalsColumns: ParityColumn<ArrivingSoonCard>[] = [
  { key: "unit_number", label: "Unit", render: row => <EntityLink kind="unit" id={row.unit_id} label={row.unit_number} /> },
  { key: "driver_name", label: "Driver", render: row => row.driver_id ? <EntityLink kind="driver" id={row.driver_id} label={row.driver_name || "Driver record"} /> : "Not assigned" },
  { key: "load_display_id", label: "Arriving", render: row => <EntityLink kind="load" id={row.load_id} label={[row.final_dest_city, row.load_display_id].filter(Boolean).join(" · ")} /> },
  { key: "predicted_yard_arrival_at", label: "ETA", render: row => row.predicted_yard_arrival_at ? formatDateTimeUS(row.predicted_yard_arrival_at) : "Not available" },
];
const riskColumns: ParityColumn<PredictiveAlertRow>[] = [
  { key: "unit_number", label: "Unit", render: row => <EntityLink kind="unit" id={row.unit_id} label={row.unit_number || "Unit record"} /> },
  { key: "alert_type", label: "Part", render: row => row.alert_type === "brake_wear" ? "Brakes" : "Tires" },
  { key: "current_measure", label: "Reading", render: row => `${row.current_measure} ${row.measure_unit}` },
  { key: "projected_failure_date", label: "Projected limit", render: row => formatDateUS(row.projected_failure_date) },
];

/** Read-only board summaries, not embedded workflow pages or mutation modals. */
export function MaintenanceHomeSummaryPanels({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const arrivals = useQuery({
    queryKey: ["maintenance", "home-arrivals", companyId],
    queryFn: () => getArrivingSoon({ operating_company_id: companyId, within_hours: 48, severity_min: "info", include_already_arrived: true, include_non_yard_destination: false, limit: 5, offset: 0, recent_limit: 1, recent_offset: 0 }),
    enabled: Boolean(companyId),
  });
  const risk = useQuery({
    queryKey: ["maintenance", "home-predictive", companyId],
    queryFn: () => listMaintenancePredictiveAlerts(companyId, { state: "open", limit: 5, offset: 0 }),
    enabled: Boolean(companyId),
  });
  return <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2" data-testid="maintenance-home-summary-panels">
    <V3Panel title="Arriving soon — to the Laredo yard" onViewAll={() => navigate("/maintenance/arriving-soon")} footer="First 5 arrivals with reported issues, yard / 48 hours; not the complete inbound fleet. Full arrivals roster, PM status and scheduling action are not supplied by this source.">
      {arrivals.isError ? <ListErrorState title="Couldn't load arrivals" status={0} onRetry={() => void arrivals.refetch()} /> : <ParityTable rows={arrivals.data?.cards ?? []} columns={arrivalsColumns} rowKey={row => row.load_id} loading={arrivals.isLoading} storageKey="maintenance-home-arrivals-summary" emptyText="No arrivals returned by the yard / 48-hour source." />}
    </V3Panel>
    <V3Panel title="At risk — brakes & tires" onViewAll={() => navigate("/maintenance/predictive-alerts")} footer={risk.data ? `${risk.data.total_count} open alerts; showing up to 5. View all for the complete register and work-order actions.` : "Source register retains all work-order actions."}>
      {risk.isError ? <ListErrorState title="Couldn't load projected wear" status={0} onRetry={() => void risk.refetch()} /> : <ParityTable rows={risk.data?.alerts ?? []} columns={riskColumns} rowKey={row => row.id} loading={risk.isLoading} storageKey="maintenance-home-risk-summary" emptyText="No open brake or tire projections." />}
    </V3Panel>
  </div>;
}
