import { useQuery } from "@tanstack/react-query";
import { listDriverVendorMerges } from "../../api/data-infra";
import { formatDateUS } from "../../lib/formatDate";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../shared/EntityLink";

// LINK-F5171/LINK-F5183 — factoring:home.vendor_merges reverse gap, driver side. driver_id is a
// real FK on mdata.driver_vendor_merges with a pre-built index
// (idx_driver_vendor_merges_driver_recent) that was never used as a query filter -- the driver's
// own profile had zero factoring/vendor-merge references despite the index existing specifically
// for this filter.
// LINK-F5171 janitor: Open queue uses EntityLink filtered kind (not bare Link).
export function DriverVendorMergesReverseSection({
  operatingCompanyId,
  driverId,
  "data-testid": dataTestId,
}: {
  operatingCompanyId: string;
  driverId: string;
  "data-testid"?: string;
}) {
  const query = useQuery({
    queryKey: ["driver-vendor-merges-reverse", operatingCompanyId, driverId],
    queryFn: () => listDriverVendorMerges(operatingCompanyId, { driver_id: driverId }).then((r) => r.rows),
    enabled: Boolean(operatingCompanyId && driverId),
  });
  const merges = query.data ?? [];

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid={dataTestId ?? "driver-vendor-merges-reverse"}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Vendor merges</h2>
        <EntityLink
          kind="factoring_vendor_merges_driver"
          id={driverId}
          label="Open queue"
          className="text-xs font-semibold text-slate-700 hover:underline"
        />
      </div>
      {query.isError ? <p className="mt-2 text-xs text-red-700">Vendor merges unavailable.</p> : null}
      {query.isLoading ? <p className="mt-2 text-xs text-gray-500">Loading…</p> : null}
      {!query.isLoading && !query.isError && merges.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">No vendor merges for this driver.</p>
      ) : null}
      {merges.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {merges.slice(0, 5).map((m) => (
            <li key={m.id}>
              <EntityLink
                kind="factoring_vendor_merges_driver"
                id={driverId}
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
