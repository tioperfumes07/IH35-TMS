import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { legalContractsApi } from "../../api/legal-contracts";
import { ListErrorState } from "../ListErrorState";

export function VendorLegalContractsReverseSection({ operatingCompanyId, vendorId }: { operatingCompanyId: string; vendorId: string }) {
  const query = useQuery({
    queryKey: ["legal", "contracts", "vendor", operatingCompanyId, vendorId],
    enabled: Boolean(operatingCompanyId && vendorId),
    queryFn: () => legalContractsApi.list({ operating_company_id: operatingCompanyId, signer_type: "vendor", signer_entity_id: vendorId }),
  });
  const rows = query.data?.contracts ?? [];

  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="vendor-legal-contracts-reverse">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Legal Contracts{rows.length ? ` (${rows.length})` : ""}</h3>
        <Link className="text-xs font-semibold text-slate-700 underline" to={`/legal/contracts?signer_type=vendor&signer_entity_id=${encodeURIComponent(vendorId)}`}>Open Contracts</Link>
      </div>
      {query.isLoading ? <p className="text-sm text-gray-500">Loading legal contracts…</p> : null}
      {query.isError ? <ListErrorState title="Couldn't load this vendor's legal contracts" status={0} message={(query.error as Error)?.message} onRetry={() => void query.refetch()} /> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? <p className="text-sm text-gray-500">No legal contracts are linked to this vendor.</p> : null}
      {rows.length ? <ul className="space-y-2">{rows.map((contract) => (
        <li key={contract.id} className="rounded-sm border border-gray-200 p-2 text-xs">
          <Link className="font-semibold text-slate-700 underline" to={`/legal/contracts?contract_id=${contract.id}`}>{contract.display_name_en ?? contract.template_code}</Link>
          <div className="text-gray-500">{contract.status} · {contract.signer_name}</div>
        </li>
      ))}</ul> : null}
    </section>
  );
}
