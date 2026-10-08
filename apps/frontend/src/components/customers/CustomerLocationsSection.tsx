/**
 * ORDERS CUSTOMERS — locations with geocode-precision badge.
 * GET /api/v1/mdata/customers/:id/locations
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { ListErrorState } from "../ListErrorState";
import { GeocodePrecisionBadgeChip } from "./GeocodePrecisionBadge";

export type CustomerStopLocationRow = {
  address: string;
  city: string;
  state: string;
  postal_code: string;
  geocode_precision: string;
  stop_count: number;
  load_count: number;
  sample_stop_id: string | null;
  location_id: string | null;
};

export type CustomerLinkedLocationRow = {
  location_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  geocode_precision: string;
  location_type: string | null;
};

function getCustomerLocations(companyId: string, customerId: string) {
  const q = new URLSearchParams({ operating_company_id: companyId });
  return apiRequest<{
    customer_id: string;
    stop_locations: CustomerStopLocationRow[];
    linked_locations: CustomerLinkedLocationRow[];
  }>(`/api/v1/mdata/customers/${encodeURIComponent(customerId)}/locations?${q.toString()}`);
}

function placeLabel(row: { address?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; name?: string | null }) {
  const line = [row.name, row.address, [row.city, row.state].filter(Boolean).join(", "), row.postal_code]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean);
  return line.join(" · ") || "—";
}

export function CustomerLocationsSection({
  companyId,
  customerId,
}: {
  companyId: string;
  customerId: string;
}) {
  const q = useQuery({
    queryKey: ["customer-locations", companyId, customerId],
    queryFn: () => getCustomerLocations(companyId, customerId),
    enabled: Boolean(companyId && customerId),
  });

  const stops = q.isError ? [] : q.data?.stop_locations ?? [];
  const linked = q.isError ? [] : q.data?.linked_locations ?? [];

  return (
    <section
      className="rounded-sm border border-gray-200 bg-white p-3"
      data-testid="customer-locations-section"
      data-cust-locations="1"
    >
      <h2 className="mb-1 text-xs font-semibold text-[#0F1219]">Locations</h2>
      <p className="mb-2 text-xs text-[#4B5563]">
        Stop places from this customer&apos;s loads, plus linked catalog locations. Locality precision is red — not a
        stop.
      </p>
      {q.isError ? (
        <ListErrorState
          title="Couldn't load customer locations"
          status={0}
          message={(q.error as Error)?.message}
          onRetry={() => void q.refetch()}
        />
      ) : null}
      {q.isLoading ? <p className="text-xs text-[#6B7280]">Loading…</p> : null}

      {!q.isLoading && !q.isError && linked.length > 0 ? (
        <div className="mb-3" data-testid="customer-linked-locations">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#4B5563]">Linked catalog</h3>
          <ul className="divide-y divide-gray-100">
            {linked.map((row) => (
              <li key={row.location_id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs text-[#1F2A44]">
                <span>
                  <span className="font-medium text-[#0F1219]">{row.name || "Location"}</span>
                  {" · "}
                  {placeLabel({ ...row, name: null })}
                </span>
                <GeocodePrecisionBadgeChip precision={row.geocode_precision} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!q.isLoading && !q.isError ? (
        <div data-testid="customer-stop-locations">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#4B5563]">From loads</h3>
          {stops.length === 0 ? (
            <p className="text-xs text-[#6B7280]">No stop locations on loads for this customer yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {stops.map((row, i) => (
                <li
                  key={`${row.city}-${row.state}-${row.address}-${row.geocode_precision}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs text-[#1F2A44]"
                >
                  <span>
                    {placeLabel(row)}
                    <span className="text-[#6B7280]">
                      {" "}
                      · {row.load_count} load{row.load_count === 1 ? "" : "s"} · {row.stop_count} stop
                      {row.stop_count === 1 ? "" : "s"}
                    </span>
                  </span>
                  <GeocodePrecisionBadgeChip precision={row.geocode_precision} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
