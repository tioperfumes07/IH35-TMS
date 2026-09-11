import { DataTable, type DataTableColumn } from "../DataTable";
import { DataPanel } from "../layout/DataPanel";
import { EntityLink } from "../shared/EntityLink";
import { formatUsd } from "../../lib/money";

export type HistoricalSettlementAttributionRow = {
  id: string;
  source_settlement_id: string;
  source_settlement_display_id: string;
  source_journal_entry_id: string;
  target_settlement_id: string;
  target_settlement_display_id: string;
  source_document_ref: string;
  allocation_basis: "identity_only" | "reconstructed_sources";
  allocated_net_cents: string | null;
};

const columns: DataTableColumn<HistoricalSettlementAttributionRow>[] = [
  { key: "source_document_ref", label: "Source document", sortable: true },
  { key: "source_settlement_display_id", label: "Original settlement", sortable: true,
    render: row => <EntityLink kind="settlement" id={row.source_settlement_id} label={row.source_settlement_display_id} /> },
  { key: "target_settlement_display_id", label: "Round-trip settlement", sortable: true,
    render: row => <EntityLink kind="settlement" id={row.target_settlement_id} label={row.target_settlement_display_id} /> },
  { key: "source_journal_entry_id", label: "Original journal", sortable: true,
    render: row => <EntityLink kind="journal_entry" id={row.source_journal_entry_id} label="View journal" /> },
  { key: "allocation_basis", label: "Allocation basis", sortable: true,
    render: row => row.allocation_basis === "identity_only" ? "Unallocated" : "Reconstructed from sources" },
  { key: "allocated_net_cents", label: "Attributed obligation", sortable: true,
    sortValue: row => row.allocated_net_cents === null ? null : Number(row.allocated_net_cents),
    render: row => row.allocated_net_cents === null ? "—" : formatUsd(Number(row.allocated_net_cents) / 100) },
];

export function HistoricalSettlementAttributions({ rows }: { rows: HistoricalSettlementAttributionRow[] }) {
  if (!rows.length) return null;
  return <DataPanel title="Historical posted obligation">
    <p className="px-2 py-2 text-xs text-gray-500">
      These round trips reference an original posted journal. This does not establish a bank payment.
      Unallocated amounts are unknown. Posting, payment and reopening require resolution of the original attribution.
    </p>
    <DataTable columns={columns} rows={rows} rowKey={row => row.id} hidePager />
  </DataPanel>;
}
