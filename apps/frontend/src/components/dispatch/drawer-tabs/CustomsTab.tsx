import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EntityLink } from "../../shared/EntityLink";
import { apiRequest } from "../../../api/client";
import { formatDateUS } from "../../../lib/formatDate";
import { ListErrorBanner } from "../../shared/ListErrorBanner";
import { entityLabel } from "../../../lib/entity-label";
import { Combobox } from "../../Combobox";
import { fetchCustomsBrokers } from "../../border-crossing/borderCrossingApi";

type Props = { loadId: string; operatingCompanyId: string; canEdit: boolean };

type Crossing = { id: string; planned_crossing_date: string | null; crossing_date: string; port_of_entry: string; direction: string; emanifest_reference: string | null };

export function CustomsTab({ loadId, operatingCompanyId }: Props) {
  const [brokerId, setBrokerId] = useState<string | null>(null);
  const brokersQuery = useQuery({
    queryKey: ["border-crossing", "customs-brokers", operatingCompanyId],
    queryFn: () => fetchCustomsBrokers(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    staleTime: 120_000,
  });
  const brokerOptions = (brokersQuery.data ?? []).map((b) => ({ value: b.id, label: b.name }));
  const query = useQuery({
    queryKey: ["border-crossing", "history", "load", operatingCompanyId, loadId, brokerId],
    queryFn: () => {
      const params = new URLSearchParams({ operating_company_id: operatingCompanyId, load_id: loadId });
      if (brokerId) params.set("customs_broker_id", brokerId);
      return apiRequest<{ crossings: Crossing[] }>(`/api/v1/border-crossing/history?${params.toString()}`);
    },
    enabled: Boolean(loadId && operatingCompanyId),
  });
  const rows = query.data?.crossings ?? [];
  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="load-detail-border-crossings">
      <h3 className="text-sm font-semibold text-slate-900">Customs &amp; border crossings{rows.length ? ` (${rows.length})` : ""}</h3>
      <div className="max-w-xs text-sm" data-testid="load-detail-customs-broker-filter">
        <label htmlFor="load-detail-customs-broker-filter-input" className="text-xs text-gray-500">
          Filter by customs broker
        </label>
        <Combobox
          id="load-detail-customs-broker-filter-input"
          className="mt-1"
          options={brokerOptions}
          value={brokerId}
          onChange={setBrokerId}
          placeholder="All brokers"
          loading={brokersQuery.isLoading}
          disabled={brokersQuery.isError}
          allowClear
        />
      </div>
      {brokersQuery.isError ? (
        <ListErrorBanner
          message="Couldn't load customs brokers for this company."
          onRetry={() => void brokersQuery.refetch()}
        />
      ) : null}
      {query.isError ? <ListErrorBanner message="Couldn't load border crossings for this load." onRetry={() => void query.refetch()} /> : null}
      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? <p className="text-sm text-gray-500">No completed border crossings linked to this load.</p> : null}
      {rows.map((row) => (
        <div key={row.id} className="px-2 py-1.5 text-sm">
          <EntityLink
            kind="border_crossing"
            id={row.id}
            label={entityLabel(row.port_of_entry, row.id, "Border crossing")}
            className="font-semibold text-slate-700 underline"
          />
          <span className="ml-2 text-xs text-gray-600">{row.direction} · {formatDateUS(row.planned_crossing_date ?? row.crossing_date)} · {row.emanifest_reference ?? "eManifest pending"}</span>
        </div>
      ))}
    </section>
  );
}
