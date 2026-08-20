import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatDateUS } from "../../lib/formatDate";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listCoaAccountsForJe, listJournalEntries, voidJournalEntry, type JournalEntry, type JournalEntrySource, type JournalEntryStatus } from "../../api/accounting";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { ManualJEModal } from "./ManualJEModal";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useUrlSort } from "../../hooks/useUrlSort";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { userFacingApiError } from "../../lib/api-error-message";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { coaAccountReferenceOption } from "../../components/parity/referenceOptionLabels";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// ACCT-F5608 — the generic UUID-in-memo replacement below always passed noun="Record", so it read
// literally as "Fuel txn Record — not visible" (the original type word AND the generic fallback noun
// both survive the substitution) for the DOMINANT JE memo shape on prod (live 2026-08-20,
// tiny-field-89581227: 1,557 of 1,930 posted JEs are "Fuel txn <uuid>" -- 82.6%; another 328 match
// one of the patterns below). Every one of these type words is a KNOWN, single-table id (the poster
// that wrote it always names one canonical table), so the noun can be made specific and the redundant
// prefix word dropped by matching the WHOLE "<type word(s)> <uuid>" span, not just the uuid. Anything
// that doesn't match one of these known shapes still falls through to the original generic
// per-uuid substitution unchanged.
const KNOWN_MEMO_ID_PATTERNS: Array<{ re: RegExp; noun: string }> = [
  { re: /Fuel txn [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, noun: "Fuel transaction" },
  { re: /Expense [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?= posting)/gi, noun: "Expense" },
  { re: /Bill payment [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?= posting)/gi, noun: "Bill payment" },
  { re: /Driver advance [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?= posting)/gi, noun: "Driver advance" },
  { re: /Bank categorization:? ?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?= posting)/gi, noun: "Bank transaction" },
  { re: /Void reversal of bill [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=:)/gi, noun: "Bill" },
  { re: /Void reversal of invoice [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=:)/gi, noun: "Invoice" },
  { re: /Reversal of [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, noun: "Journal entry" },
];
export function humanMemo(memo: string | null | undefined): string {
  if (!memo) return "—";
  let result = memo;
  for (const { re, noun } of KNOWN_MEMO_ID_PATTERNS) {
    result = result.replace(re, (whole) => {
      const uuid = whole.match(UUID_RE)?.[0] ?? "";
      return entityLabel(null, uuid, noun);
    });
  }
  return result.replace(UUID_RE, (uuid) => entityLabel(null, uuid, "Record"));
}

/** LST-F107: JE column must not lead with a bare UUID fragment (date column already exists). */
function journalEntryListLabel(entry: {
  journal_entry_type_code?: string | null;
  journal_entry_type_name?: string | null;
  source?: string | null;
  memo?: string | null;
}): string {
  const type =
    entry.journal_entry_type_code?.trim() ||
    entry.journal_entry_type_name?.trim() ||
    entry.source?.trim() ||
    "JE";
  const memo = entry.memo?.trim() ? humanMemo(entry.memo) : "";
  if (memo && memo !== "—") {
    return `${type} · ${memo.length > 36 ? `${memo.slice(0, 36)}…` : memo}`;
  }
  return type;
}

export function ManualJEListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { user } = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const { sortKey, sortDirection, onSortChange } = useUrlSort();

  const [status, setStatus] = useState<JournalEntryStatus | "all">("all");
  const [source, setSource] = useState<JournalEntrySource | "all">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [accountId, setAccountId] = useState("");
  const staged = useStagedListFilters({ applied: { source, status, fromDate, toDate, accountId }, empty: { source: "all" as const, status: "all" as const, fromDate: "", toDate: "", accountId: "" }, onApply: (next) => { setSource(next.source); setStatus(next.status); setFromDate(next.fromDate); setToDate(next.toDate); setAccountId(next.accountId); setPage(0); } });
  const accountsQuery = useQuery({
    queryKey: ["manual-je-list", "accounts", companyId],
    queryFn: () => listCoaAccountsForJe(companyId, { postableOnly: true }),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });
  const accountOptions = useMemo(
    () => (accountsQuery.data?.accounts ?? []).map(coaAccountReferenceOption),
    [accountsQuery.data?.accounts],
  );
  // ACCT-F5056 — Topbar Create→Journal entry uses ?create=1 (money create deep-link class).
  const createOpen = searchParams.get("create") === "1";
  function setCreateOpen(next: boolean) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set("create", "1");
        else params.delete("create");
        return params;
      },
      { replace: true }
    );
  }
  const [voidTarget, setVoidTarget] = useState<JournalEntry | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 200;

  // Reset to the first page whenever a filter changes so offset paging stays coherent.
  useEffect(() => {
    setPage(0);
  }, [status, source, fromDate, toDate, accountId]);

  const entriesQuery = useQuery({
    queryKey: ["journal-entries", companyId, status, source, fromDate, toDate, accountId, page],
    queryFn: () =>
      listJournalEntries(companyId, {
        status: status === "all" ? undefined : status,
        source: source === "all" ? undefined : source,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        account_id: accountId || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    enabled: Boolean(companyId),
  });

  const pageRows = entriesQuery.data?.journal_entries ?? [];
  const hasNextPage = pageRows.length === PAGE_SIZE;

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => voidJournalEntry(id, companyId, reason),
    onSuccess: () => {
      pushToast("Journal entry voided", "success");
      void queryClient.invalidateQueries({ queryKey: ["journal-entries", companyId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Void failed"), "error"),
  });

  const columns = useMemo<ParityColumn<JournalEntry>[]>(
    () => [
      {
        key: "id",
        label: "JE",
        sortable: true,
        sortValue: (entry) => entry.id,
        render: (entry) => (
          <EntityLink
            kind="journal_entry"
            id={entry.id}
            label={journalEntryListLabel(entry)}
            onClick={(e) => e.stopPropagation()}
          />
        ),
      },
      { key: "entry_date", label: "Date", sortable: true, render: (entry) => formatDateUS(entry.entry_date) },
      { key: "memo", label: "Memo", sortable: true, sortValue: (entry) => entry.memo ?? "", render: (entry) => humanMemo(entry.memo) },
      { key: "source", label: "Source", sortable: true },
      { key: "status", label: "Status", sortable: true },
      { key: "debit_total_cents", label: "Debits", sortable: true, className: "text-right", cellClass: "text-right tabular-nums", render: (entry) => `$${((entry.debit_total_cents ?? 0) / 100).toFixed(2)}` },
      { key: "credit_total_cents", label: "Credits", sortable: true, className: "text-right", cellClass: "text-right tabular-nums", render: (entry) => `$${((entry.credit_total_cents ?? 0) / 100).toFixed(2)}` },
      {
        key: "matched_bank_transaction_id",
        label: "Bank",
        sortable: true,
        sortValue: (entry) => entry.matched_bank_transaction_id ?? "",
        render: (entry) =>
          entry.matched_bank_transaction_id ? (
            <EntityLink
              kind="bank_transaction"
              id={entry.matched_bank_transaction_id}
              label={entityLabel(null, entry.matched_bank_transaction_id, "Bank transaction")}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            "—"
          ),
      },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (entry) =>
          entry.reversed_by_je_id ? (
            <span className="text-xs text-gray-500" title={`Reversed by ${entityLabel(null, entry.reversed_by_je_id, "Journal entry")}`}>
              Reversed
            </span>
          ) : user?.role === "Owner" && entry.status === "posted" ? (
            <Button
              size="sm"
              variant="danger"
              onClick={(e) => {
                e.stopPropagation();
                setVoidTarget(entry);
              }}
            >
              Void
            </Button>
          ) : (
            "-"
          ),
      },
    ],
    [user?.role, voidMutation],
  );

  const jeActiveFilterCount =
    (source !== "all" ? 1 : 0) + (status !== "all" ? 1 : 0) + (fromDate || toDate ? 1 : 0) + (accountId ? 1 : 0);

  const filterBar = (
    <CollapsedListFilters
      activeFilterCount={jeActiveFilterCount}
      onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}
      testIdPrefix="manual-je"
      dataAttributes={{ "data-manual-je-filter-toolbar": "collapsed" }}
    >
      <div className="grid grid-cols-2 gap-2 w-full text-xs md:grid-cols-5">
        <SelectCombobox className="h-8 rounded-sm border border-gray-300 px-2" value={staged.draft.source} onChange={(e) => staged.setDraft({ ...staged.draft, source: e.target.value as JournalEntrySource | "all" })}>
          <option value="all">All sources</option>
          <option value="manual">Manual</option>
          <option value="auto">Auto</option>
        </SelectCombobox>
        <SelectCombobox className="h-8 rounded-sm border border-gray-300 px-2" value={staged.draft.status} onChange={(e) => staged.setDraft({ ...staged.draft, status: e.target.value as JournalEntryStatus | "all" })}>
          <option value="all">All statuses</option>
          <option value="posted">Posted</option>
          <option value="voided">Voided</option>
        </SelectCombobox>
        <DatePicker className="h-8" value={staged.draft.fromDate} onChange={(next) => staged.setDraft({ ...staged.draft, fromDate: next })} />
        <DatePicker className="h-8" value={staged.draft.toDate} onChange={(next) => staged.setDraft({ ...staged.draft, toDate: next })} />
        <ReferenceSelect
          value={staged.draft.accountId || null}
          onChange={(next) => staged.setDraft({ ...staged.draft, accountId: next ?? "" })}
          options={accountOptions}
          createKind="account"
          operatingCompanyId={companyId}
          placeholder="All accounts"
          disabled={!companyId}
          loading={accountsQuery.isLoading}
          onOptionCreated={() => void accountsQuery.refetch()}
        />
      </div>
    </CollapsedListFilters>
  );

  return (
    <AccountingSubNavWrapper
      title="Manual Journal Entries"
      subtitle="Filter, review, and void posted entries"
      actions={<Button onClick={() => setCreateOpen(true)} disabled={!companyId}>+ Create</Button>}
    >
      {/* 0243-g8-5: a query error must surface a retryable banner, not a blank grid / forever spinner. */}
      {entriesQuery.isError ? <ListErrorBanner onRetry={() => void entriesQuery.refetch()} /> : null}
      <ParityTable
        columns={columns}
        rows={pageRows}
        rowKey={(entry) => entry.id}
        loading={entriesQuery.isPending || (entriesQuery.isFetching && pageRows.length === 0)}
        onRowClick={(entry) => navigate(`/accounting/journal-entries/${entry.id}`)}
        filterBar={filterBar}
        storageKey="manual-je-list"
        initialPageSize={PAGE_SIZE}
        pageSizeOptions={[PAGE_SIZE]}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
        emptyText="No journal entries found."
      />

      <div className="flex items-center justify-between gap-2 text-xs text-gray-600">
        <span>
          Showing {pageRows.length === 0 ? 0 : page * PAGE_SIZE + 1}
          {pageRows.length > 0 ? `–${page * PAGE_SIZE + pageRows.length}` : ""}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" disabled={page === 0 || entriesQuery.isFetching} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            ← Prev
          </Button>
          <span>Page {page + 1}</span>
          <Button size="sm" variant="secondary" disabled={!hasNextPage || entriesQuery.isFetching} onClick={() => setPage((p) => p + 1)}>
            Next →
          </Button>
        </div>
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
      <VoidReasonModal
        open={Boolean(voidTarget)}
        title="Void Journal Entry"
        entityRef={
          voidTarget
            ? `JE ${formatDateUS(voidTarget.entry_date)} · $${((voidTarget.debit_total_cents ?? 0) / 100).toFixed(2)}`
            : undefined
        }
        minLength={3}
        onClose={() => setVoidTarget(null)}
        onSubmit={async (reason) => {
          if (!voidTarget) return;
          await voidMutation.mutateAsync({ id: voidTarget.id, reason });
          setVoidTarget(null);
        }}
      />
    </AccountingSubNavWrapper>
  );
}
