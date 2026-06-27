import { Fragment, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
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

function fmtMoneyCents(value: number) {
  return (value / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function AccountingAuditTrailPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
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

  return (
    <AccountingSubNavWrapper title="Audit Trail" subtitle="Immutable posting events with tenant-scoped source lineage lookup">

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
      {eventQuery.isError ? <ReportBlockVPendingBanner error={eventQuery.error} onRetry={() => void eventQuery.refetch()} /> : null}

      <div className="grid gap-3 rounded border border-slate-200 bg-white p-3 md:grid-cols-4">
        <label className="text-xs text-slate-600">
          Source type
          <input
            className="mt-1 block h-9 w-full rounded border border-slate-300 px-2 text-sm"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            placeholder="invoice | bill | payment"
          />
        </label>
        <label className="text-xs text-slate-600">
          Source id
          <input
            className="mt-1 block h-9 w-full rounded border border-slate-300 px-2 text-sm"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            placeholder="uuid or display id"
          />
        </label>
        <label className="text-xs text-slate-600">
          Account
          <select
            className="mt-1 block h-9 w-full rounded border border-slate-300 px-2 text-sm"
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

      <div className="rounded border border-slate-200 bg-white">
        {eventQuery.isLoading ? <div className="p-3 text-sm text-slate-500">Loading audit trail…</div> : null}
        {!eventQuery.isLoading && events.length === 0 ? <div className="p-3 text-sm text-slate-500">No audit events found.</div> : null}
        {events.length > 0 ? (
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">Occurred</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((row: AccountingAuditTrailEvent) => (
                <Fragment key={row.id}>
                  <tr
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                    onClick={() =>
                      setExpandedRows((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.id)) next.delete(row.id);
                        else next.add(row.id);
                        return next;
                      })
                    }
                  >
                    <td className="whitespace-nowrap px-3 py-2">{fmtDate(row.occurred_at)}</td>
                    <td className="px-3 py-2">{row.event_class}</td>
                    <td className="px-3 py-2">
                      {row.source_transaction_type ?? "—"}
                      {row.source_transaction_id ? ` / ${row.source_transaction_id}` : ""}
                    </td>
                    <td className="px-3 py-2">
                      {row.account_number ?? "—"} {row.account_name ? `- ${row.account_name}` : ""}
                    </td>
                    <td className="px-3 py-2">
                      <span className={row.debit_or_credit === "debit" ? "text-emerald-700" : "text-red-700"}>
                        {row.debit_or_credit.toUpperCase()} {fmtMoneyCents(row.amount_cents)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {row.source_transaction_type && row.source_transaction_id ? (
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
                      )}
                    </td>
                  </tr>
                  {expandedRows.has(row.id) ? (
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={6} className="px-3 py-2">
                        <div className="grid gap-2 md:grid-cols-2">
                          <div>
                            <div className="mb-1 text-[11px] font-semibold uppercase text-slate-600">Before state</div>
                            <pre className="max-h-48 overflow-auto rounded border border-slate-200 bg-white p-2 text-[11px]">
                              {JSON.stringify(row.before_state_json ?? {}, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div className="mb-1 text-[11px] font-semibold uppercase text-slate-600">After state</div>
                            <pre className="max-h-48 overflow-auto rounded border border-slate-200 bg-white p-2 text-[11px]">
                              {JSON.stringify(row.after_state_json ?? {}, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        ) : null}
        {eventQuery.hasNextPage ? (
          <div className="border-t border-slate-200 px-3 py-2">
            <Button onClick={() => void eventQuery.fetchNextPage()} loading={eventQuery.isFetchingNextPage}>
              Load more
            </Button>
          </div>
        ) : null}
      </div>

      {lineageKey ? (
        <div className="rounded border border-slate-200 bg-white p-3">
          <div className="mb-2 text-sm font-semibold">
            Source lineage: {lineageKey.source_transaction_type} / {lineageKey.source_transaction_id}
          </div>
          {lineageMut.isPending ? <div className="text-xs text-slate-500">Loading lineage…</div> : null}
          {lineageRows && lineageRows.length === 0 ? <div className="text-xs text-slate-500">No lineage rows found.</div> : null}
          {lineageRows && lineageRows.length > 0 ? (
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-600">
                <tr>
                  <th className="px-2 py-2">Occurred</th>
                  <th className="px-2 py-2">JE</th>
                  <th className="px-2 py-2">Account</th>
                  <th className="px-2 py-2">Amount</th>
                  <th className="px-2 py-2">Linked object</th>
                </tr>
              </thead>
              <tbody>
                {lineageRows.map((row) => (
                  <tr key={`${row.posting_id}:${row.linked_object_id ?? "none"}`} className="border-b border-slate-100">
                    <td className="px-2 py-2">{fmtDate(row.occurred_at)}</td>
                    <td className="px-2 py-2">{row.journal_entry_id}</td>
                    <td className="px-2 py-2">
                      {row.account_number ?? "—"} {row.account_name ? `- ${row.account_name}` : ""}
                    </td>
                    <td className="px-2 py-2">{row.debit_or_credit.toUpperCase()} {fmtMoneyCents(row.amount_cents)}</td>
                    <td className="px-2 py-2">
                      {row.linked_object_type ?? "—"}
                      {row.linked_object_id ? ` / ${row.linked_object_id}` : ""}
                      {row.relationship_role ? ` (${row.relationship_role})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}
    </AccountingSubNavWrapper>
  );
}
