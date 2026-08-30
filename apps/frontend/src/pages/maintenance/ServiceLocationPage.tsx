import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { DrillKpiCard } from "../../components/layout/DrillKpiCard";
import { humanizeEnumLabel } from "../../lib/humanizeEnumLabel";

type Props = {
  operatingCompanyId: string;
};

type ServiceLocationRow = {
  service_location: string;
  bucket: string;
  open_work_orders: number;
};

const BUCKET_LABEL: Record<string, string> = {
  in_house: "In-House",
  external: "External",
  roadside: "Roadside",
};

const SERVICE_LOCATION_LABEL: Record<string, string> = {
  in_house: "In-house shop",
  external_shop: "External shop",
  external_tires: "External tire shop",
  roadside: "Roadside",
};

function serviceLocationLabel(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized === "unspecified") return "Unspecified";
  return SERVICE_LOCATION_LABEL[normalized] ?? humanizeEnumLabel(normalized);
}

export function ServiceLocationPage({ operatingCompanyId }: Props) {
  const kpisQuery = useQuery({
    queryKey: ["maintenance", "service-location", "kpis", operatingCompanyId],
    queryFn: () =>
      apiRequest<{
        in_house_count: number;
        external_count: number;
        roadside_count: number;
        unique_locations: number;
      }>(`/api/v1/maintenance/service-location/kpis?operating_company_id=${encodeURIComponent(operatingCompanyId)}`),
    enabled: Boolean(operatingCompanyId),
  });
  const rowsQuery = useQuery({
    queryKey: ["maintenance", "service-location", "rows", operatingCompanyId],
    queryFn: () =>
      apiRequest<{ rows: ServiceLocationRow[] }>(
        `/api/v1/maintenance/service-location/rows?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
      ),
    enabled: Boolean(operatingCompanyId),
  });

  // CLS-MONEY-KPI-FAKE-ZERO: never fabricate in_house_count:0 (etc.) when the KPI fetch failed —
  // DrillKpiCard null → "—" (same class as MaintenanceHome / FactoringHome).
  const kpis = kpisQuery.data;
  const rows = useMemo(() => rowsQuery.data?.rows ?? [], [rowsQuery.data?.rows]);

  // Each row → that location's open WOs (now a real, filtered list — work-orders endpoint honors
  // ?location & ?bucket as of this PR). No dead links.
  const drillTo = (row: ServiceLocationRow) =>
    `/maintenance/active-wos?location=${encodeURIComponent(row.service_location)}${row.bucket ? `&bucket=${encodeURIComponent(row.bucket)}` : ""}`;

  const columns: Array<ParityColumn<ServiceLocationRow>> = [
    {
      key: "service_location",
      label: "Service Location",
      sortable: true,
      render: (row) => (
        <Link to={drillTo(row)} className="text-slate-700 hover:underline">
          {serviceLocationLabel(row.service_location)}
        </Link>
      ),
    },
    { key: "bucket", label: "Bucket", sortable: true, render: (row) => BUCKET_LABEL[row.bucket] ?? row.bucket ?? "in_house" },
    {
      key: "open_work_orders",
      label: "Open Work Orders",
      sortable: true,
      render: (row) => (
        <Link to={drillTo(row)} className="text-slate-700 hover:underline">
          {Number(row.open_work_orders ?? 0)}
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {/* C8: KPI tile → the list it represents (00-MASTER-LINK-MAP). "Locations" is a distinct-count
            over the table already rendered below, so it drills to that tab rather than to a WO filter
            that would not match the figure. */}
        <DrillKpiCard
          label="In-House"
          value={kpisQuery.isError ? null : (kpis?.in_house_count ?? null)}
          to="/maintenance/active-wos?bucket=in_house"
        />
        <DrillKpiCard
          label="External"
          value={kpisQuery.isError ? null : (kpis?.external_count ?? null)}
          to="/maintenance/active-wos?bucket=external"
        />
        <DrillKpiCard
          label="Roadside"
          value={kpisQuery.isError ? null : (kpis?.roadside_count ?? null)}
          to="/maintenance/active-wos?bucket=roadside"
        />
        <DrillKpiCard
          label="Locations"
          value={kpisQuery.isError ? null : (kpis?.unique_locations ?? null)}
          to="/maintenance/service-location"
        />
      </div>

      {kpisQuery.isError ? (
        <ListErrorState
          title="Couldn't load service-location KPIs"
          status={0}
          message={(kpisQuery.error as Error)?.message}
          onRetry={() => void kpisQuery.refetch()}
        />
      ) : null}

      {rowsQuery.isError ? (
        <ListErrorState
          title="Couldn't load service locations"
          status={0}
          message={(rowsQuery.error as Error)?.message}
          onRetry={() => void rowsQuery.refetch()}
        />
      ) : (
        <ParityTable<ServiceLocationRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => `${row.service_location}-${row.bucket}`}
          loading={rowsQuery.isLoading}
          // "will render here" is BUILD-PLACEHOLDER language on a surface that is fully wired: this
          // table has live queries, columns, export and pagination. It reads as "not implemented yet"
          // when the truth is "implemented, nothing open right now" — the same defect class as the PM
          // Countdown saying "No active schedule" for schedules that existed. Every other future-tense
          // empty state in the app names a CONDITION ("once periods are created", "when a driver exceeds
          // FMCSA limits"); that is what makes them informative rather than discouraging. This one had
          // none, so it named no condition and implied absent functionality.
          emptyText="No active work orders. Open work orders are grouped here by service location."
          storageKey="maint-service-location"
          exportFilename="service-location"
        />
      )}
    </div>
  );
}
