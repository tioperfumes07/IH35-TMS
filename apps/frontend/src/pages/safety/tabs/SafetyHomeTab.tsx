import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { getLatestCsa, getSafetyAccidents, getSafetyEventKpis, getSafetyKpis } from "../../../api/safety";
import { SAFETY_GROUPS } from "../../../components/safety/SAFETY_TABS_CONFIG";

// S-11: Safety previously had no dedicated landing dashboard — `/safety` redirected straight into the
// "Incidents & Claims" tab, with no company-wide aggregate view. This is the missing home page.
// Every number here reads an EXISTING endpoint already consumed elsewhere in Safety (events-log kpis,
// dashboard kpis, latest CSA cache, accidents list) — no new backend route, no fabricated data. A query
// that errors renders an explicit "Unavailable" state, never a fake 0.

function KpiTile({
  label,
  value,
  isError,
  isLoading,
}: {
  label: string;
  value: number | string;
  isError?: boolean;
  isLoading?: boolean;
}) {
  return (
    <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      {isError ? (
        <div className="text-sm font-semibold text-red-600" data-testid="safety-home-kpi-error">
          Unavailable
        </div>
      ) : isLoading ? (
        <div className="text-sm text-slate-400">Loading…</div>
      ) : (
        <div className="text-xl font-semibold text-slate-900">{value}</div>
      )}
    </div>
  );
}

export function SafetyHomeTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const kpisQuery = useQuery({
    queryKey: ["safety", "kpis", companyId],
    queryFn: () => getSafetyKpis(companyId),
    enabled: Boolean(companyId),
  });
  const eventKpisQuery = useQuery({
    queryKey: ["safety", "events-v2", "kpis", companyId],
    queryFn: () => getSafetyEventKpis(companyId).then((result) => result.kpis),
    enabled: Boolean(companyId),
  });
  const csaQuery = useQuery({
    queryKey: ["safety", "csa", "latest", companyId],
    queryFn: () => getLatestCsa(companyId),
    enabled: Boolean(companyId),
  });
  const accidentsQuery = useQuery({
    queryKey: ["safety", "accidents", companyId],
    queryFn: () => getSafetyAccidents(companyId),
    enabled: Boolean(companyId),
  });

  if (!companyId) {
    return (
      <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-slate-600">
        Select an operating company to view the Safety dashboard.
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="safety-home">
      <div className="rounded-sm border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Safety Overview</h3>
        <p className="mt-1 text-xs text-slate-500">
          Company-wide aggregate across events, accidents, CSA, fines, and open liabilities.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile
          label="Total Safety Events"
          value={Number(eventKpisQuery.data?.total ?? 0)}
          isError={eventKpisQuery.isError}
          isLoading={eventKpisQuery.isPending}
        />
        <KpiTile
          label="Open Safety Events"
          value={Number(eventKpisQuery.data?.open_count ?? 0)}
          isError={eventKpisQuery.isError}
          isLoading={eventKpisQuery.isPending}
        />
        <KpiTile
          label="Severe Events"
          value={Number(eventKpisQuery.data?.severe_count ?? 0)}
          isError={eventKpisQuery.isError}
          isLoading={eventKpisQuery.isPending}
        />
        <KpiTile
          label="Accidents on File"
          value={(accidentsQuery.data?.accidents ?? []).length}
          isError={accidentsQuery.isError}
          isLoading={accidentsQuery.isPending}
        />
        <KpiTile
          label="Open Company Violations"
          value={Number((kpisQuery.data as Record<string, unknown> | undefined)?.open_company_violations ?? 0)}
          isError={kpisQuery.isError}
          isLoading={kpisQuery.isPending}
        />
        <KpiTile
          label="Drivers with Open Fines"
          value={Number((kpisQuery.data as Record<string, unknown> | undefined)?.drivers_with_open_fines ?? 0)}
          isError={kpisQuery.isError}
          isLoading={kpisQuery.isPending}
        />
        <KpiTile
          label="Critical Integrity Alerts"
          value={Number((kpisQuery.data as Record<string, unknown> | undefined)?.critical_integrity_alerts ?? 0)}
          isError={kpisQuery.isError}
          isLoading={kpisQuery.isPending}
        />
        <KpiTile
          label="CSA Score (cached)"
          value={Number(csaQuery.data?.latest?.score_total ?? csaQuery.data?.latest?.score ?? 0)}
          isError={csaQuery.isError}
          isLoading={csaQuery.isPending}
        />
      </div>

      <div className="rounded-sm border border-gray-200 bg-white p-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Jump to a Safety area</h4>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {SAFETY_GROUPS.map((group) => (
            <Link
              key={group.id}
              to={group.tabs[0]?.route ?? "/safety/home"}
              className="rounded-sm border border-gray-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {group.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
