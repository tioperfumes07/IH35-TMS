import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getFleetRestoreCost } from "../../api/maintenance";

type Props = {
  operatingCompanyId: string;
};

function money(cents: number) {
  return `$${(Number(cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function HomeFleetRestoreCard({ operatingCompanyId }: Props) {
  const query = useQuery({
    queryKey: ["maintenance", "fleet-restore-cost", operatingCompanyId],
    queryFn: () => getFleetRestoreCost(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const data = query.data?.data;
  if (query.isLoading) {
    return (
      <section className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700" data-testid="home-fleet-restore-card">
        Loading fleet restore cost…
      </section>
    );
  }
  if (query.isError) {
    return (
      <section
        className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700"
        data-testid="home-fleet-restore-card"
        data-fleet-restore-read-error
        role="alert"
      >
        <p>Could not load fleet restore cost.</p>
        <button
          type="button"
          className="mt-2 rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700"
          onClick={() => void query.refetch()}
        >
          Retry restore cost
        </button>
      </section>
    );
  }
  if (!data) return null;
  if (data.unit_count === 0 && data.total_estimated_cents === 0) return null;

  return (
    <section
      className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700"
      data-testid="home-fleet-restore-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fleet Restore Cost</div>
          <div className="mt-1 font-semibold">
            {money(data.total_remaining_cents)} remaining across {data.unit_count} unit{data.unit_count === 1 ? "" : "s"}
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Estimated {money(data.total_estimated_cents)} · Actual {money(data.total_actual_cents)} · Avg open{" "}
            {Math.round(data.avg_days_open)}d
          </p>
        </div>
        <Link
          to="/maintenance/severe-repairs"
          className="shrink-0 rounded-sm bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600"
        >
          View OOS estimates
        </Link>
      </div>
    </section>
  );
}
