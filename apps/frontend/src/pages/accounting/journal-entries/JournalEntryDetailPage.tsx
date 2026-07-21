import { formatDateUS } from "../../../lib/formatDate";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { getJournalEntry, type JournalEntryPosting } from "../../../api/accounting";
import { Button } from "../../../components/Button";
import { ListErrorState } from "../../../components/ListErrorState";
import { DataPanel } from "../../../components/layout/DataPanel";
import { DataPanelRow } from "../../../components/layout/DataPanelRow";
import { PageHeader } from "../../../components/forms/shared/PageHeader";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "../AccountingSubNavWrapper";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
function humanMemo(memo: string | null | undefined): string {
  if (!memo) return "—";
  return memo.replace(UUID_RE, (uuid) => uuid.slice(0, 8));
}

// Display-only ParityTable migration: columns/order/formatting mirror the former hand-rolled
// table 1:1 (Line / Account / Class / Entity / Side / Amount / Description). Read-only GL
// surface — this page posts nothing and must stay that way (no mutations).
const postingColumns: Array<ParityColumn<JournalEntryPosting>> = [
  {
    key: "line_sequence",
    label: "Line",
    sortable: true,
    render: (posting) => posting.line_sequence,
  },
  {
    key: "account_name",
    label: "Account",
    sortable: true,
    sortValue: (posting) =>
      `${posting.account_number ? `${posting.account_number} - ` : ""}${posting.account_name || posting.account_id}`,
    render: (posting) => (
      <>
        {posting.account_number ? `${posting.account_number} - ` : ""}
        {posting.account_name || posting.account_id}
      </>
    ),
  },
  {
    key: "class_name",
    label: "Class",
    sortable: true,
    sortValue: (posting) => posting.class_name || posting.class_id || "",
    render: (posting) => posting.class_name || posting.class_id || "—",
  },
  {
    key: "entity_uuid",
    label: "Entity",
    sortable: true,
    render: (posting) => posting.entity_uuid || "—",
  },
  {
    key: "debit_or_credit",
    label: "Side",
    sortable: true,
    render: (posting) => posting.debit_or_credit,
  },
  {
    key: "amount_cents",
    label: "Amount",
    sortable: true,
    render: (posting) => money(posting.amount_cents),
  },
  {
    key: "description",
    label: "Description",
    sortable: true,
    render: (posting) => posting.description || "—",
  },
];

export function JournalEntryDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();

  const detailQuery = useQuery({
    queryKey: ["accounting", "journal-entry", selectedCompanyId, id],
    queryFn: () => getJournalEntry(id, selectedCompanyId!),
    enabled: Boolean(selectedCompanyId && id),
  });

  if (detailQuery.isLoading) {
    return <div className="text-sm text-gray-500">Loading journal entry...</div>;
  }
  if (detailQuery.isError) {
    return (
      <ListErrorState
        title="Couldn't load journal entry"
        status={0}
        message={(detailQuery.error as Error | undefined)?.message}
        onRetry={() => void detailQuery.refetch()}
      />
    );
  }
  if (!detailQuery.data) {
    return <div className="text-sm text-red-600">Journal entry not found.</div>;
  }

  const entry = detailQuery.data;
  const postings = entry.postings ?? [];

  return (
    <AccountingSubNavWrapper>
      <PageHeader
        title={`Journal Entry ${entry.id.slice(0, 8)}`}
        backHref="/accounting/journal-entries"
        breadcrumb={[
          { label: "Accounting", href: "/accounting" },
          { label: "Journal Entries", href: "/accounting/journal-entries" },
          { label: entry.id.slice(0, 8) },
        ]}
        actions={
          <Button type="button" variant="secondary" onClick={() => navigate("/accounting/journal-entries")}>
            Back to list
          </Button>
        }
      />

      <DataPanel title="Entry Header">
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Date</span>
          <span className="text-sm text-gray-900">{formatDateUS(entry.entry_date)}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Source</span>
          <span className="text-sm text-gray-900">{entry.source}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Status</span>
          <span className="text-sm text-gray-900">{entry.status}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Memo</span>
          <span className="text-sm text-gray-900">{humanMemo(entry.memo)}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">QBO Link</span>
          <span className="text-sm text-gray-900">{entry.qbo_journal_entry_id || "Not linked"}</span>
        </DataPanelRow>
      </DataPanel>

      <DataPanel title="Postings">
        <ParityTable<JournalEntryPosting>
          storageKey="journal-entry-detail-postings"
          tableTestId="journal-entry-detail-postings-table"
          columns={postingColumns}
          rows={postings}
          rowKey={(posting) => posting.id}
          emptyText="No posting lines."
        />
      </DataPanel>
    </AccountingSubNavWrapper>
  );
}
