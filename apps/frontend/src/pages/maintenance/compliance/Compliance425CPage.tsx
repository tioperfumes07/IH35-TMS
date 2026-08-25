import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMaintenanceCompliance425cLog } from "../../../api/maintenance";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { PageHeader } from "../../../components/forms/shared/PageHeader";
import { formatDateTimeUS } from "../../../lib/formatDate";

type Compliance425cRow = Record<string, unknown>;

export function Compliance425CPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const listQ = useQuery({
    queryKey: ["maintenance", "compliance-425c", companyId],
    queryFn: () => listMaintenanceCompliance425cLog(companyId),
    enabled: Boolean(companyId),
  });

  const rows = listQ.data?.rows ?? [];

  const columns = useMemo<ParityColumn<Compliance425cRow>[]>(
    () => [
      {
        key: "created_at",
        label: "Timestamp",
        sortable: true,
        render: (row) => formatDateTimeUS(row.created_at as string) || "—",
      },
      { key: "event_type", label: "Event Type", sortable: true, render: (row) => String(row.event_type ?? "—") },
      {
        key: "payload",
        label: "Payload",
        render: (row) => (
          <pre className="max-h-28 overflow-auto whitespace-pre-wrap text-[11px]">{JSON.stringify(row.payload ?? {}, null, 2)}</pre>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      {/* UI-BACK-BUTTON-MISSING-ENTIRELY: see VehiclesMasterDataPage.tsx sibling comment. */}
      <PageHeader title="Compliance / 425C Linkage" breadcrumb={[{ label: "Maintenance" }, { label: "Compliance" }]} backHref="/maintenance" />
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-2 text-xs text-gray-600">Read-only 425C audit linkage feed for maintenance events.</div>
        {/* CLS-LIST-ERROR-STATE-UNGUARDED: a failed query fell through to the empty state — an outage presenting as a clean 425C compliance record. */}
        {listQ.isError ? (
          <ListErrorState
            title="Couldn't load 425C compliance records"
            status={0}
            message={(listQ.error as Error)?.message}
            onRetry={() => void listQ.refetch()}
          />
        ) : (
        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(row) => String(row.id)}
          loading={listQ.isLoading}
          storageKey="maintenance-compliance-425c"
          emptyText="No 425C-linked events found."
        />
        )}
      </div>
    </div>
  );
}
