import { useQuery } from "@tanstack/react-query";
import { listFuelCardAssignments } from "../../api/fuel-card-assignments";
import { formatDateUS } from "../../lib/formatDate";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ListErrorBanner } from "../shared/ListErrorBanner";

type Props = {
  operatingCompanyId: string;
  // E-22 — unit -> its fuel cards, and driver -> their fuel cards, the reverse half of the
  // card -> truck registry (Fuel > Cards tab).
  filter: { unit_id: string } | { driver_id: string };
  contextLabel: string;
  "data-testid"?: string;
};

export function FuelCardsReverseSection({
  operatingCompanyId,
  filter,
  contextLabel,
  "data-testid": testId = "fuel-cards-reverse-section",
}: Props) {
  const entityId = "unit_id" in filter ? filter.unit_id : filter.driver_id;
  const query = useQuery({
    queryKey: ["fuel", "card-assignments", "reverse", operatingCompanyId, filter],
    queryFn: () => listFuelCardAssignments(operatingCompanyId, filter),
    enabled: Boolean(operatingCompanyId) && Boolean(entityId),
  });

  const rows = query.isError ? [] : (query.data?.rows ?? []);

  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <h2 className="text-xs font-semibold text-[#0F1219]">Fuel cards{rows.length ? ` (${rows.length})` : ""}</h2>
      {query.isError ? (
        <ListErrorBanner message={`Couldn't load fuel cards for ${contextLabel}.`} onRetry={() => void query.refetch()} />
      ) : null}
      {query.isLoading ? <p className="text-xs text-gray-500">Loading…</p> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? (
        <p className="text-xs text-gray-500">No fuel cards assigned to {contextLabel}.</p>
      ) : null}
      {rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-3 px-2 py-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#1F2A44]">Card …{row.card_last_digits}</span>
            {"unit_id" in filter ? (
              <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" />
            ) : (
              <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" />
            )}
          </div>
          <span className="shrink-0 text-gray-500">
            {formatDateUS(row.effective_from)} – {row.effective_to ? formatDateUS(row.effective_to) : "current"}
            {row.voided_at ? " · voided" : ""}
          </span>
        </div>
      ))}
    </section>
  );
}
