import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDriverSafetyPeriodScores, type DriverSafetyScoreRow } from "../../../api/safety";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { DriverScoreDetail } from "./DriverScoreDetail";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

type PeriodPreset = "week" | "month" | "quarter";

function periodBounds(preset: PeriodPreset): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  if (preset === "week") from.setDate(from.getDate() - 6);
  if (preset === "month") from.setDate(from.getDate() - 29);
  if (preset === "quarter") from.setDate(from.getDate() - 89);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function scoreClass(score: number | null) {
  if (score == null) return "text-slate-500";
  if (score >= 85) return "text-slate-700";
  if (score >= 70) return "text-slate-700";
  return "text-red-700";
}

export function DriverScoringTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [selectedDriver, setSelectedDriver] = useState<DriverSafetyScoreRow | null>(null);
  const bounds = useMemo(() => periodBounds(preset), [preset]);

  const leaderboardQuery = useQuery({
    queryKey: ["safety", "driver-scoring", "period", companyId, bounds.from, bounds.to],
    queryFn: () => listDriverSafetyPeriodScores(companyId, bounds.from, bounds.to),
    enabled: Boolean(companyId),
  });

  const rows = leaderboardQuery.data?.rows ?? [];

  const columns = useMemo<ParityColumn<DriverSafetyScoreRow>[]>(
    () => [
      { key: "rank_in_fleet", label: "Rank", sortable: true, render: (row) => row.rank_in_fleet ?? "—" },
      { key: "driver_name", label: "Driver", sortable: true },
      {
        key: "composite_score",
        label: "Score",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => (
          <span className={`font-semibold ${scoreClass(row.composite_score)}`}>
            {row.composite_score == null ? "N/A" : row.composite_score.toFixed(1)}
          </span>
        ),
      },
      { key: "harsh_brake_count", label: "Brakes", sortable: true, className: "text-right", cellClass: "text-right" },
      { key: "hard_accel_count", label: "Accel", sortable: true, className: "text-right", cellClass: "text-right" },
      { key: "speeding_seconds", label: "Speeding (s)", sortable: true, className: "text-right", cellClass: "text-right" },
      { key: "lane_departure_count", label: "Lane", sortable: true, className: "text-right", cellClass: "text-right" },
      {
        key: "miles_driven",
        label: "Miles",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => row.miles_driven.toFixed(0),
      },
      {
        key: "trend",
        label: "Trend",
        render: (row) => (
          <button type="button" className="text-slate-700 underline" onClick={() => setSelectedDriver(row)}>
            View
          </button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 bg-white p-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Driver Safety Scoring</h3>
          <p className="text-xs text-slate-500">
            Composite score from harsh events and telematics miles (min 500 mi to rank).
          </p>
        </div>
      </div>

      <ParityTable<DriverSafetyScoreRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.driver_uuid}
        loading={leaderboardQuery.isLoading}
        emptyText="No composite scores for this period yet. Weekly aggregation runs Monday 3am CT."
        storageKey="safety-driver-scoring"
        exportFilename="driver-safety-scoring"
        filterBar={
          <div className="relative flex flex-wrap items-center gap-2">
            <span className="text-slate-500">Period</span>
            {(["week", "month", "quarter"] as PeriodPreset[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setPreset(value)}
                className={`rounded-sm px-2 py-1 capitalize ${preset === value ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}
              >
                {value}
              </button>
            ))}
          </div>
        }
      />

      {selectedDriver ? (
        <DriverScoreDetail
          companyId={companyId}
          driverUuid={selectedDriver.driver_uuid}
          driverName={selectedDriver.driver_name}
          onClose={() => setSelectedDriver(null)}
        />
      ) : null}
    </div>
  );
}
