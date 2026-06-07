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
      <section className="rounded border border-amber-200 bg-amber-50/60 px-3 py-3 text-sm text-amber-950" data-testid="home-fleet-restore-card">
        Loading fleet restore cost…
      </section>
    );
  }
  if (query.isError || !data) return null;
  if (data.unit_count === 0 && data.total_estimated_cents === 0) return null;

  return (
    <section
      className="rounded border border-amber-200 bg-amber-50/90 px-3 py-3 text-sm text-amber-950"
      data-testid="home-fleet-restore-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">Fleet Restore Cost</div>
          <div className="mt-1 font-semibold">
            {money(data.total_remaining_cents)} remaining across {data.unit_count} unit{data.unit_count === 1 ? "" : "s"}
          </div>
          <p className="mt-1 text-xs text-amber-900/90">
            Estimated {money(data.total_estimated_cents)} · Actual {money(data.total_actual_cents)} · Avg open{" "}
            {Math.round(data.avg_days_open)}d
          </p>
        </div>
        <Link
          to="/maintenance/severe-repair-oos"
          className="shrink-0 rounded bg-amber-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800"
        >
          View OOS estimates
        </Link>
      </div>
    </section>
  );
}
