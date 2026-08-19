import { useQuery } from "@tanstack/react-query";
import { getSafetyPermits } from "../../api/safety";
import { formatDateUS } from "../../lib/formatDate";
import { ListErrorBanner } from "../shared/ListErrorBanner";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";

type Props = {
  operatingCompanyId: string;
  unitId: string;
  "data-testid"?: string;
};

export function UnitPermitsReverseSection({
  operatingCompanyId,
  unitId,
  "data-testid": testId = "unit-permits-reverse-section",
}: Props) {
  const query = useQuery({
    queryKey: ["safety", "permits", "reverse", operatingCompanyId, unitId],
    queryFn: () => getSafetyPermits(operatingCompanyId, { unit_id: unitId }),
    enabled: Boolean(operatingCompanyId && unitId),
  });
  const permits = query.data?.permits ?? [];

  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Permits</h3>
        <span className="text-xs text-gray-500">{query.isLoading ? "Loading…" : permits.length}</span>
      </div>
      {query.isError ? <ListErrorBanner message="Couldn't load permits for this unit." /> : null}
      {!query.isLoading && !query.isError && permits.length === 0 ? (
        <p className="text-xs text-gray-500">No permits linked to this unit.</p>
      ) : null}
      {permits.map((permit) => {
        const id = permit.id == null ? null : String(permit.id);
        return (
          <div key={id} className="flex items-center justify-between gap-3 px-2 py-1.5 text-xs">
            <EntityLinkOrTombstone
              kind="permit"
              id={id}
              name={permit.permit_number ?? permit.permit_type}
              noun="Permit"
            />
            <span className="text-gray-500">Expires {formatDateUS(String(permit.expiry_date ?? ""))}</span>
          </div>
        );
      })}
    </section>
  );
}
