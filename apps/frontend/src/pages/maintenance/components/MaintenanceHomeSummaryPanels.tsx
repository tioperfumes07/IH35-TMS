import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  getArrivingSoon,
  listMaintenancePredictiveAlerts,
  listMaintPmDue,
  type ArrivingSoonCard,
  type MaintPmDueRow,
  type PredictiveAlertRow,
} from "../../../api/maintenance";
import { V3Panel } from "../../../components/v3/V3Panel";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ListErrorState } from "../../../components/ListErrorState";
import { formatDateTimeUS, formatDateUS } from "../../../lib/formatDate";

const PM_LABEL: Record<string, string> = { oil: "Oil", tires: "Tires", dot_inspection: "DOT", brake: "Brake" };

/**
 * LEAD 11-03 (row 70, Codex batch40: "Full arrivals roster, PM status and scheduling action are not supplied"): the
 * arriving unit's PM state from the SAME pm-due source as the PM countdown cards. Due now wins; otherwise the nearest
 * schedule by miles, then days. No schedule = said so, never "OK".
 */
export function pmStatusForUnit(
  rows: MaintPmDueRow[],
  unitId: string,
  source: "ready" | "loading" | "error" = "ready"
): { text: string; due: boolean } {
  // Codex batch53: an unread source is not "No PM schedule" — that would be a claim the screen never measured.
  if (source === "loading") return { text: "Checking PM…", due: false };
  if (source === "error") return { text: "PM unavailable", due: false };
  const mine = rows.filter((r) => r.asset_id === unitId);
  if (mine.length === 0) return { text: "No PM schedule", due: false };
  const dueNow = mine.filter((r) => r.is_due);
  if (dueNow.length > 0) return { text: `Due: ${dueNow.map((r) => PM_LABEL[r.pm_type] ?? r.pm_type).join(", ")}`, due: true };
  const byMiles = mine.filter((r) => r.miles_remaining != null).sort((a, b) => (a.miles_remaining ?? 0) - (b.miles_remaining ?? 0))[0];
  if (byMiles) return { text: `${PM_LABEL[byMiles.pm_type] ?? byMiles.pm_type} in ${Math.round(byMiles.miles_remaining ?? 0).toLocaleString("en-US")} mi`, due: false };
  const byDays = mine.filter((r) => r.days_remaining != null).sort((a, b) => (a.days_remaining ?? 0) - (b.days_remaining ?? 0))[0];
  if (byDays) return { text: `${PM_LABEL[byDays.pm_type] ?? byDays.pm_type} in ${byDays.days_remaining} d`, due: false };
  return { text: "Schedule has no reading", due: false };
}

function arrivalsColumns(pmRows: MaintPmDueRow[], pmSource: "ready" | "loading" | "error"): ParityColumn<ArrivingSoonCard>[] {
  return [
    { key: "unit_number", label: "Unit", render: row => <EntityLink kind="unit" id={row.unit_id} label={row.unit_number} /> },
    { key: "driver_name", label: "Driver", render: row => row.driver_id ? <EntityLink kind="driver" id={row.driver_id} label={row.driver_name || "Driver record"} /> : "Not assigned" },
    { key: "load_display_id", label: "Arriving", render: row => <EntityLink kind="load" id={row.load_id} label={[row.final_dest_city, row.load_display_id].filter(Boolean).join(" · ")} /> },
    { key: "predicted_yard_arrival_at", label: "ETA", render: row => row.predicted_yard_arrival_at ? formatDateTimeUS(row.predicted_yard_arrival_at) : "Not available" },
    {
      key: "total_open_issues",
      label: "Issues",
      render: row => row.total_open_issues > 0
        ? `${row.total_open_issues}${row.severe_count > 0 ? ` (${row.severe_count} severe)` : ""}`
        : "None open",
    },
    {
      key: "pm",
      label: "PM",
      render: row => {
        const pm = pmStatusForUnit(pmRows, row.unit_id, pmSource);
        return <span data-testid={`maintenance-home-arrival-pm-${row.unit_id}`} className={pm.due ? "font-semibold text-[#A32D2D]" : undefined}>{pm.text}</span>;
      },
    },
    {
      key: "schedule",
      label: "",
      render: row => (
        // D24 deep link: MaintenanceHome opens Create Work Order as a modal for this unit.
        <Link to={`/maintenance?create_wo=1&unit_id=${encodeURIComponent(row.unit_id)}`} className="text-xs font-semibold text-[#1D4ED8]" data-testid={`maintenance-home-arrival-schedule-${row.unit_id}`}>
          Schedule WO
        </Link>
      ),
    },
  ];
}
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
  // Same query key as MaintenanceHome's PM countdown cards → one request, one cache entry.
  const pmDue = useQuery({
    queryKey: ["maintenance", "maint-pm-due", companyId, "include-not-due"],
    queryFn: () => listMaintPmDue(companyId, { includeNotDue: true }),
    enabled: Boolean(companyId),
    retry: false,
  });
  const risk = useQuery({
    queryKey: ["maintenance", "home-predictive", companyId],
    queryFn: () => listMaintenancePredictiveAlerts(companyId, { state: "open", limit: 5, offset: 0 }),
    enabled: Boolean(companyId),
  });
  return <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2" data-testid="maintenance-home-summary-panels">
    <V3Panel title="Arriving soon — to the Laredo yard" onViewAll={() => navigate("/maintenance/arriving-soon")} footer="First 5 yard arrivals in the next 48 hours with their open issues and PM state; View all for the complete inbound roster.">
      {arrivals.isError ? <ListErrorState title="Couldn't load arrivals" status={0} onRetry={() => void arrivals.refetch()} /> : <ParityTable appearance="board" rows={arrivals.data?.cards ?? []} columns={arrivalsColumns(pmDue.data?.rows ?? [], pmDue.isError ? "error" : pmDue.isLoading ? "loading" : "ready")} rowKey={row => row.load_id} loading={arrivals.isLoading} storageKey="maintenance-home-arrivals-summary" emptyText="No arrivals returned by the yard / 48-hour source." />}
    </V3Panel>
    <V3Panel title="At risk — brakes & tires" onViewAll={() => navigate("/maintenance/predictive-alerts")} footer={risk.data ? `${risk.data.total_count} open alerts; showing up to 5. View all for the complete register and work-order actions.` : "Source register retains all work-order actions."}>
      {risk.isError ? <ListErrorState title="Couldn't load projected wear" status={0} onRetry={() => void risk.refetch()} /> : <ParityTable appearance="board" rows={risk.data?.alerts ?? []} columns={riskColumns} rowKey={row => row.id} loading={risk.isLoading} storageKey="maintenance-home-risk-summary" emptyText="No open brake or tire projections." />}
    </V3Panel>
  </div>;
}
