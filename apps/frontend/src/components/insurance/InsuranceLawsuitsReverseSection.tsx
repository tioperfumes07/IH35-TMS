import { useQuery } from "@tanstack/react-query";
import { listInsuranceLawsuits } from "../../api/insurance";
import { formatDateUS } from "../../lib/formatDate";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorState } from "../ListErrorState";

export function InsuranceLawsuitsReverseSection({ operatingCompanyId, filter, contextLabel }: {
  operatingCompanyId: string;
  filter: { driver_id?: string; unit_id?: string };
  contextLabel: string;
}) {
  const query = useQuery({
    queryKey: ["insurance-lawsuits-reverse", operatingCompanyId, filter.driver_id ?? null, filter.unit_id ?? null],
    queryFn: () => listInsuranceLawsuits({ operating_company_id: operatingCompanyId, ...filter }),
    enabled: Boolean(operatingCompanyId && (filter.driver_id || filter.unit_id)),
  });
  const rows = query.data?.lawsuits ?? [];
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="insurance-lawsuits-reverse">
      <h3 className="text-sm font-semibold text-slate-900">Insurance lawsuits</h3>
      {query.isError ? <ListErrorState status={0} message="Lawsuits could not be loaded." onRetry={() => void query.refetch()} /> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? <p className="mt-2 text-xs text-slate-500">No lawsuits reference {contextLabel}.</p> : null}
      <div className="mt-2 space-y-1 text-xs">
        {rows.map((row) => (
          <div key={row.id}>
            <EntityLink kind="lawsuit" id={row.id} label={entityLabel(row.case_number, row.id, "Case")} />{" "}
            <span className="text-slate-500">{row.status} · {formatDateUS(row.filed_date)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
