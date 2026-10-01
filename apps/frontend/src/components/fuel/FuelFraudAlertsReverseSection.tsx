import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listFuelFraudAlerts, type FuelFraudAlertFilter, type FuelFraudAlertRow } from "../../api/fuel-fraud-alerts";
import { formatDateTimeUS } from "../../lib/formatDate";
import { formatMoneyCents } from "../dispatch/constants";
import { EntityLink } from "../shared/EntityLink";
import { StatusBadge } from "../layout/StatusBadge";
import { ListErrorState } from "../ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";

/**
 * Linkage law §6 (PR #23729) — GAP-61/CAP-11 fraud alerts reach a fuel purchase, but the purchase's
 * own hubs (truck, driver, load, vendor) had no reverse hop to the alerts raised on it. Mirrors the
 * FuelTransactionsReverseSection filter-union convention so one component serves all four entities;
 * badge/label conventions mirror FraudAlertsList.tsx (the office worklist) exactly.
 */
type Filter = FuelFraudAlertFilter;

type Props = {
  operatingCompanyId: string;
  filter: Filter;
  /** Short context phrase, e.g. "this unit" / "this vendor". */
  contextLabel: string;
  "data-testid"?: string;
};

type BadgeVariant = "crit" | "warn" | "info" | "positive" | "neutral";

function alertStatusBadge(status: string): { variant: BadgeVariant; label: string } {
  switch (status) {
    case "open":
      return { variant: "warn", label: "Open" };
    case "investigating":
      return { variant: "info", label: "Investigating" };
    case "dismissed":
      return { variant: "neutral", label: "Dismissed" };
    case "confirmed_fraud":
      return { variant: "crit", label: "Confirmed fraud" };
    case "recovered":
      return { variant: "positive", label: "Recovered" };
    default:
      return { variant: "neutral", label: status.replace(/_/g, " ") };
  }
}

function severityBadge(severity: FuelFraudAlertRow["severity"]): { variant: BadgeVariant; label: string } {
  if (severity === "critical") return { variant: "crit", label: "Critical" };
  if (severity === "warn") return { variant: "warn", label: "Warn" };
  return { variant: "neutral", label: "Info" };
}

function recoveryStatusBadge(status: string | null): { variant: BadgeVariant; label: string } | null {
  if (!status) return null;
  switch (status) {
    case "pending_review":
      return { variant: "warn", label: "Pending review" };
    case "approved":
      return { variant: "info", label: "Approved" };
    case "posted":
      return { variant: "positive", label: "Posted" };
    case "company_variance":
      return { variant: "neutral", label: "Company variance" };
    case "voided":
      return { variant: "crit", label: "Voided" };
    default:
      return { variant: "neutral", label: status.replace(/_/g, " ") };
  }
}

export function FuelFraudAlertsReverseSection({
  operatingCompanyId,
  filter,
  contextLabel,
  "data-testid": testId = "fuel-fraud-alerts-reverse",
}: Props) {
  const filterValue = Object.values(filter)[0] as string;
  const query = useQuery({
    queryKey: ["fuel", "fraud-alerts", "reverse", operatingCompanyId, filter],
    queryFn: () => listFuelFraudAlerts(operatingCompanyId, filter),
    enabled: Boolean(operatingCompanyId) && Boolean(filterValue),
  });
  // A failed refetch can retain the last successful React Query payload — never render that
  // stale payload beside the failure state (same discipline as every sibling reverse section).
  const rows = query.isError ? [] : (query.data?.alerts ?? []);

  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-900">
          Fuel fraud alerts
          {rows.length > 0 ? <span className="ml-2 text-xs font-normal text-gray-600">({rows.length})</span> : null}
        </h3>
        <Link to="/fuel/fraud-alerts" className="text-xs font-semibold text-slate-700 hover:underline">
          Open Fraud Alerts
        </Link>
      </div>
      {query.isLoading ? <p className="text-xs text-gray-500">Loading…</p> : null}
      {query.isError ? (
        <ListErrorState
          title={`Couldn't load fuel fraud alerts for ${contextLabel}`}
          status={0}
          message={userFacingApiError(query.error, "Fraud alerts are unavailable")}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? (
        <p className="text-xs text-gray-500">No fuel fraud alerts for {contextLabel}.</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => {
            const status = alertStatusBadge(row.status);
            const severity = severityBadge(row.severity);
            const recovery = recoveryStatusBadge(row.recovery_status);
            return (
              <li key={row.uuid} className="text-xs text-slate-700" data-testid={`fuel-fraud-alert-${row.uuid}`}>
                {/* rule_id is a fraud-rule code (e.g. VELOCITY_SPIKE), not a foreign key — there is
                    no rule detail page to drill to, so it renders as text, not an EntityLink. */}
                <span className="font-mono font-medium text-slate-900">{`${row.rule_id}`}</span>
                <span className="ml-2 inline-flex items-center gap-1">
                  <StatusBadge variant={severity.variant}>{severity.label}</StatusBadge>
                  <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
                </span>
                <span className="ml-2 text-xs text-gray-500">
                  {formatDateTimeUS(row.detected_at)}
                  {row.total_cost != null ? ` · ${formatMoneyCents(Math.round(row.total_cost * 100), "USD")}` : ""}
                  {recovery && row.recovery_event_id ? (
                    <>
                      {" · "}
                      <EntityLink
                        kind="fuel_card_overage_event"
                        id={row.recovery_event_id}
                        label={<StatusBadge variant={recovery.variant}>{recovery.label}</StatusBadge>}
                        className=""
                      />
                    </>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
