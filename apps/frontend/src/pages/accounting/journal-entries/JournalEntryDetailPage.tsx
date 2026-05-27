import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { getJournalEntry } from "../../../api/accounting";
import { Button } from "../../../components/Button";
import { DataPanel } from "../../../components/layout/DataPanel";
import { DataPanelRow } from "../../../components/layout/DataPanelRow";
import { PageHeader } from "../../../components/forms/shared/PageHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { AccountingSubNav } from "../AccountingSubNav";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

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
  if (detailQuery.isError || !detailQuery.data) {
    return <div className="text-sm text-red-600">Journal entry not found.</div>;
  }

  const entry = detailQuery.data;
  const postings = entry.postings ?? [];

  return (
    <div className="space-y-3">
      <AccountingSubNav />
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
          <span className="text-sm text-gray-900">{entry.entry_date}</span>
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
          <span className="text-sm text-gray-900">{entry.memo || "—"}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">QBO Link</span>
          <span className="text-sm text-gray-900">{entry.qbo_journal_entry_id || "Not linked"}</span>
        </DataPanelRow>
      </DataPanel>

      <DataPanel title="Postings">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th className="px-2 py-1.5 font-semibold">Line</th>
                <th className="px-2 py-1.5 font-semibold">Account</th>
                <th className="px-2 py-1.5 font-semibold">Class</th>
                <th className="px-2 py-1.5 font-semibold">Entity</th>
                <th className="px-2 py-1.5 font-semibold">Side</th>
                <th className="px-2 py-1.5 font-semibold">Amount</th>
                <th className="px-2 py-1.5 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody>
              {postings.map((posting) => (
                <tr key={posting.id} className="border-b border-gray-100">
                  <td className="px-2 py-1.5">{posting.line_sequence}</td>
                  <td className="px-2 py-1.5">
                    {posting.account_number ? `${posting.account_number} - ` : ""}
                    {posting.account_name || posting.account_id}
                  </td>
                  <td className="px-2 py-1.5">{posting.class_name || posting.class_id || "—"}</td>
                  <td className="px-2 py-1.5">{posting.entity_uuid || "—"}</td>
                  <td className="px-2 py-1.5">{posting.debit_or_credit}</td>
                  <td className="px-2 py-1.5">{money(posting.amount_cents)}</td>
                  <td className="px-2 py-1.5">{posting.description || "—"}</td>
                </tr>
              ))}
              {postings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-2 text-gray-500">
                    No posting lines.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </DataPanel>
    </div>
  );
}
