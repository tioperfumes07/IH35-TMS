import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { formatDateUS } from "../../lib/formatDate";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { SettlementRefCell } from "../shared/SettlementRefCell";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { ListErrorState } from "../ListErrorState";

type UnitWorkOrderHistoryRow = {
  id: string;
  display_id: string | null;
  status: string;
  opened_at: string | null;
  description: string | null;
  unit_id: string;
  unit_number: string | null;
  load_id: string | null;
  load_number: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  cost_cents: number | string;
  financial_document_count: number | string;
  journal_entry_id: string | null;
  gl_account_id: string | null;
  gl_account_name: string | null;
};

function formatMoneyFromCents(value: number | string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0) / 100);
}

function buildColumns(operatingCompanyId: string): Array<ParityColumn<UnitWorkOrderHistoryRow>> {
  return [
    { key: "display_id", label: "Work order", sortable: true, render: (row) => <EntityLink kind="work_order" id={row.id} label={row.display_id ?? "Work order"} /> },
    { key: "opened_at", label: "Opened", sortable: true, render: (row) => formatDateUS(row.opened_at) },
    { key: "status", label: "Status", sortable: true },
    { key: "description", label: "Reason", sortable: true, render: (row) => row.description || "—" },
    { key: "cost_cents", label: "Cost", sortable: true, sortValue: (row) => Number(row.cost_cents), render: (row) => formatMoneyFromCents(row.cost_cents) },
    { key: "load_number", label: "Load", sortable: true, render: (row) => <EntityLinkOrTombstone kind="load" id={row.load_id} name={row.load_number} noun="Load" /> },
    {
      // ALL-SEATS LAW (owner, 2026-09-13): a settlement/tour number beside every load number.
      key: "load_settlement_ref",
      label: "Settlement / Tour",
      render: (row) =>
        row.load_id ? (
          <SettlementRefCell loadId={row.load_id} operatingCompanyId={operatingCompanyId} />
        ) : (
          <span className="text-gray-400" title="No load linked to this work order">No load</span>
        ),
    },
    { key: "vendor_name", label: "Vendor", sortable: true, render: (row) => <EntityLinkOrTombstone kind="vendor" id={row.vendor_id} name={row.vendor_name} noun="Vendor" /> },
    { key: "gl_account_name", label: "GL", sortable: true, render: (row) => row.gl_account_id ? <EntityLink kind="account" id={row.gl_account_id} label={row.gl_account_name ?? "GL account"} /> : row.journal_entry_id ? <EntityLink kind="journal_entry" id={row.journal_entry_id} label="Journal entry" /> : "—" },
  ];
}

export function UnitMaintenanceHistorySection({ operatingCompanyId, unitId }: { operatingCompanyId: string; unitId: string }) {
  const query = useQuery({
    queryKey: ["unit-maintenance-history", operatingCompanyId, unitId],
    queryFn: () => apiRequest<{ rows: UnitWorkOrderHistoryRow[]; total_count: number }>(`/api/v1/maintenance/units/${encodeURIComponent(unitId)}/work-order-history?operating_company_id=${encodeURIComponent(operatingCompanyId)}`),
    enabled: Boolean(operatingCompanyId && unitId),
  });
  if (query.isError) return <ListErrorState title="Couldn't load Maintenance History" status={0} message={(query.error as Error).message} onRetry={() => void query.refetch()} />;
  return (
    <section className="mt-3 overflow-hidden rounded-sm border border-gray-200 bg-white" data-testid="unit-maintenance-history">
      <div className="border-b border-gray-200 px-3 py-2"><h2 className="text-xs font-semibold text-gray-800">Maintenance History</h2></div>
      <ParityTable storageKey="unit-maintenance-history" tableTestId="unit-maintenance-history-table" columns={buildColumns(operatingCompanyId)} rows={query.data?.rows ?? []} rowKey={(row) => row.id} loading={query.isLoading} emptyText="No work orders are linked to this unit." initialPageSize={25} pageSizeOptions={[25, 50, 100]} />
    </section>
  );
}
