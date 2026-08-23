import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { fetchRenditions } from "../../api/property-tax";
import { formatDateUS } from "../../lib/formatDate";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorState } from "../ListErrorState";

type Form2290Filing = {
  id: string;
  tax_period_start: string;
  tax_period_end: string;
  filing_status: string;
};

export function UnitTaxFilingsReverseSection({ operatingCompanyId, unitId }: { operatingCompanyId: string; unitId: string }) {
  const propertyTaxQ = useQuery({
    queryKey: ["unit-property-tax-renditions", operatingCompanyId, unitId],
    queryFn: () => fetchRenditions(operatingCompanyId, unitId),
    enabled: Boolean(operatingCompanyId && unitId),
  });
  const form2290Q = useQuery({
    queryKey: ["unit-form-2290-filings", operatingCompanyId, unitId],
    queryFn: () =>
      apiRequest<{ filings: Form2290Filing[] }>(
        `/api/v1/compliance/form-2290?operating_company_id=${encodeURIComponent(operatingCompanyId)}&unit_id=${encodeURIComponent(unitId)}`
      ),
    enabled: Boolean(operatingCompanyId && unitId),
  });

  const renditions = propertyTaxQ.data?.renditions ?? [];
  const filings = form2290Q.data?.filings ?? [];

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="unit-tax-filings-reverse">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Tax filings</h3>
        <EntityLink
          kind="property_tax_unit"
          id={unitId}
          label="All property-tax renditions"
          className="text-xs text-slate-700 hover:underline"
        />
      </div>
      {propertyTaxQ.isError || form2290Q.isError ? (
        <ListErrorState
          title="Couldn't load tax filing history"
          status={0}
          message={(propertyTaxQ.error as Error | null)?.message ?? (form2290Q.error as Error | null)?.message}
          onRetry={() => void Promise.all([propertyTaxQ.refetch(), form2290Q.refetch()])}
        />
      ) : null}
      {!propertyTaxQ.isLoading && !form2290Q.isLoading && !propertyTaxQ.isError && !form2290Q.isError && renditions.length === 0 && filings.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">No property-tax or Form 2290 filings reference this unit.</p>
      ) : null}
      <div className="mt-2 space-y-1 text-xs">
        {renditions.map((rendition) => (
          <div key={`property-${rendition.id}`}>
            <EntityLink
              className="font-medium text-slate-700 hover:underline"
              kind="property_tax_rendition"
              id={rendition.id}
              label={`${rendition.tax_year} property-tax rendition — ${rendition.county}`}
            />{" "}
            <span className="text-slate-500">({rendition.status})</span>
          </div>
        ))}
        {filings.map((filing) => (
          <div key={`2290-${filing.id}`}>
            <EntityLink
              className="font-medium text-slate-700 hover:underline"
              kind="form_2290_filing"
              id={filing.id}
              label={`Form 2290 ${formatDateUS(filing.tax_period_start)}–${formatDateUS(filing.tax_period_end)}`}
            />{" "}
            <span className="text-slate-500">({filing.filing_status})</span>
          </div>
        ))}
      </div>
    </section>
  );
}
