import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../auth/useAuth";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { getCurrentCsaScore, listCsaScores, pullCsaFromSafer, recomputeCsa } from "../../../api/safetyV64";

type BasicRow = {
  label: string;
  value: number | null;
  threshold: number;
};

function severityColor(value: number | null) {
  if (value == null) return "text-slate-400";
  if (value < 65) return "text-emerald-700";
  if (value < 80) return "text-amber-700";
  return "text-red-700";
}

export function CSAScoreTab() {
  const { selectedCompanyId } = useCompanyContext();
  const auth = useAuth();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const isOwner = auth.user?.role === "Owner";
  const [period, setPeriod] = useState("rolling-24");

  const currentQuery = useQuery({
    queryKey: ["safety-v64", "csa-current", companyId],
    queryFn: () => getCurrentCsaScore(companyId),
    enabled: Boolean(companyId),
  });

  const historyQuery = useQuery({
    queryKey: ["safety-v64", "csa-history", companyId],
    queryFn: () => listCsaScores(companyId),
    enabled: Boolean(companyId),
  });

  const recomputeMutation = useMutation({
    mutationFn: () => recomputeCsa(companyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "csa-current", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "csa-history", companyId] });
    },
  });

  const saferMutation = useMutation({
    mutationFn: () => pullCsaFromSafer(companyId),
  });

  const current = currentQuery.data?.current ?? null;
  const basics = useMemo<BasicRow[]>(
    () => [
      { label: "Unsafe Driving", value: Number(current?.basic_unsafe_driving ?? 0), threshold: 65 },
      { label: "HOS Compliance", value: Number(current?.basic_hos_compliance ?? 0), threshold: 65 },
      { label: "Driver Fitness", value: Number(current?.basic_driver_fitness ?? 0), threshold: 80 },
      { label: "Controlled Substances", value: Number(current?.basic_controlled_substances ?? 0), threshold: 80 },
      { label: "Vehicle Maintenance", value: Number(current?.basic_vehicle_maintenance ?? 0), threshold: 80 },
      { label: "Crash Indicator", value: Number(current?.basic_crash_indicator ?? 0), threshold: 65 },
      { label: "Hazmat", value: null, threshold: 0 },
    ],
    [current]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white p-3">
        <select className="rounded border border-gray-300 px-2 py-1 text-xs" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="rolling-24">Rolling 24-month</option>
          <option value="custom">Custom range</option>
        </select>
        <button type="button" className="rounded bg-[#1f2a44] px-3 py-1 text-xs font-semibold text-white disabled:opacity-60" disabled={!isOwner || recomputeMutation.isPending} onClick={() => recomputeMutation.mutate()}>
          Manual recompute
        </button>
        <button type="button" className="rounded border border-gray-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60" disabled={saferMutation.isPending} onClick={() => saferMutation.mutate()}>
          Pull from FMCSA SAFER
        </button>
        {saferMutation.isError ? <span className="text-xs text-amber-700">FMCSA SAFER pull returns 501 (Phase 6 stub).</span> : null}
      </div>

      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-2">
        {basics.map((basic) => (
          <div key={basic.label} className="rounded border border-gray-100 bg-gray-50 p-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">{basic.label}</span>
              <span className={`font-semibold ${severityColor(basic.value)}`}>
                {basic.value == null ? "-" : basic.value.toFixed(2)}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Threshold {basic.value == null ? "-" : basic.threshold} · Severity{" "}
              <span className={severityColor(basic.value)}>
                {basic.value == null ? "N/A" : basic.value < 65 ? "green" : basic.value < 80 ? "yellow" : "red"}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Period Start</th>
              <th className="px-2 py-1 text-left">Period End</th>
              <th className="px-2 py-1 text-left">Total Violations</th>
              <th className="px-2 py-1 text-left">Total OOS</th>
              <th className="px-2 py-1 text-left">Computed By</th>
            </tr>
          </thead>
          <tbody>
            {(historyQuery.data?.csa_scores ?? []).map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100">
                <td className="px-2 py-1">{String(row.period_start ?? "").slice(0, 10)}</td>
                <td className="px-2 py-1">{String(row.period_end ?? "").slice(0, 10)}</td>
                <td className="px-2 py-1">{String(row.total_violations ?? "0")}</td>
                <td className="px-2 py-1">{String(row.total_oos ?? "0")}</td>
                <td className="px-2 py-1">{String(row.computed_by ?? "-")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
