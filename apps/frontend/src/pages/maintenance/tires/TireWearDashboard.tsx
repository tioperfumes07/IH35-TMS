/**
 * Tire Wear Dashboard — GAP-62 / CAP-12
 * At-risk units with replacement projected within 30 days.
 */
import { entityLabel } from "../../../lib/entity-label";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EntityLink } from "../../../components/shared/EntityLink";
import { apiRequest } from "../../../api/client";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { formatDateUS } from "../../../lib/formatDate";

type AxleGroup = "all" | "steer" | "drive" | "trailer";

type AtRiskRow = {
  unit_uuid: string;
  unit_number: string | null;
  tire_position: string;
  threshold_32nds: number;
  current_depth_32nds: number | null;
  projected_replacement_date: string | null;
  wear_rate_32nds_per_day: number | null;
  position_group: string | null;
  days_until_replacement: number | null;
};

type AtRiskResponse = {
  rows: AtRiskRow[];
  count: number;
  within_days: number;
};

function fetchAtRisk(companyId: string, withinDays: number, axleGroup: AxleGroup) {
  const q = new URLSearchParams({
    operating_company_id: companyId,
    within_days: String(withinDays),
    axle_group: axleGroup,
  });
  return apiRequest<AtRiskResponse>(`/api/v1/maintenance/tire-tread/at-risk?${q.toString()}`);
}

export function TireWearDashboard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [axleGroup, setAxleGroup] = useState<AxleGroup>("all");
  const withinDays = 30;

  const atRiskQ = useQuery({
    queryKey: ["maintenance", "tire-wear", "at-risk", companyId, withinDays, axleGroup],
    queryFn: () => fetchAtRisk(companyId, withinDays, axleGroup),
    enabled: Boolean(companyId),
  });

  const rows = useMemo(() => atRiskQ.data?.rows ?? [], [atRiskQ.data?.rows]);

  const columns = useMemo<ParityColumn<AtRiskRow>[]>(
    () => [
      {
        key: "unit_number",
        label: "Unit",
        sortable: true,
        render: (row) => (
          <EntityLink kind="unit_tires_tab" id={row.unit_uuid} label={entityLabel(row.unit_number, row.unit_uuid, "Unit")} className="text-slate-700 hover:underline" />
        ),
      },
      { key: "tire_position", label: "Position", sortable: true, render: (row) => row.tire_position },
      { key: "current_depth_32nds", label: "Depth", render: (row) => `${row.current_depth_32nds ?? "—"}/32"` },
      { key: "threshold_32nds", label: "Threshold", render: (row) => `${row.threshold_32nds}/32"` },
      { key: "projected_replacement_date", label: "Projected", sortable: true, render: (row) => formatDateUS(row.projected_replacement_date) || "—" },
      {
        key: "days_until_replacement",
        label: "Days",
        sortable: true,
        render: (row) => (
          <span className={(row.days_until_replacement ?? 99) <= 14 ? "font-semibold text-red-700" : "text-amber-700"}>
            {row.days_until_replacement ?? "—"}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4 p-4" data-testid="tire-wear-dashboard">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Tire Wear Tracking</h1>
          <p className="text-xs text-gray-600">
            CAP-12 tread projections · DOT minimums 4/32&quot; steer · 2/32&quot; drive
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-sm border border-gray-200 bg-white p-1">
          {(["all", "steer", "drive", "trailer"] as const).map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setAxleGroup(group)}
              className={`rounded px-2.5 py-1.5 text-xs font-medium capitalize ${
                axleGroup === group ? "bg-slate-100 text-slate-800" : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {group === "all" ? "All axles" : `${group}s`}
            </button>
          ))}
        </div>
      </div>

      {!companyId ? <p className="text-sm text-red-600">Select operating company.</p> : null}

      <section className="rounded-sm border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-3 py-2">
          <h2 className="text-sm font-semibold text-gray-900">At-risk units (&lt;{withinDays} days)</h2>
          <p className="text-xs text-gray-500">
            {atRiskQ.isError ? "Projection count unavailable" : `${rows.length} tire positions projected for replacement`}
          </p>
        </div>
        {atRiskQ.isLoading ? <p className="p-3 text-xs text-gray-500">Loading projections...</p> : null}
        <div className="p-3">
          {/* CLS-LIST-ERROR-STATE-UNGUARDED: a failed query fell through to the empty state — an outage presenting as NO TIRES AT RISK, which on a
            tire-wear dashboard is a safety claim, not a cosmetic gap. */}
          {atRiskQ.isError ? (
            <ListErrorState
              title="Couldn't load at-risk tires"
              status={0}
              message={(atRiskQ.error as Error)?.message}
              onRetry={() => void atRiskQ.refetch()}
            />
          ) : (
          <ParityTable
            rows={rows}
            columns={columns}
            rowKey={(row) => `${row.unit_uuid}-${row.tire_position}`}
            loading={atRiskQ.isLoading}
            storageKey="maintenance-tire-wear-at-risk"
            emptyText="No tires projected for replacement within 30 days."
            exportFilename="tire-wear-at-risk"
          />
          )}
        </div>
      </section>
    </div>
  );
}
