import { useQuery } from "@tanstack/react-query";
import { listInsurancePolicies } from "../../api/insurance";
import { formatDateUS } from "../../lib/formatDate";
import { ListErrorState } from "../ListErrorState";
import { ApiError } from "../../api/client";
import { EntityLink } from "../shared/EntityLink";
import { insuranceTypeLabel } from "../../lib/insurance-type-label";

export function VendorInsurancePoliciesReverseSection({ operatingCompanyId, vendorId }: { operatingCompanyId: string; vendorId: string }) {
  const query = useQuery({
    queryKey: ["insurance", "reverse", "vendor-policies", operatingCompanyId, vendorId],
    queryFn: () => listInsurancePolicies({ operating_company_id: operatingCompanyId, vendor_id: vendorId }),
    enabled: Boolean(operatingCompanyId && vendorId),
  });
  const rows = query.isError ? [] : (query.data?.policies ?? []);
  return <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="vendor-insurance-policies-reverse">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-slate-900">Insurance Policies{rows.length ? ` (${rows.length})` : ""}</h3>
      <EntityLink kind="insurance_policies_vendor" id={vendorId} label="Open Policies" className="text-xs font-semibold text-slate-700 underline" />
    </div>
    {query.isLoading ? <p className="text-sm text-gray-500">Loading insurance policies…</p> : null}
    {query.isError ? (
      <ListErrorState
        title="Couldn't load this vendor's insurance policies"
        status={query.error instanceof ApiError ? query.error.status : 0}
        message={(query.error as Error)?.message}
        onRetry={() => void query.refetch()}
      />
    ) : null}
    {!query.isLoading && !query.isError && rows.length === 0 ? <p className="text-sm text-gray-500">No active insurance policies are linked to this vendor.</p> : null}
    {rows.length ? <ul className="space-y-2">{rows.map((policy) => <li key={policy.id} className="rounded-sm border border-gray-200 p-2 text-xs">
      <EntityLink kind="insurance_policy" id={policy.id} label={policy.policy_number} className="font-semibold text-slate-700 underline" />
      <div className="text-gray-500">{insuranceTypeLabel(policy.coverage_type, policy.coverage_type_name)} · expires {formatDateUS(policy.expiry_date)}</div>
    </li>)}</ul> : null}
  </section>;
}
