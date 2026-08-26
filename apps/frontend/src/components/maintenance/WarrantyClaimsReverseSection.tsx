import { useQuery } from "@tanstack/react-query";
import { listMaintenanceWarrantyClaims } from "../../api/maintenance";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ListErrorBanner } from "../shared/ListErrorBanner";

type Props = {
  operatingCompanyId: string;
  filter: { work_order_id: string } | { vendor_id: string };
  contextLabel: string;
  "data-testid"?: string;
};

export function WarrantyClaimsReverseSection({ operatingCompanyId, filter, contextLabel, "data-testid": testId = "warranty-claims-reverse" }: Props) {
  const query = useQuery({
    queryKey: ["maintenance", "warranty-claims", "reverse", operatingCompanyId, filter],
    queryFn: () => listMaintenanceWarrantyClaims(operatingCompanyId, filter),
    enabled: Boolean(operatingCompanyId) && Boolean("work_order_id" in filter ? filter.work_order_id : filter.vendor_id),
  });
  const rows = query.isError ? [] : (query.data?.rows ?? []);

  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <h2 className="text-sm font-semibold text-slate-900">Warranty claims</h2>
      {query.isError ? <ListErrorBanner message={`Couldn't load warranty claims for ${contextLabel}.`} onRetry={() => void query.refetch()} /> : null}
      {query.isLoading ? <p className="text-xs text-gray-500">Loading…</p> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? <p className="text-xs text-gray-500">No warranty claims linked to {contextLabel}.</p> : null}
      {rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-3 px-2 py-1.5 text-xs">
          <EntityLinkOrTombstone
            kind="warranty_claim"
            id={row.id}
            name={row.claim_number || row.part_description}
            noun="Warranty claim"
          />
          <span className="text-gray-500">{row.status_label ?? row.status}</span>
        </div>
      ))}
    </section>
  );
}
