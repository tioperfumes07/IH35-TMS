/**
 * Brake Wear Dashboard — GAP-63 / CAP-13
 * At-risk fleet list with replacement projected within 30 days.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../../../api/client";
import { useCompanyContext } from "../../../contexts/CompanyContext";

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

  return (
    <div className="space-y-4 p-4" data-testid="brake-wear-dashboard">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Brake Wear Predictive Maintenance</h1>
          <p className="text-xs text-gray-600">
            CAP-13 lining projections · DOT minimums 6.4 mm steer · 3.2 mm drive (§393.47)
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded border border-gray-200 bg-white p-1">
          {(["all", "steer", "drive"] as const).map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setAxleGroup(group)}
              className={`rounded px-2.5 py-1.5 text-xs font-medium capitalize ${
                axleGroup === group ? "bg-sky-100 text-sky-800" : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {group === "all" ? "All axles" : `${group}s`}
            </button>
          ))}
        </div>
      </div>

      {!companyId ? <p className="text-sm text-red-600">Select operating company.</p> : null}

      <section className="rounded border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-3 py-2">
          <h2 className="text-sm font-semibold text-gray-900">At-risk units (&lt;{withinDays} days)</h2>
          <p className="text-xs text-gray-500">{rows.length} brake positions projected for service</p>
        </div>
        {atRiskQ.isLoading ? <p className="p-3 text-xs text-gray-500">Loading projections...</p> : null}
        <div className="overflow-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50 text-[11px] uppercase text-gray-600">
              <tr>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Position</th>
                <th className="px-3 py-2">Lining</th>
                <th className="px-3 py-2">Threshold</th>
                <th className="px-3 py-2">Projected</th>
                <th className="px-3 py-2">Days</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.unit_uuid}-${row.brake_position}`} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-900">
                    <Link
                      to={`/fleet/units/${row.unit_uuid}?tab=brakes`}
                      className="text-sky-700 hover:underline"
                    >
                      {row.unit_number ?? row.unit_uuid.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{row.brake_position}</td>
                  <td className="px-3 py-2">
                    {row.current_thickness_mm != null ? `${row.current_thickness_mm.toFixed(1)} mm` : "—"}
                  </td>
                  <td className="px-3 py-2">{row.threshold_mm} mm</td>
                  <td className="px-3 py-2">{row.projected_replacement_date ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        (row.days_until_replacement ?? 99) <= 14
                          ? "font-semibold text-red-700"
                          : "text-amber-700"
                      }
                    >
                      {row.days_until_replacement ?? "—"}
                    </span>
                  </td>
                </tr>
              ))}
              {!atRiskQ.isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-gray-500">
                    No brake positions projected for service within {withinDays} days.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
