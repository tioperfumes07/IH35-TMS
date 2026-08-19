import { useQuery } from "@tanstack/react-query";
import { listDriverVendorMerges } from "../../api/data-infra";
import { formatDateUS } from "../../lib/formatDate";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../shared/EntityLink";

// LINK-F5171/LINK-F5183 — factoring:home.vendor_merges reverse gap, vendor side. Merge rows store
// from_qbo_vendor_id/to_qbo_vendor_id (text QBO ids, not FKs); listDriverVendorMerges now resolves
// them to real internal vendor ids via mdata.vendors.qbo_vendor_id and accepts an optional
// vendor_id filter (LINK-F5183), applied server-side.
// LINK-F5171 janitor: Open queue uses EntityLink filtered kind (not bare Link).
export function VendorMergesReverseSection({ operatingCompanyId, vendorId }: { operatingCompanyId: string; vendorId: string }) {
  const query = useQuery({
    queryKey: ["vendor-merges-reverse", operatingCompanyId, vendorId],
    queryFn: () => listDriverVendorMerges(operatingCompanyId, { vendor_id: vendorId }).then((r) => r.rows),
    enabled: Boolean(operatingCompanyId && vendorId),
  });
  const merges = query.data ?? [];

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="vendor-merges-reverse">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Driver vendor merges</h2>
        <EntityLink
          kind="factoring_vendor_merges_vendor"
          id={vendorId}
          label="Open queue"
          className="text-xs font-semibold text-slate-700 hover:underline"
        />
      </div>
      {query.isError ? <p className="mt-2 text-xs text-red-700">Vendor merges unavailable.</p> : null}
      {query.isLoading ? <p className="mt-2 text-xs text-gray-500">Loading…</p> : null}
      {!query.isLoading && !query.isError && merges.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">No driver vendor merges involving this vendor.</p>
      ) : null}
      {merges.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {merges.slice(0, 5).map((m) => (
            <li key={m.id}>
              <EntityLink
                kind="factoring_vendor_merges_vendor"
                id={vendorId}
                label={`${entityLabel(m.from_vendor_name, m.from_qbo_vendor_id, "Vendor")} → ${entityLabel(m.to_vendor_name, m.to_qbo_vendor_id, "Vendor")} · ${formatDateUS(m.merged_at)}`}
                className="text-xs font-semibold text-slate-700 hover:underline"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
