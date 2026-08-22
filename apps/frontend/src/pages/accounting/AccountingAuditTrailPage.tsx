import { useMemo, useState, type ReactNode } from "react";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { EntityLink, type EntityKind } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import {
  getAccountingSourceLineage,
  listAccountingAuditTrail,
  listCoaAccountsForJe,
  type AccountingAuditTrailEvent,
  type AccountingSourceLineageRow,
} from "../../api/accounting";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { ReportBlockVPendingBanner } from "../reports/ReportBlockVPendingBanner";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useUrlSort } from "../../hooks/useUrlSort";
import { formatUsdCents } from "../../lib/money";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

function fmtMoneyCents(value: number) {
  return formatUsdCents(value);
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function postingEntityKind(type: string | null | undefined): EntityKind | null {
  const t = (type ?? "").toLowerCase();
  switch (t) {
    case "invoice":
      return "invoice";
    case "bill":
      return "bill";
    case "customer_payment":
    case "payment":
      return "payment";
    case "bill_payment":
      return "bill_payment";
    case "driver_advance":
    case "cash_advance":
      return "cash_advance";
    case "transfer":
      return "transfer";
    case "prepaid_asset":
    case "prepaid_amortization":
      return "prepaid_asset";
    case "fixed_asset":
    case "fixed_asset_depreciation":
      return "fixed_asset";
    case "loan":
    case "finance_loan":
      return "finance_loan";
    case "lease_contract":
      return "lease_contract";
    case "recurring_template":
      return "recurring_template";
    case "period_close":
      return "period_close";
    case "expense":
      return "expense";
    case "settlement":
    case "driver_settlement":
    case "driver_settlement_deduction":
      return "settlement";
    case "journal_entry":
      return "journal_entry";
    case "load":
      return "load";
    case "vendor":
      return "vendor";
    case "customer":
      return "customer";
    case "unit":
      return "unit";
    case "driver":
      return "driver";
    case "trailer":
      return "trailer";
    case "work_order":
      return "work_order";
    case "factoring_advance":
      return "factoring_advance";
    case "bank_transaction":
    case "bank_categorization":
      return "bank_transaction";
    case "claim":
      return "claim";
    case "matter":
      return "matter";
    case "liability":
      return "liability";
    default:
      return null;
  }
}

function PostingEntityLink({
  type,
  id,
  label,
}: {
  type: string | null | undefined;
  id: string | null | undefined;
  label?: ReactNode;
}) {
  const kind = postingEntityKind(type);
  if (!kind || !id) {
    return <>{label ?? id ?? ""}</>;
  }
  return <EntityLink kind={kind} id={id} label={label ?? entityLabel(null, id, "Record")} />;
}

export function AccountingAuditTrailPage() {
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";
  const [searchParams] = useSearchParams();
  // Deep-link from invoice/payment "View audit log" (?source_type=&source_id=).
  const sourceTypeParam = searchParams.get("source_type");
  const sourceIdParam = searchParams.get("source_id");
  const [sourceType, setSourceType] = useState(() => sourceTypeParam ?? "");
  const [sourceId, setSourceId] = useState(() => sourceIdParam ?? "");
  const [accountId, setAccountId] = useState("");
  const staged = useStagedListFilters({ applied: { sourceType, sourceId, accountId }, empty: { sourceType: "", sourceId: "", accountId: "" }, onApply: (next) => { setSourceType(next.sourceType); setSourceId(next.sourceId); setAccountId(next.accountId); } });
  const [lineageRows, setLineageRows] = useState<AccountingSourceLineageRow[] | null>(null);
  const [lineageKey, setLineageKey] = useState<{ source_transaction_type: string; source_transaction_id: string } | null>(null);
  // BANK-SORT-ROLLOUT-ACCT — audit event list sort persists in ?sort=&dir= via useUrlSort.
  const { sortKey, sortDirection, onSortChange } = useUrlSort();

  const accountsQuery = useInfiniteQuery({
    queryKey: ["accounting-audit-trail-accounts", companyId],
    queryFn: async () => listCoaAccountsForJe(companyId, { postableOnly: true }),
    getNextPageParam: () => undefined,
    initialPageParam: undefined,
    enabled: Boolean(companyId),
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
    onError: (err) => pushToast(err instanceof Error ? err.message : "Source lineage lookup failed", "error"),
  });

  const events = useMemo(
    () => eventQuery.data?.pages?.flatMap((p) => p.events ?? []) ?? [],
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
        sortable: true,
        render: (row) => (
          <>
            {row.source_transaction_type ?? "—"}
            {row.source_transaction_id ? (
              <>
                {" / "}
                <PostingEntityLink
                  type={row.source_entity_kind ?? row.source_transaction_type}
                  id={row.source_transaction_id}
                  label={entityLabel(row.source_transaction_display_id, row.source_transaction_id, "Source transaction")}
                />
              </>
            ) : null}
          </>
        ),
      },
      {
        key: "account_number",
        label: "Account",
        sortable: true,
        render: (row) => (
          <>
            {row.account_name ?? "—"}
          </>
        ),
      },
      {
        key: "amount_cents",
        label: "Amount",
        sortable: true,
        render: (row) => (
          <span className={row.debit_or_credit === "debit" ? "text-slate-700" : "text-red-700"}>
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
      { key: "occurred_at", label: "Occurred", sortable: true, render: (row) => fmtDate(row.occurred_at) },
      { key: "journal_entry_id", label: "JE", sortable: true, render: (row) => <EntityLink kind="journal_entry" id={row.journal_entry_id} label={row.journal_entry_id ? entityLabel(row.memo, row.journal_entry_id, "Journal entry") : undefined} /> },
      {
        key: "account_number",
        label: "Account",
        sortable: true,
        render: (row) => (
          <>
            {row.account_name ?? "—"}
          </>
        ),
      },
      { key: "amount_cents", label: "Amount", sortable: true, render: (row) => `${row.debit_or_credit.toUpperCase()} ${fmtMoneyCents(row.amount_cents)}` },
      {
        key: "linked_object_type",
        label: "Linked object",
        sortable: true,
        render: (row) => (
          <>
            {row.linked_object_type ?? "—"}
            {row.linked_object_id ? (
              <>
                {" / "}
                <PostingEntityLink
                  type={row.linked_object_type}
                  id={row.linked_object_id}
                  label={entityLabel(row.linked_object_display_id, row.linked_object_id, "Linked object")}
                />
              </>
            ) : null}
            {row.relationship_role ? ` (${row.relationship_role})` : ""}
          </>
        ),
      },
    ],
    [],
  );

  const filterBar = (
    <CollapsedListFilters
      activeFilterCount={(sourceType ? 1 : 0) + (sourceId ? 1 : 0) + (accountId ? 1 : 0)}
      onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}
      testIdPrefix="audit-trail"
      dataAttributes={{ "data-audit-trail-filter-toolbar": "collapsed" }}
    >
      <div className="grid gap-3 w-full md:grid-cols-4">
        <label className="text-xs text-slate-600">
          Source type
          <input
            className="mt-1 block h-9 w-full rounded-sm border border-slate-300 px-2 text-sm"
            value={staged.draft.sourceType}
            onChange={(e) => staged.setDraft({ ...staged.draft, sourceType: e.target.value })}
            placeholder="invoice | bill | payment"
          />
        </label>
        <label className="text-xs text-slate-600">
          Source id
          <input
            className="mt-1 block h-9 w-full rounded-sm border border-slate-300 px-2 text-sm"
            value={staged.draft.sourceId}
            onChange={(e) => staged.setDraft({ ...staged.draft, sourceId: e.target.value })}
            placeholder="uuid or display id"
          />
        </label>
        <label className="text-xs text-slate-600">
          Account
          <SelectCombobox
            className="mt-1 block h-9 w-full rounded-sm border border-slate-300 px-2 text-sm"
            value={staged.draft.accountId}
            onChange={(e) => staged.setDraft({ ...staged.draft, accountId: e.target.value })}
          >
            <option value="">All accounts</option>
            {accountOptions.map((account) => (
              <option key={account.id} value={account.id}>
                {account.account_number} - {account.account_name}
              </option>
            ))}
          </SelectCombobox>
        </label>
      </div>
    </CollapsedListFilters>
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
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
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
            Source lineage: {lineageKey.source_transaction_type} /{" "}
            <PostingEntityLink
              type={lineageKey.source_transaction_type}
              id={lineageKey.source_transaction_id}
              label={entityLabel(lineageRows?.[0]?.source_transaction_display_id, lineageKey.source_transaction_id, "Source transaction")}
            />
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
