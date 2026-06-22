import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

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

// KPI tiles → the filtered Active-WOs list (00-MASTER-LINK-MAP: KPI tile → the list it represents).
function BucketTile({ label, value, bucket }: { label: string; value: number; bucket?: string }) {
  const cls = "rounded border border-gray-200 bg-white px-2 py-1 text-left text-[11px] hover:bg-gray-50";
  const inner = (
    <>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </>
  );
  if (!bucket) return <div className={cls.replace(" hover:bg-gray-50", "")}>{inner}</div>;
  return (
    <Link to={`/maintenance/active-wos?bucket=${encodeURIComponent(bucket)}`} className={cls}>
      {inner}
    </Link>
  );
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

  const kpis = kpisQuery.data ?? { in_house_count: 0, external_count: 0, roadside_count: 0, unique_locations: 0 };
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
          {row.service_location || "unspecified"}
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
        <BucketTile label="In-House" value={kpis.in_house_count} bucket="in_house" />
        <BucketTile label="External" value={kpis.external_count} bucket="external" />
        <BucketTile label="Roadside" value={kpis.roadside_count} bucket="roadside" />
        <BucketTile label="Locations" value={kpis.unique_locations} />
      </div>

      <ParityTable<ServiceLocationRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => `${row.service_location}-${row.bucket}`}
        loading={rowsQuery.isLoading}
        emptyText="Active work orders grouped by service location will render here."
        storageKey="maint-service-location"
        exportFilename="service-location"
      />
    </div>
  );
}
