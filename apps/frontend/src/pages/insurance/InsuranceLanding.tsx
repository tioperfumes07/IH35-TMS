import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getInsuranceSummary, type InsuranceDashboardSummary } from "../../api/insurance";
import { DrillKpiCard, formatKpiValue } from "../../components/layout/DrillKpiCard";
import { ListErrorState } from "../../components/ListErrorState";
import { useCompanyContext } from "../../contexts/CompanyContext";

/**
 * C8: `to` is REQUIRED — every insurance KPI opens the list it counted (five of the six used to be
 * dead clicks; only the coverage-gap tile carried a link, and only while it was alerting).
 * `value` accepts null so a failed summary query renders "—" instead of "0 open lawsuits".
 * The S-01 alert chrome is preserved exactly; the whole alert card is now the link, not just the
 * small "View gap list" line inside it.
 */
type CardProps = {
  label: string;
  value: number | null;
  /** S-01: when true (and value > 0), render this KPI tile in the locked alert state. */
  alert?: boolean;
  actionLabel?: string;
} & ({ to: string; unavailable?: never } | { unavailable: string; to?: never });

function Card(props: CardProps) {
  const { label, value, alert, actionLabel } = props;
  if (props.to === undefined) {
    return <DrillKpiCard size="md" label={label} value={value} unavailable={props.unavailable} />;
  }
  const to = props.to;
  const isAlert = Boolean(alert) && (value ?? 0) > 0;
  if (!isAlert) {
    return <DrillKpiCard size="md" label={label} value={value} to={to} />;
  }
  return (
    <Link
      to={to}
      className="block min-w-0 rounded-sm border border-red-300 bg-red-50 px-3 py-2"
      data-testid="insurance-kpi-alert"
      aria-label={`${label} — view records`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-red-700">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-red-700">{formatKpiValue(value)}</p>
      {actionLabel ? <span className="mt-2 inline-block text-xs font-semibold text-red-700 underline">{actionLabel}</span> : null}
    </Link>
  );
}

export function InsuranceLanding() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  // Single server-side aggregate (replaces the old 6-query / per-unit-coverage fan-out
  // that left the dashboard fragile and showed "Failed to load widgets").
  const summaryQuery = useQuery({
    queryKey: ["insurance", "landing", "summary", companyId],
    enabled: Boolean(companyId),
    queryFn: () => getInsuranceSummary(companyId).then((result) => result.summary),
  });

  if (!companyId) {
    return <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">Select an operating company to view insurance metrics.</div>;
  }

  // C8 · HONEST UI: a failed/absent summary must not render six confident zeroes ("0 open
  // lawsuits" is a legally consequential thing to fabricate). Undefined stays undefined → "—".
  const m = summaryQuery.data;
  const n = (key: keyof InsuranceDashboardSummary): number | null => {
    const raw = m?.[key];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  };

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <header className="min-w-0 rounded-sm border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Insurance Dashboard</h2>
        <p className="mt-1 text-xs text-slate-600">Operational snapshot across policies, COI requests, claims, and lawsuits.</p>
      </header>

      {summaryQuery.isLoading ? <div className="text-sm text-slate-500">Loading insurance dashboard...</div> : null}

      {summaryQuery.isError ? (
        <ListErrorState
          status={0}
          message="Failed to load insurance dashboard widgets."
          onRetry={() => void summaryQuery.refetch()}
        />
      ) : null}

      {!summaryQuery.isError ? <section className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))] [&>*]:min-w-0">
        <Card label="Total active policies" value={n("total_active_policies")} to="/safety/insurance/policies" />
        <Card label="Policies expiring in 30 days" value={n("policies_expiring_30d")} to="/safety/insurance/policies" />
        <Card
          label="Coverage gap count"
          value={n("coverage_gap_count")}
          alert
          actionLabel="View gap list"
          to="/safety/insurance/coverage-gaps"
        />
        {/* COI requests are tracked per customer (Customers → COI tab); there is no company-wide COI
            list to open, so this tile says so rather than dropping the operator on the wrong page. */}
        <Card
          label="Recent COI request count"
          value={n("recent_coi_requests")}
          unavailable="COI requests are tracked per customer — open a customer's COI tab. No company-wide COI list exists yet."
        />
        <Card label="Open claims count" value={n("open_claims")} to="/safety/insurance/claims" />
        <Card label="Open lawsuits count" value={n("open_lawsuits")} to="/safety/insurance/lawsuits" />
      </section> : null}
    </div>
  );
}
