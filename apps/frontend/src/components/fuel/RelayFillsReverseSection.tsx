import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listRelayFills } from "../../api/relay-fills";
import { formatDateUS } from "../../lib/formatDate";
import { formatMoneyCents } from "../dispatch/constants";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ListErrorState } from "../ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";

/**
 * Linkage law §6 (PR #23729) — Relay fills (integrations.relay_fuel_transactions) never become
 * fuel.fuel_transactions rows, so a truck or driver page had NO reverse hop to them at all. Shows
 * Relay's own free-text driver/unit alongside whatever this company matched it to, since the two
 * can legitimately disagree (that disagreement is exactly what the unmatched worklist is for).
 */
type Filter = { unit_id: string } | { driver_id: string };

type Props = {
  operatingCompanyId: string;
  filter: Filter;
  /** Short context phrase, e.g. "this unit" / "this driver". */
  contextLabel: string;
  "data-testid"?: string;
};

export function RelayFillsReverseSection({
  operatingCompanyId,
  filter,
  contextLabel,
  "data-testid": testId = "relay-fills-reverse",
}: Props) {
  const entityId = "unit_id" in filter ? filter.unit_id : filter.driver_id;
  const query = useQuery({
    queryKey: ["fuel", "relay-fills", "reverse", operatingCompanyId, filter],
    queryFn: () => listRelayFills(operatingCompanyId, filter),
    enabled: Boolean(operatingCompanyId) && Boolean(entityId),
  });
  const rows = query.isError ? [] : (query.data?.rows ?? []);
  const totalCount = query.isError ? 0 : (query.data?.total_count ?? rows.length);

  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-900">
          Relay fills
          {rows.length > 0 ? <span className="ml-2 text-xs font-normal text-gray-600">({rows.length})</span> : null}
        </h3>
        <Link to="/fuel/relay-unmatched" className="text-xs font-semibold text-slate-700 hover:underline">
          Open Relay — unmatched
        </Link>
      </div>
      {query.isLoading ? <p className="text-xs text-gray-500">Loading…</p> : null}
      {query.isError ? (
        <ListErrorState
          title={`Couldn't load Relay fills for ${contextLabel}`}
          status={0}
          message={userFacingApiError(query.error, "Relay fills are unavailable")}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? (
        <p className="text-xs text-gray-500">No Relay fills linked to {contextLabel}.</p>
      ) : null}
      {totalCount > rows.length ? (
        <p className="text-xs text-slate-500" data-testid="relay-fills-reverse-range">
          Showing {rows.length} of {totalCount}.
        </p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="text-xs text-slate-700" data-testid={`relay-fill-${row.id}`}>
              <span className="font-medium text-slate-900">
                {row.merchant_name || "Relay fill"}
                {row.location_city || row.location_state
                  ? ` — ${[row.location_city, row.location_state].filter(Boolean).join(", ")}`
                  : ""}
              </span>
              <span className="ml-2 text-xs text-gray-500">
                {formatDateUS(row.relay_created_at)}
                {row.fuel_gallons != null ? ` · ${row.fuel_gallons.toLocaleString()} gal diesel` : ""}
                {row.def_gallons != null ? ` · ${row.def_gallons.toLocaleString()} gal DEF` : ""}
                {` · ${formatMoneyCents(row.total_amount_paid_cents, "USD")}`}
                {"unit_id" in filter ? (
                  row.driver_id ? (
                    <>
                      {" · "}
                      <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" />
                    </>
                  ) : (
                    " · Driver unmatched"
                  )
                ) : row.unit_id ? (
                  <>
                    {" · "}
                    <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" />
                  </>
                ) : (
                  " · Unit unmatched"
                )}
                {row.relay_driver_name || row.relay_unit_number ? (
                  <span className="text-gray-400">
                    {" "}
                    (Relay: {[row.relay_driver_name, row.relay_unit_number].filter(Boolean).join(" / ")})
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
