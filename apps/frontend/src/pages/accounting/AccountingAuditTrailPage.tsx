import { useMemo, useState } from "react";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { EntityLink } from "../../components/shared/EntityLink";
import {
  getAccountingSourceLineage,
  listAccountingAuditTrail,
  listCoaAccountsForJe,
  type AccountingAuditTrailEvent,
  type AccountingSourceLineageRow,
} from "../../api/accounting";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { ReportBlockVPendingBanner } from "../reports/ReportBlockVPendingBanner";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { formatUsdCents } from "../../lib/money";

function fmtMoneyCents(value: number) {
  return formatUsdCents(value);
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function AccountingAuditTrailPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [sourceType, setSourceType] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [lineageRows, setLineageRows] = useState<AccountingSourceLineageRow[] | null>(null);
  const [lineageKey, setLineageKey] = useState<{ source_transaction_type: string; source_transaction_id: string } | null>(null);

  const accountsQuery = useInfiniteQuery({
    queryKey: ["accounting-audit-trail-accounts"],
    queryFn: async () => listCoaAccountsForJe(),
    getNextPageParam: () => undefined,
    initialPageParam: undefined,
    enabled: true,
    retry: false,
  });

  const eventQuery = useInfiniteQuery({
    queryKey: ["accounting-audit-trail", companyId, sourceType, sourceId, accountId],
    queryFn: ({ pageParam }) =>
      listAccountingAuditTrail(companyId, {
        limit: 50,
        cursor: typeof pageParam === "string" ? pageParam : undefined,
        source_transaction_type: sourceType.trim() || undefined,
        source_transaction_id: sourceId.trim() || undefined,
        account_id: accountId || undefined,
      }),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    enabled: Boolean(companyId),
    retry: false,
  });

  const lineageMut = useMutation({
    mutationFn: (input: { source_transaction_type: string; source_transaction_id: string }) =>
      getAccountingSourceLineage(companyId, input),
    onSuccess: (payload, vars) => {
      setLineageRows(payload.rows ?? []);
      setLineageKey(vars);
    },
  });

  const events = useMemo(
    () => eventQuery.data?.pages.flatMap((p) => p.events ?? []) ?? [],
    [eventQuery.data?.pages],
  );

  const accountOptions = useMemo(
    () => ((accountsQuery.data?.pages[0] as { accounts?: Array<{ id: string; account_number: string; account_name: string }> } | undefined)?.accounts ?? []),
    [accountsQuery.data?.pages],
  );

  const columns = useMemo<ParityColumn<AccountingAuditTrailEvent>[]>(
    () => [
      { key: "occurred_at", label: "Occurred", sortable: true, className: "whitespace-nowrap", render: (row) => fmtDate(row.occurred_at) },
      { key: "event_class", label: "Event", sortable: true },
      {
        key: "source_transaction_type",
        label: "Source",
        render: (row) => (
          <>
            {row.source_transaction_type ?? "—"}
            {row.source_transaction_id ? ` / ${row.source_transaction_id}` : ""}
          </>
        ),
      },
      {
        key: "account_number",
        label: "Account",
        render: (row) => (
          <>
            {row.account_number ?? "—"} {row.account_name ? `- ${row.account_name}` : ""}
          </>
        ),
      },
      {
        key: "amount_cents",
        label: "Amount",
        sortable: true,
        render: (row) => (
          <span className={row.debit_or_credit === "debit" ? "text-emerald-700" : "text-red-700"}>
            {row.debit_or_credit.toUpperCase()} {fmtMoneyCents(row.amount_cents)}
          </span>
        ),
      },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) =>
          row.source_transaction_type && row.source_transaction_id ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                lineageMut.mutate({
                  source_transaction_type: row.source_transaction_type ?? "",
                  source_transaction_id: row.source_transaction_id ?? "",
                });
              }}
            >
              Source lineage
            </Button>
          ) : (
            "—"
          ),
      },
    ],
    [lineageMut],
  );

  const lineageColumns = useMemo<ParityColumn<AccountingSourceLineageRow>[]>(
    () => [
      { key: "occurred_at", label: "Occurred", render: (row) => fmtDate(row.occurred_at) },
      { key: "journal_entry_id", label: "JE", render: (row) => <EntityLink kind="journal_entry" id={row.journal_entry_id} label={row.journal_entry_id?.slice(0, 8)} /> },
      {
        key: "account_number",
        label: "Account",
        render: (row) => (
          <>
            {row.account_number ?? "—"} {row.account_name ? `- ${row.account_name}` : ""}
          </>
        ),
      },
      { key: "amount_cents", label: "Amount", render: (row) => `${row.debit_or_credit.toUpperCase()} ${fmtMoneyCents(row.amount_cents)}` },
      {
        key: "linked_object_type",
        label: "Linked object",
        render: (row) => (
          <>
            {row.linked_object_type ?? "—"}
            {row.linked_object_id ? ` / ${row.linked_object_id}` : ""}
            {row.relationship_role ? ` (${row.relationship_role})` : ""}
          </>
        ),
      },
    ],
    [],
  );

  const filterBar = (
    <div className="grid gap-3 w-full md:grid-cols-4">
      <label className="text-xs text-slate-600">
        Source type
        <input
          className="mt-1 block h-9 w-full rounded-sm border border-slate-300 px-2 text-sm"
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value)}
          placeholder="invoice | bill | payment"
        />
      </label>
      <label className="text-xs text-slate-600">
        Source id
        <input
          className="mt-1 block h-9 w-full rounded-sm border border-slate-300 px-2 text-sm"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          placeholder="uuid or display id"
        />
      </label>
      <label className="text-xs text-slate-600">
        Account
        <select
          className="mt-1 block h-9 w-full rounded-sm border border-slate-300 px-2 text-sm"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">All accounts</option>
          {accountOptions.map((account) => (
            <option key={account.id} value={account.id}>
              {account.account_number} - {account.account_name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end">
        <Button
          variant="secondary"
          onClick={() => {
            setSourceType("");
            setSourceId("");
            setAccountId("");
            void eventQuery.refetch();
          }}
        >
          Reset filters
        </Button>
      </div>
    </div>
  );

  return (
    <AccountingSubNavWrapper title="Audit Trail" subtitle="Immutable posting events with tenant-scoped source lineage lookup">

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
      {eventQuery.isError ? <ReportBlockVPendingBanner error={eventQuery.error} onRetry={() => void eventQuery.refetch()} /> : null}

      <ParityTable
        columns={columns}
        rows={events}
        rowKey={(row) => row.id}
        loading={eventQuery.isPending || (eventQuery.isFetching && events.length === 0)}
        filterBar={filterBar}
        storageKey="accounting-audit-trail"
        renderExpanded={(row) => (
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase text-slate-600">Before state</div>
              <pre className="max-h-48 overflow-auto rounded-sm border border-slate-200 bg-white p-2 text-[11px]">
                {JSON.stringify(row.before_state_json ?? {}, null, 2)}
              </pre>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase text-slate-600">After state</div>
              <pre className="max-h-48 overflow-auto rounded-sm border border-slate-200 bg-white p-2 text-[11px]">
                {JSON.stringify(row.after_state_json ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
        emptyText="No audit events found."
      />
      {eventQuery.hasNextPage ? (
        <div className="border-t border-slate-200 px-3 py-2">
          <Button onClick={() => void eventQuery.fetchNextPage()} loading={eventQuery.isFetchingNextPage}>
            Load more
          </Button>
        </div>
      ) : null}

      {lineageKey ? (
        <div className="rounded-sm border border-slate-200 bg-white p-3">
          <div className="mb-2 text-sm font-semibold">
            Source lineage: {lineageKey.source_transaction_type} / {lineageKey.source_transaction_id}
          </div>
          {lineageMut.isPending ? <div className="text-xs text-slate-500">Loading lineage…</div> : null}
          {lineageRows ? (
            <ParityTable
              columns={lineageColumns}
              rows={lineageRows}
              rowKey={(row) => `${row.posting_id}:${row.linked_object_id ?? "none"}`}
              loading={lineageMut.isPending}
              storageKey="accounting-audit-trail-lineage"
              emptyText="No lineage rows found."
            />
          ) : null}
        </div>
      ) : null}
    </AccountingSubNavWrapper>
  );
}
