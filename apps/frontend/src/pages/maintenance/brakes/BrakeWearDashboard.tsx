/**
 * Brake Wear Dashboard — GAP-63 / CAP-13
 * At-risk fleet list with replacement projected within 30 days.
 */
import { entityLabel } from "../../../lib/entity-label";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EntityLink } from "../../../components/shared/EntityLink";
import { apiRequest } from "../../../api/client";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { formatDateUS } from "../../../lib/formatDate";
import { ListErrorState } from "../../../components/ListErrorState";

type AxleGroup = "all" | "steer" | "drive";

type AtRiskRow = {
  unit_uuid: string;
  unit_number: string | null;
  brake_position: string;
  threshold_mm: number;
  current_thickness_mm: number | null;
  projected_replacement_date: string | null;
  wear_rate_mm_per_day: number | null;
  axle_group: string;
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
  return apiRequest<AtRiskResponse>(`/api/v1/maintenance/brake-wear/at-risk?${q.toString()}`);
}

export function BrakeWearDashboard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [axleGroup, setAxleGroup] = useState<AxleGroup>("all");
  const withinDays = 30;

  const atRiskQ = useQuery({
    queryKey: ["maintenance", "brake-wear", "at-risk", companyId, withinDays, axleGroup],
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
          <EntityLink kind="unit_brakes_tab" id={row.unit_uuid} label={entityLabel(row.unit_number, row.unit_uuid, "Unit")} className="font-medium text-slate-700 hover:underline" />
        ),
      },
      { key: "brake_position", label: "Position", sortable: true, render: (row) => row.brake_position },
      {
        key: "current_thickness_mm",
        label: "Lining",
        render: (row) => (row.current_thickness_mm != null ? `${row.current_thickness_mm.toFixed(1)} mm` : "—"),
      },
      { key: "threshold_mm", label: "Threshold", render: (row) => `${row.threshold_mm} mm` },
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
    <div className="space-y-4 p-4" data-testid="brake-wear-dashboard">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Brake Wear Predictive Maintenance</h1>
          <p className="text-xs text-gray-600">
            CAP-13 lining projections · DOT minimums 6.4 mm steer · 3.2 mm drive (§393.47)
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-sm border border-gray-200 bg-white p-1">
          {(["all", "steer", "drive"] as const).map((group) => (
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
            {atRiskQ.isError ? "Projection count unavailable" : `${rows.length} brake positions projected for service`}
          </p>
        </div>
        {atRiskQ.isError ? (
          <ListErrorState
            title="Couldn't load brake-wear projections"
            status={0}
            message={(atRiskQ.error as Error)?.message}
            onRetry={() => void atRiskQ.refetch()}
          />
        ) : (
          <ParityTable
            rows={rows}
            columns={columns}
            rowKey={(row) => `${row.unit_uuid}-${row.brake_position}`}
            loading={atRiskQ.isLoading}
            storageKey="maintenance-brake-wear-at-risk"
            emptyText="No brake positions projected for service within 30 days."
            exportFilename="brake-wear-at-risk"
          />
        )}
      </section>
    </div>
  );
}
