import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDateUS } from "../../../lib/formatDate";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../auth/useAuth";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { getCurrentCsaScore, listCsaScores, pullCsaFromSafer, recomputeCsa } from "../../../api/safetyV64";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

type BasicRow = {
  label: string;
  value: number | null;
  availability: "internal_rollup" | "authenticated_sms_required";
};

type CsaScoreRow = Record<string, unknown>;

function toNullableNumber(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
      { label: "Unsafe Driving", value: toNullableNumber(current?.basic_unsafe_driving), availability: "internal_rollup" },
      { label: "HOS Compliance", value: toNullableNumber(current?.basic_hos_compliance), availability: "internal_rollup" },
      { label: "Driver Fitness", value: toNullableNumber(current?.basic_driver_fitness), availability: "internal_rollup" },
      { label: "Controlled Substances", value: toNullableNumber(current?.basic_controlled_substances), availability: "internal_rollup" },
      { label: "Vehicle Maintenance", value: toNullableNumber(current?.basic_vehicle_maintenance), availability: "internal_rollup" },
      { label: "Crash Indicator", value: toNullableNumber(current?.basic_crash_indicator), availability: "internal_rollup" },
      { label: "Hazmat", value: null, availability: "authenticated_sms_required" },
    ],
    [current]
  );

  const historyColumns = useMemo<Array<ParityColumn<CsaScoreRow>>>(
    () => [
      { key: "period_start", label: "Period Start", sortable: true, render: (row) => formatDateUS(row.period_start) },
      { key: "period_end", label: "Period End", sortable: true, render: (row) => formatDateUS(row.period_end) },
      {
        key: "total_violations",
        label: "Internal Inspection Points",
        sortable: true,
        render: (row) => String(row.total_violations ?? "Unavailable"),
      },
      { key: "total_oos", label: "Total OOS", sortable: true, render: (row) => String(row.total_oos ?? "Unavailable") },
      { key: "computed_by", label: "Computed By", sortable: true, render: (row) => String(row.computed_by ?? "-") },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-gray-200 bg-white p-3">
        <SelectCombobox className="rounded-sm border border-gray-300 px-2 py-1 text-xs" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="rolling-24">Rolling 24-month</option>
          <option value="custom">Custom range</option>
        </SelectCombobox>
        <button type="button" className="rounded-sm bg-[#1f2a44] px-3 py-1 text-xs font-semibold text-white disabled:opacity-60" disabled={!isOwner || recomputeMutation.isPending} onClick={() => recomputeMutation.mutate()}>
          Manual recompute
        </button>
        <button type="button" className="rounded-sm border border-gray-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60" disabled={saferMutation.isPending} onClick={() => saferMutation.mutate()}>
          Check public SAFER availability
        </button>
        {saferMutation.isError ? (
          <span className="text-xs text-slate-700">
            Public SAFER is not authoritative for Hazmat BASIC. Authenticated carrier SMS access is required.
          </span>
        ) : null}
        <Link to="/safety/csa-fmcsa-trend" className="ml-auto text-xs font-semibold text-slate-700 underline">
          View FMCSA live trend &amp; projections &rarr;
        </Link>
      </div>

      <div className="rounded-sm border border-gray-200 bg-slate-50 p-3 text-xs text-slate-700">
        Values below are IH35 internal inspection-point rollups from <code>safety.csa_scores</code>. They are not
        FMCSA BASIC measures or percentiles. Missing values remain unavailable and are never displayed as zero.
      </div>

      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-2">
        {basics.map((basic) => (
          <div key={basic.label} className="rounded-sm border border-gray-100 bg-gray-50 p-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">{basic.label}</span>
              <span className="font-semibold text-slate-700">
                {basic.value == null ? "-" : Number(basic.value).toFixed(2)}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {basic.availability === "authenticated_sms_required"
                ? "Unavailable from public SAFER; authenticated carrier SMS required"
                : "Internal inspection points · not an FMCSA percentile"}
            </div>
          </div>
        ))}
      </div>

      <ParityTable<CsaScoreRow>
        columns={historyColumns}
        rows={historyQuery.data?.csa_scores ?? []}
        rowKey={(row) => String(row.id)}
        loading={historyQuery.isLoading}
        emptyText="No CSA score history found."
        storageKey="safety-csa-history"
        exportFilename="csa-score-history"
      />
    </div>
  );
}
