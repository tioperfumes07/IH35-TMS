/**
 * ROUND 443.326 — KPI strip + bordered FuelBoardSection (no V3Panel).
 * getFuelComplianceSummary values unchanged.
 */
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { FuelBoardSection } from "../FuelBoardSection";
import { formatDateTimeUS } from "../../../lib/formatDate";
import { formatQuantityTable } from "../../../lib/money";

type Props = {
  sourceAvailable: boolean;
  /** Row 163 — why the source is empty (planner recommendations + Loves price sync state), from the API. */
  unavailableReason?: string | null;
  lovesLastSyncedAt?: string | null;
  sentToDriverAt: string | null;
  fleetPct: number | null;
  fleetTotalRecommendations: number | null;
  driverPct: number | null;
};

function pct(sourceAvailable: boolean, value: number | null): string {
  if (!sourceAvailable || value === null) return "—";
  return `${formatQuantityTable(value, 1)}%`;
}

function count(sourceAvailable: boolean, value: number | null): string {
  if (!sourceAvailable || value === null) return "—";
  return String(value);
}

export function CompliancePanel({
  sourceAvailable,
  unavailableReason,
  lovesLastSyncedAt,
  sentToDriverAt,
  fleetPct,
  fleetTotalRecommendations,
  driverPct,
}: Props) {
  const sentLabel = sentToDriverAt ? formatDateTimeUS(sentToDriverAt) || "Not sent" : "Not sent";

  return (
    <div className="space-y-3" data-testid="fuel-compliance-panel">
      {/* ROUND 443.250 Compliance V3 — same getFuelComplianceSummary fields as pre-V3 rows. */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}
        data-testid="fuel-compliance-v3-kpi-strip"
        data-fuel-compliance-v3-kpis="1"
      >
        <V3KpiTile
          label="Fleet followed YTD"
          value={pct(sourceAvailable, fleetPct)}
          sub="recommendations followed"
          tone={sourceAvailable && fleetPct != null && fleetPct >= 80 ? "green" : "ink"}
          testId="fuel-compliance-kpi-fleet"
        />
        <V3KpiTile
          label="Driver followed YTD"
          value={pct(sourceAvailable, driverPct)}
          sub="active route driver"
          testId="fuel-compliance-kpi-driver"
        />
        <V3KpiTile
          label="Fleet tracked"
          value={count(sourceAvailable, fleetTotalRecommendations)}
          sub="recommendations YTD"
          testId="fuel-compliance-kpi-tracked"
        />
        <V3KpiTile
          label="Sent to driver"
          value={sentToDriverAt ? "Yes" : "No"}
          sub={sentLabel}
          testId="fuel-compliance-kpi-sent"
        />
      </div>

      {!sourceAvailable ? (
        <div className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-[#1F2A44]" data-testid="fuel-source-gap">
          <strong>Not available.</strong>{" "}
          {unavailableReason ?? "The planner has not produced the data this panel reads."}{" "}
          {lovesLastSyncedAt ? `Loves prices last synced ${lovesLastSyncedAt.slice(0, 10)}.` : "Not synced since: never."}
        </div>
      ) : null}
      <FuelBoardSection
        title="Compliance Tracker"
        subtitle="YTD from the fuel planner compliance summary"
        testId="fuel-compliance-v3-panel"
      >
        <div className="px-3 py-2 text-xs text-[#4B5563]" data-testid="fuel-compliance-detail">
          <Row label="Sent to driver app" value={sentLabel} />
          <Row
            label="Recommendations followed YTD (driver)"
            value={!sourceAvailable || driverPct === null ? "Not available" : `${formatQuantityTable(driverPct, 1)}%`}
          />
          <Row
            label="Recommendations followed YTD (fleet)"
            value={!sourceAvailable || fleetPct === null ? "Not available" : `${formatQuantityTable(fleetPct, 1)}%`}
          />
          <Row
            label="Fleet recommendations tracked"
            value={
              !sourceAvailable || fleetTotalRecommendations === null
                ? "Not available"
                : `${fleetTotalRecommendations}`
            }
          />
          <Row label="Last week non-compliance count" value="Not available" />
          <Row label="Top non-compliance reason" value="Not available" />
          <div className="mt-2 rounded-sm bg-[#F7F8FA] px-2 py-1 text-xs text-[#1F2A44]">
            Relay match confidence: high when station+timestamp+unit align.
          </div>
        </div>
      </FuelBoardSection>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-t border-gray-100 py-1 first:border-t-0">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}
