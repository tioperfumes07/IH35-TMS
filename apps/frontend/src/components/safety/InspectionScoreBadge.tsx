import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";

type CleanRateResponse = {
  clean_rate_percent: number | null;
  total_inspections: number;
  clean_inspections: number;
  trailing_months: number;
};

type Props = {
  companyId: string;
  driverId?: string;
};

function classNameForRate(rate: number | null): string {
  if (rate == null) return "bg-slate-100 text-slate-600 border-slate-200";
  if (rate >= 95) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (rate >= 85) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-red-100 text-red-700 border-red-200";
}

function labelForRate(rate: number | null, total: number): string {
  if (total === 0) return "No inspections (12mo)";
  if (rate == null) return "—";
  return `${rate.toFixed(1)}% clean`;
}

export function InspectionScoreBadge({ companyId, driverId }: Props) {
  const query = useQuery({
    queryKey: ["safety-v64", "dot-inspections", "clean-rate", companyId, driverId ?? "all"],
    queryFn: async () => {
      const qs = new URLSearchParams({ operating_company_id: companyId });
      if (driverId) qs.set("driver_id", driverId);
      return apiRequest<CleanRateResponse>(`/api/v1/safety/dot-inspections/clean-rate?${qs.toString()}`);
    },
    enabled: Boolean(companyId),
  });

  const rate = query.data?.clean_rate_percent ?? null;
  const total = query.data?.total_inspections ?? 0;
  const label = query.isLoading ? "Loading…" : labelForRate(rate, total);

  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${classNameForRate(rate)}`}
      title={`DOT clean inspection rate over trailing ${query.data?.trailing_months ?? 12} months`}
    >
      DOT: {label}
    </span>
  );
}
