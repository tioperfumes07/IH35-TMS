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
        ) : dashboardQ.isError ? (
          <div className="flex items-center justify-between gap-3 text-xs text-red-700">
            <span>Failed to load filings due — not confirmed "nothing overdue."</span>
            <button
              type="button"
              onClick={() => void dashboardQ.refetch()}
              className="rounded-sm border border-red-300 bg-red-50 px-2 py-1 font-medium hover:bg-red-100"
            >
              Retry
            </button>
          </div>
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
                    {/* DISP-F6480 (GO-2237 item 6): showed only item.program, which is identical
                        across every row of the same filing type (e.g. two real, distinct property-tax
                        renditions -- one per Texas appraisal district -- both read "Texas Business
                        Personal Property Tax Rendition · 04/15/2026" with zero way to tell them apart).
                        The full /compliance dashboard already shows Program + Detail as separate
                        columns; this compact widget silently dropped Detail. item.detail is always a
                        real, distinct, non-empty string for every filing type (verified live: property
                        tax names the appraisal district, Form 2290 names the filing, IFTA names the
                        quarter) -- render it as a muted secondary line, not just the program name. */}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.program}</span>
                      {item.detail ? <span className="block truncate text-slate-400">{item.detail}</span> : null}
                    </span>
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
