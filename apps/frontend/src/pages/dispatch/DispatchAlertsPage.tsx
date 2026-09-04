import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { cashAdvanceRequestsOfficeApi } from "../../api/cashAdvanceRequests";
import { listLateArrivalDispatchLoads } from "../../api/dispatch";
import { getIntransitTriageQueue } from "../../api/maintenance";
import { getSafetyAccidents } from "../../api/safety";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";

function formatCount(n: number | null, isError: boolean): string {
  if (isError) return "Error";
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

  const anyQueryError = Boolean(companyId) && [accidentsQ, cashQ, lateQ, intransitQ].some((q) => q.isError);

  const accidentCount =
    !companyId || accidentsQ.isLoading || accidentsQ.isError ? null : openAccidentsCount(accidentsQ.data?.accidents ?? []);

  const cashCount =
    !companyId || cashQ.isLoading || cashQ.isError ? null : (cashQ.data?.requests?.length ?? null);

  const lateCount = !companyId || lateQ.isLoading || lateQ.isError ? null : (lateQ.data?.count ?? null);

  const intransitCount =
    !companyId || intransitQ.isLoading || intransitQ.isError ? null : (intransitQ.data?.issues?.length ?? null);

  const anyLoading = Boolean(companyId) && [accidentsQ, cashQ, lateQ, intransitQ].some((q) => q.isLoading);
  const allCountsKnownZero =
    Boolean(companyId) &&
    !anyLoading &&
    !anyQueryError &&
    accidentCount === 0 &&
    cashCount === 0 &&
    lateCount === 0 &&
    intransitCount === 0;

  const cards = [
    {
      title: "Accidents (open)",
      count: accidentCount,
      isError: accidentsQ.isError,
      to: "/safety",
      subtitle: "Safety · accident reports",
    },
    {
      title: "Cash advance requests",
      count: cashCount,
      isError: cashQ.isError,
      to: "/driver-finance/cash-advance-requests",
      subtitle: "Pending office review",
    },
    {
      title: "Late arrivals",
      count: lateCount,
      isError: lateQ.isError,
      to: "/dispatch/alerts/late-arrivals",
      subtitle: "ETA past schedule + grace · drill-down list",
    },
    {
      title: "In-transit issues",
      count: intransitCount,
      isError: intransitQ.isError,
      to: "/maintenance",
      subtitle: "Maintenance in-transit triage queue",
    },
  ] as const;

  return (
    <div className="space-y-4" data-testid="dispatch-alerts-page">
      <PageHeader title="Dispatch alerts" subtitle="Live counts where endpoints exist · placeholders show —" />
      {!companyId ? <p className="text-xs text-slate-700">Select an operating company to load counts.</p> : null}
      {anyQueryError ? (
        <ListErrorBanner
          message="Failed to load one or more dispatch alert counts. Retry or switch operating company."
          onRetry={() => {
            void accidentsQ.refetch();
            void cashQ.refetch();
            void lateQ.refetch();
            void intransitQ.refetch();
          }}
        />
      ) : null}
      {allCountsKnownZero ? (
        <p className="rounded-sm border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="dispatch-alerts-honest-empty">
          No open dispatch alerts for this company. Cards stay at 0 until open accidents, pending cash-advance
          requests, late arrivals, or in-transit triage issues exist for the active entity.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.title}
            to={c.to}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-xs transition hover:border-slate-300 hover:shadow-sm"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{c.title}</div>
            <div
              className={`mt-2 text-page-title font-bold tabular-nums ${c.isError ? "text-red-700" : "text-gray-900"}`}
            >
              {formatCount(c.count, c.isError)}
            </div>
            <p className="mt-1 text-xs text-gray-600">{c.subtitle}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
