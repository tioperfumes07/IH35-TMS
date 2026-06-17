import { useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listJournalEntries, voidJournalEntry, type JournalEntrySource, type JournalEntryStatus } from "../../api/accounting";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { AccountingSubNav } from "./AccountingSubNav";
import { ManualJEModal } from "./ManualJEModal";

export function ManualJEListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { user } = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<JournalEntryStatus | "all">("all");
  const [source, setSource] = useState<JournalEntrySource | "all">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [accountId, setAccountId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const entriesQuery = useQuery({
    queryKey: ["journal-entries", companyId, status, source, fromDate, toDate, accountId],
    queryFn: () =>
      listJournalEntries(companyId, {
        status: status === "all" ? undefined : status,
        source: source === "all" ? undefined : source,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        account_id: accountId || undefined,
        limit: 200,
      }),
    enabled: Boolean(companyId),
  });

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => voidJournalEntry(id, companyId, reason),
    onSuccess: () => {
      pushToast("Journal entry voided", "success");
      void queryClient.invalidateQueries({ queryKey: ["journal-entries", companyId] });
    },
    onError: (error) => pushToast(String((error as Error)?.message ?? "Void failed"), "error"),
  });

  return (
    <div className="space-y-3">
      <AccountingSubNav />
      <PageHeader
        title="Manual Journal Entries"
        subtitle="Filter, review, and void posted entries"
        actions={
          <Button onClick={() => setCreateOpen(true)} disabled={!companyId}>
            + Create
          </Button>
        }
      />
      <div className="grid grid-cols-5 gap-2 rounded border border-gray-200 bg-white p-2 text-xs">
        <SelectCombobox className="h-8 rounded border border-gray-300 px-2" value={source} onChange={(e) => setSource(e.target.value as JournalEntrySource | "all")}>
          <option value="all">All sources</option>
          <option value="manual">Manual</option>
          <option value="auto">Auto</option>
        </SelectCombobox>
        <SelectCombobox className="h-8 rounded border border-gray-300 px-2" value={status} onChange={(e) => setStatus(e.target.value as JournalEntryStatus | "all")}>
          <option value="all">All statuses</option>
          <option value="posted">Posted</option>
          <option value="voided">Voided</option>
        </SelectCombobox>
        <DatePicker className="h-8 rounded border border-gray-300 px-2" value={fromDate} onChange={(next) => setFromDate(next)} />
        <DatePicker className="h-8 rounded border border-gray-300 px-2" value={toDate} onChange={(next) => setToDate(next)} />
        <input
          className="h-8 rounded border border-gray-300 px-2"
          placeholder="Account ID (optional)"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 font-semibold">Date</th>
              <th className="px-3 py-2 font-semibold">Memo</th>
              <th className="px-3 py-2 font-semibold">Source</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Debits</th>
              <th className="px-3 py-2 font-semibold">Credits</th>
              <th className="px-3 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(entriesQuery.data?.journal_entries ?? []).map((entry) => (
              <tr key={entry.id} className="border-t border-gray-100">
                <td className="px-3 py-2">{entry.entry_date?.slice(0, 10)}</td>
                <td className="px-3 py-2">{entry.memo ?? "-"}</td>
                <td className="px-3 py-2">{entry.source}</td>
                <td className="px-3 py-2">{entry.status}</td>
                <td className="px-3 py-2">${((entry.debit_total_cents ?? 0) / 100).toFixed(2)}</td>
                <td className="px-3 py-2">${((entry.credit_total_cents ?? 0) / 100).toFixed(2)}</td>
                <td className="px-3 py-2">
                  {user?.role === "Owner" && entry.status !== "voided" ? (
                    <Button
                      size="sm"
                      variant="danger"
                      loading={voidMutation.isPending}
                      onClick={() => {
                        const reason = window.prompt("Void reason (required, min 3 chars):", "");
                        if (!reason || reason.trim().length < 3) return;
                        voidMutation.mutate({ id: entry.id, reason: reason.trim() });
                      }}
                    >
                      Void
                    </Button>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
            {(entriesQuery.data?.journal_entries ?? []).length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={7}>
                  No journal entries found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {companyId ? (
        <ManualJEModal
          open={createOpen}
          operatingCompanyId={companyId}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["journal-entries", companyId] });
          }}
        />
      ) : null}
    </div>
  );
}
