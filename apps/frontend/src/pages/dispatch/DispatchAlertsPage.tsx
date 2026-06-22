import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { cashAdvanceRequestsOfficeApi } from "../../api/cashAdvanceRequests";
import { listLateArrivalDispatchLoads } from "../../api/dispatch";
import { getIntransitTriageQueue } from "../../api/maintenance";
import { getSafetyAccidents } from "../../api/safety";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";

function formatCount(n: number | null): string {
  if (n === null) return "—";
  return String(n);
}

function openAccidentsCount(rows: Array<Record<string, unknown>>): number | null {
  if (rows.length === 0) return 0;
  const sample = rows[0]!;
  const hasAnySignal =
    "status" in sample || "resolved_at" in sample || "closed_at" in sample || "resolution" in sample || "is_closed" in sample;
  if (!hasAnySignal) return null;
  return rows.filter((r) => {
    if (r.resolved_at || r.closed_at || r.is_closed === true) return false;
    const st = String(r.status ?? "").toLowerCase();
    if (st === "closed" || st === "resolved") return false;
    return true;
  }).length;
}

export function DispatchAlertsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [accidentsQ, cashQ, lateQ, intransitQ] = useQueries({
    queries: [
      {
        queryKey: ["dispatch-alerts", "accidents", companyId],
        queryFn: () => getSafetyAccidents(companyId),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["dispatch-alerts", "cash-advances", companyId],
        queryFn: () => cashAdvanceRequestsOfficeApi.list(companyId, "pending"),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["dispatch-alerts", "late-arrivals", companyId],
        queryFn: () => listLateArrivalDispatchLoads(companyId),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["dispatch-alerts", "intransit", companyId],
        queryFn: () => getIntransitTriageQueue(companyId),
        enabled: Boolean(companyId),
      },
    ],
  });

  const accidentCount =
    !companyId || accidentsQ.isLoading ? null : accidentsQ.isError ? null : openAccidentsCount(accidentsQ.data?.accidents ?? []);

  const cashCount =
    !companyId || cashQ.isLoading ? null : cashQ.isError ? null : (cashQ.data?.requests.length ?? null);

  const lateCount =
    !companyId || lateQ.isLoading ? null : lateQ.isError ? null : (lateQ.data?.count ?? null);

  const intransitCount =
    !companyId || intransitQ.isLoading ? null : intransitQ.isError ? null : (intransitQ.data?.issues.length ?? null);

  const cards = [
    {
      title: "Accidents (open)",
      count: accidentCount,
      to: "/safety",
      subtitle: "Safety · accident reports",
    },
    {
      title: "Cash advance requests",
      count: cashCount,
      to: "/driver-finance/cash-advance-requests",
      subtitle: "Pending office review",
    },
    {
      title: "Late arrivals",
      count: lateCount,
      to: "/dispatch/alerts/late-arrivals",
      subtitle: "ETA past schedule + grace · drill-down list",
    },
    {
      title: "In-transit issues",
      count: intransitCount,
      to: "/maintenance",
      subtitle: "Maintenance in-transit triage queue",
    },
  ] as const;

  return (
    <div className="space-y-4" data-testid="dispatch-alerts-page">
      <PageHeader title="Dispatch alerts" subtitle="Live counts where endpoints exist · placeholders show —" />
      {!companyId ? <p className="text-sm text-amber-800">Select an operating company to load counts.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.title}
            to={c.to}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{c.title}</div>
            <div className="mt-2 text-3xl font-bold tabular-nums text-gray-900">{formatCount(c.count)}</div>
            <p className="mt-1 text-xs text-gray-600">{c.subtitle}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
