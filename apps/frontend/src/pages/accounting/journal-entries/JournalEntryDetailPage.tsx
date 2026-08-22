import { formatDateUS } from "../../../lib/formatDate";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  getJournalEntry,
  getJournalEntrySourceLinks,
  type JournalEntryPosting,
  type JournalEntrySourceLink,
} from "../../../api/accounting";
import { Button } from "../../../components/Button";
import { ListErrorState } from "../../../components/ListErrorState";
import { DataPanel } from "../../../components/layout/DataPanel";
import { DataPanelRow } from "../../../components/layout/DataPanelRow";
import { PageHeader } from "../../../components/forms/shared/PageHeader";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink, type EntityKind } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "../AccountingSubNavWrapper";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
function humanMemo(memo: string | null | undefined): string {
  if (!memo) return "—";
  return memo.replace(UUID_RE, (uuid) => entityLabel(null, uuid, "Record"));
}

/** LST-F105: page chrome must not lead with a bare UUID fragment as the JE identity. */
function journalEntryChromeLabel(entry: {
  entry_date: string;
  journal_entry_type_code?: string | null;
  journal_entry_type_name?: string | null;
  source?: string | null;
  memo?: string | null;
}): string {
  const date = formatDateUS(entry.entry_date);
  const type =
    entry.journal_entry_type_code?.trim() ||
    entry.journal_entry_type_name?.trim() ||
    entry.source?.trim() ||
    "Journal entry";
  const memo = entry.memo?.trim() ? humanMemo(entry.memo) : "";
  const memoBit = memo && memo !== "—" ? ` · ${memo.length > 48 ? `${memo.slice(0, 48)}…` : memo}` : "";
  return `${date} · ${type}${memoBit}`;
}

function postingEntityKind(type: string | null | undefined): EntityKind | null {
  switch ((type ?? "").toLowerCase()) {
    case "invoice":
      return "invoice";
    case "customer_payment":
    case "payment":
      return "payment";
    case "bill_payment":
      return "bill_payment";
    case "driver_advance":
    case "cash_advance":
      return "cash_advance";
    case "bill":
      return "bill";
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
    case "work_order":
      return "work_order";
    case "factoring_advance":
      return "factoring_advance";
    case "bank_transaction":
    case "bank_categorization":
      return "bank_transaction";
    case "transfer":
      return "transfer";
    case "claim":
      return "claim";
    case "matter":
      return "matter";
    case "liability":
      return "liability";
    case "prepaid_asset":
    case "prepaid_amortization":
      return "prepaid_asset";
    case "sales_tax_return":
      return "sales_tax_return";
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
    default:
      return null;
  }
}

function SourceEntityLink({
  type,
  id,
  label,
}: {
  type: string | null | undefined;
  id: string | null | undefined;
  label?: ReactNode;
}) {
  const kind = postingEntityKind(type);
  if (!kind || !id) return <>{label ?? id ?? "—"}</>;
  return <EntityLink kind={kind} id={id} label={entityLabel(label, id, "Record")} />;
}

function uniqueSourceRows(rows: JournalEntrySourceLink[]): Array<{
  key: string;
  type: string;
  id: string;
  displayId: string | null;
}> {
  const seen = new Set<string>();
  const out: Array<{ key: string; type: string; id: string; displayId: string | null }> = [];
  for (const row of rows) {
    const candidates: Array<{ type: string | null; id: string | null; displayId: string | null }> = [
      { type: row.source_entity_kind ?? row.source_transaction_type, id: row.source_transaction_id, displayId: row.source_transaction_display_id },
      { type: row.linked_object_entity_kind ?? row.linked_object_type, id: row.linked_object_id, displayId: row.linked_object_display_id },
    ];
    for (const candidate of candidates) {
      if (!candidate.type || !candidate.id) continue;
      const key = `${candidate.type}:${candidate.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, type: candidate.type, id: candidate.id, displayId: candidate.displayId });
    }
  }
  return out;
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
    // CLS-UUID-LABEL — same rule as Class below: never fall back to the raw account_id. This one is
    // the more misleading of the two, because the uuid was rendered as the TEXT OF A LINK to the
    // account register, so an unresolvable account looked like a working reference to a real account.
    // The link still uses account_id (that is a route param, not a label); only the visible text changes.
    sortValue: (posting) => posting.account_name || "",
    render: (posting) => (
      <Link
        to={`/accounting/chart-of-accounts/register/${posting.account_id}`}
        className="text-slate-700 hover:underline"
        onClick={(event) => event.stopPropagation()}
      >
        {entityLabel(posting.account_name, posting.account_id, "Account")}
      </Link>
    ),
  },
  {
    key: "class_name",
    label: "Class",
    sortable: true,
    // CLS-UUID-LABEL — never fall back to the raw class_id. A uuid is not a label: it tells the reader
    // nothing, and on a GL screen it reads as if it were the class's real identity. When the name cannot
    // be resolved (the class was archived, or the posting carries a class from outside this entity), the
    // honest render is "—", which says "unclassified" instead of showing a string nobody can act on.
    // Sorting follows the same rule so the column does not order by a hidden uuid the user cannot see.
    sortValue: (posting) => posting.class_name || "",
    render: (posting) => posting.class_name || "—",
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

  const sourceLinksQuery = useQuery({
    queryKey: ["accounting", "journal-entry-source-links", selectedCompanyId, id],
    queryFn: () => getJournalEntrySourceLinks(id, selectedCompanyId!),
    enabled: Boolean(selectedCompanyId && id),
  });

  // LV-JE-DETAIL-COLD-NAV-FALSE-NOT-FOUND: react-query v5 defines isLoading as
  // `isPending && isFetching` (query-core queryObserver.js). detailQuery is deliberately
  // `enabled: Boolean(selectedCompanyId && id)`, and on a cold direct navigation (bookmark, shared
  // link, EntityLink from another tab) selectedCompanyId starts null until CompanyContext's own async
  // company-list fetch resolves — during that window the query is disabled, so isPending=true but
  // isFetching=false, making isLoading FALSE even though the query has never run once. That fell
  // through both guards below straight into "Journal entry not found." for a real, posted JE
  // (live-reproduced 2026-08-18: JE 0e3bdf59-b242-4dd8-8e43-218687184954 showed "not found" on direct
  // nav, then loaded correctly on reload). isPending is the version-correct check: true whenever there
  // is no data yet, whether disabled-and-never-fetched or actively fetching — do not revert to isLoading.
  if (detailQuery.isPending) {
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
  const sourceRows = uniqueSourceRows(sourceLinksQuery.data?.source_links ?? []);
  const chromeLabel = journalEntryChromeLabel(entry);

  return (
    <AccountingSubNavWrapper>
      <PageHeader
        title={chromeLabel}
        backHref="/accounting/journal-entries"
        breadcrumb={[
          { label: "Accounting", href: "/accounting" },
          { label: "Journal Entries", href: "/accounting/journal-entries" },
          { label: chromeLabel },
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
          <span className="text-xs font-semibold text-gray-600">Journal entry type</span>
          <span className="text-sm text-gray-900">
            {entry.journal_entry_type_name || entry.journal_entry_type_code ? (
              <Link
                to="/lists/accounting/journal-entry-types"
                className="text-slate-700 hover:underline"
                data-testid="journal-entry-type-link"
              >
                {entry.journal_entry_type_name ?? entry.journal_entry_type_code}
                {entry.journal_entry_type_code && entry.journal_entry_type_name
                  ? ` (${entry.journal_entry_type_code})`
                  : ""}
              </Link>
            ) : (
              "—"
            )}
          </span>
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
        {entry.matched_bank_transaction_id ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Bank transaction</span>
            <span className="text-sm text-gray-900" data-testid="journal-entry-matched-bank">
              <EntityLink
                kind="bank_transaction"
                id={entry.matched_bank_transaction_id}
                label={entityLabel(entry.matched_bank_transaction_description, entry.matched_bank_transaction_id, "Bank transaction")}
              />
            </span>
          </DataPanelRow>
        ) : null}
      </DataPanel>

      <DataPanel title="Source links">
        {sourceLinksQuery.isError ? (
          <p className="text-sm text-red-600">Could not load source links.</p>
        ) : sourceRows.length === 0 ? (
          <p className="text-sm text-gray-500">No source transactions linked to this journal entry.</p>
        ) : (
          <ul className="space-y-1 text-sm text-gray-900" data-testid="journal-entry-source-links">
            {sourceRows.map((row) => (
              <li key={row.key} className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{row.type}</span>
                <SourceEntityLink type={row.type} id={row.id} label={entityLabel(row.displayId, row.id, "Source")} />
              </li>
            ))}
          </ul>
        )}
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
