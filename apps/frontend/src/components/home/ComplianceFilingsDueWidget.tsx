/**
 * Compact "Filings / Compliance Due" home widget — links to the full Compliance & Filings dashboard
 * (owner decision 2026-07-05, memory `compliance-taxes-permits-module-org`: "it should all be visible
 * in ONE page as well, maybe home page ... show all those pending"). Additive: one more card in the
 * existing home stack, doesn't touch any other widget.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchFilingsDashboard } from "../../api/compliance";
import { formatDateUS } from "../../lib/formatDate";

type Props = {
  operatingCompanyId: string | null;
};

export function ComplianceFilingsDueWidget({ operatingCompanyId }: Props) {
  const cid = operatingCompanyId ?? "";
  const dashboardQ = useQuery({
    queryKey: ["home", "compliance-filings-due", cid],
    queryFn: () => fetchFilingsDashboard(cid),
    enabled: Boolean(cid),
    refetchInterval: 15 * 60 * 1000,
  });

  const counts = dashboardQ.data?.counts ?? { overdue: 0, due: 0, upcoming: 0, not_yet_tracked: 0 };
  const pendingCount = counts.overdue + counts.due;
  const nextItems = (dashboardQ.data?.items ?? [])
    .filter((i) => i.status === "overdue" || i.status === "due")
    .slice(0, 4);

  if (!cid) return null;

  return (
    <section className="rounded-sm border border-slate-200 bg-white" aria-label="Filings and compliance due" data-testid="home-compliance-filings-widget">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Filings / Compliance Due</h2>
        <Link to="/compliance" className="text-xs font-semibold text-slate-700 underline">
          Open full dashboard
        </Link>
      </div>
      <div className="p-3">
        {dashboardQ.isLoading ? (
          <div className="h-16 animate-pulse rounded-sm bg-slate-100" />
        ) : (
          <>
            <div className="flex items-center gap-4">
              <div>
                <div className={`text-2xl font-semibold ${pendingCount > 0 ? "text-red-700" : "text-[#1f2a44]"}`}>
                  {pendingCount}
                </div>
                <div className="text-[11px] text-slate-500">overdue + due soon</div>
              </div>
              <div className="text-xs text-slate-500">
                {counts.overdue} overdue · {counts.due} due soon · {counts.upcoming} upcoming
              </div>
            </div>
            {nextItems.length > 0 ? (
              <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs">
                {nextItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{item.program}</span>
                    <span className="shrink-0 text-slate-500">{item.due_date ? formatDateUS(item.due_date) : "—"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Nothing overdue or due soon.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
