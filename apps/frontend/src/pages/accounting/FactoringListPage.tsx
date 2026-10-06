import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { formatDateUS } from "../../lib/formatDate";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { listFactoringAdvances, type FactoringAdvance } from "../../api/accounting";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SubmitFactoringModal } from "./SubmitFactoringModal";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { EntityPicker } from "../../components/EntityPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useUrlSort } from "../../hooks/useUrlSort";
import { MoneyListToolbar } from "../../components/table/MoneyListToolbar";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { formatUsdCents } from "../../lib/money";
import { FACTORING_TAB_PATH } from "../../router/route-manifest";

const STATUS_OPTIONS: Array<{ value: "all" | "active" | FactoringAdvance["status"]; label: string }> = [
  { value: "active", label: "Active (hide voided)" },
  { value: "all", label: "All (include voided)" },
  { value: "submitted", label: "Submitted" },
  { value: "advanced", label: "Advanced" },
  { value: "reserve_held", label: "Reserve Held" },
  { value: "collected", label: "Collected" },
  { value: "released", label: "Released" },
  { value: "recourse_returned", label: "Recourse" },
  { value: "voided", label: "Voided" },
];

// GLB-05 -- delegates to the canonical formatter instead of reimplementing an identical
// local currency formatter (same shape lib/money.ts already covers).
function money(cents: number) {
  return formatUsdCents(cents);
}

function statusPill(status: FactoringAdvance["status"]) {
  const base = "rounded-sm px-2 py-0.5 text-section-header font-semibold uppercase tracking-wide";
  if (status === "advanced") return `${base} bg-slate-100 text-slate-700 border border-slate-300`;
  if (status === "reserve_held" || status === "collected") return `${base} bg-slate-50 text-slate-600 border border-slate-200`;
  if (status === "released") return `${base} bg-slate-100 text-slate-700 border border-slate-200`;
  if (status === "recourse_returned") return `${base} bg-red-50 text-red-700 border border-red-200`;
  if (status === "voided") return `${base} bg-slate-100 text-slate-500 border border-slate-200 line-through`;
  return `${base} bg-slate-50 text-slate-700 border border-slate-200`;
}

export function FactoringListPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  // LINK-F5171/LINK-F5184: factoring:accounting.list reverse — a load can drill into its own
  // advance batch(es) via ?load_id=, filtered server-side through the invoice FK.
  // LST-F5203 — visible Load EntityPicker must also write ?load_id= (seed-only was not enough).
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkLoadId = searchParams.get("load_id");
  function patchLoadFilter(next: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set("load_id", next);
        else params.delete("load_id");
        return params;
      },
      { replace: true },
    );
  }
  // BANK-SORT-ROLLOUT-ACCT: ?sort=&dir= URL persistence (same as Bills/Expenses).
  const { sortKey, sortDirection, onSortChange } = useUrlSort();
  // GO-23 row16 (owner FINISH LAW 2026-09-03): voided hidden by default, same convention as
  // Bills/Expenses/Invoices/Payments lists (all default status="active").
  // U12 (owner UI register 2026-10-03) — status is a multi-select; default Active; none picked = every status.
  // 432-CUR #1 — MoneyListToolbar always visible; retired the Filters (N) popover.
  const [status, setStatus] = useState<Array<"all" | "active" | FactoringAdvance["status"]>>(["active"]);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [submitOpen, setSubmitOpen] = useState(false);

  const query = useQuery({
    queryKey: ["accounting", "factoring-advances", selectedCompanyId, status, search, fromDate, toDate, deepLinkLoadId],
    queryFn: () =>
      listFactoringAdvances(selectedCompanyId!, {
        status,
        search: search || undefined,
        date_from: fromDate || undefined,
        date_to: toDate || undefined,
        load_id: deepLinkLoadId ?? undefined,
      }),
    enabled: Boolean(selectedCompanyId),
  });

  const rows = query.data?.rows ?? [];

  const columns = useMemo<ParityColumn<FactoringAdvance>[]>(
    () => [
      {
        key: "display_id",
        label: "Batch #",
        sortable: true,
        render: (row) => (
          <EntityLink
            kind="factoring_advance"
            id={row.id}
            label={entityLabel(row.display_id, row.id, "Advance")}
          />
        ),
      },
      { key: "submitted_at", label: "Submitted", sortable: true, render: (row) => formatDateUS(row.submitted_at) },
      { key: "factoring_company_name", label: "Factor", sortable: true },
      { key: "invoice_count", label: "Invoices", sortable: true },
      { key: "invoice_total_cents", label: "Total", sortable: true, render: (row) => money(row.invoice_total_cents) },
      { key: "advance_amount_cents", label: "Advanced", sortable: true, render: (row) => money(row.advance_amount_cents) },
      { key: "reserve_amount_cents", label: "Reserve", sortable: true, render: (row) => money(row.reserve_amount_cents) },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (row) => <span className={statusPill(row.status)}>{row.status.replaceAll("_", " ")}</span>,
      },
    ],
    [],
  );

  if (query.isError) {
    return (
      <AccountingSubNavWrapper title="Factoring" subtitle="Track factoring submissions, reserves, and releases" actions={<Button onClick={() => navigate(FACTORING_TAB_PATH.submit_invoice)}>+ Submit to Factor</Button>}>
        <ListErrorState
          title="Couldn't load factoring advances"
          status={0}
          message={(query.error as Error | undefined)?.message}
          onRetry={() => void query.refetch()}
        />
      </AccountingSubNavWrapper>
    );
  }

  const factoringActiveFilterCount =
    (status.length === 1 && status[0] === "active" ? 0 : status.length ? 1 : 0) + (fromDate || toDate ? 1 : 0) + (deepLinkLoadId ? 1 : 0);

  const filterBar = (
    <MoneyListToolbar
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="FAC-2026-00012"
      searchTestId="factoring-search-input"
      onClearAll={() => {
        setSearch("");
        setStatus(["active"]);
        setFromDate("");
        setToDate("");
        patchLoadFilter("");
      }}
      activeFilterCount={factoringActiveFilterCount}
      testIdPrefix="factoring"
    >
      <label className="flex flex-col gap-1 text-xs text-slate-600" data-testid="factoring-entity-filters">
        Load
        <EntityPicker
          kind="load"
          operatingCompanyId={selectedCompanyId ?? ""}
          value={deepLinkLoadId || null}
          onChange={(next) => patchLoadFilter(next ?? "")}
          allowCreate={false}
          placeholder="All loads"
          dataTestId="factoring-filter-load"
        />
      </label>
      <MultiSelectDropdown
        label="Status"
        options={STATUS_OPTIONS.filter((option) => option.value !== "all").map((option) => ({ value: option.value, label: option.label }))}
        selected={status}
        onChange={(next) => setStatus(next as Array<"all" | "active" | FactoringAdvance["status"]>)}
        allLabel="All (include voided)"
        data-testid="factoring-status-filter"
      />
      <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
        Date from
        <DatePicker value={fromDate} onChange={setFromDate} className="h-9" />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
        Date to
        <DatePicker value={toDate} onChange={setToDate} className="h-9" />
      </label>
    </MoneyListToolbar>
  );

  return (
    <AccountingSubNavWrapper title="Factoring" subtitle="Track factoring submissions, reserves, and releases" actions={<Button onClick={() => navigate(FACTORING_TAB_PATH.submit_invoice)}>+ Submit to Factor</Button>}>

      {filterBar}

      {/* R-102-B item 5 — owner: "a list that silently hides is the same class of defect as a
          badge that never renders." Company-wide, independent of every non-status filter. */}
      {status.length === 1 && status[0] === "active" && typeof query.data?.voided_count === "number" && query.data.voided_count > 0 ? (
        <p className="text-xs text-gray-500" data-testid="factoring-voided-count">
          {rows.length} live, {query.data.voided_count} voided (hidden)
        </p>
      ) : null}

      <ParityTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={query.isPending || (query.isFetching && rows.length === 0)}
        onRowClick={(row) => navigate(`/accounting/factoring/${row.id}`)}
        suppressToolbarSearch
        exportFilename="factoring-advances"
        storageKey="factoring-list"
        initialPageSize={50}
        pageSizeOptions={[50, 75, 100, 200, 300]}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
        emptyText="No factoring batches for selected filters."
      />

      {selectedCompanyId ? (
        <SubmitFactoringModal
          open={submitOpen}
          operatingCompanyId={selectedCompanyId}
          onClose={() => setSubmitOpen(false)}
          onCreated={(batchId) => {
            setSubmitOpen(false);
            void query.refetch();
            navigate(`/accounting/factoring/${batchId}`);
          }}
        />
      ) : null}
    </AccountingSubNavWrapper>
  );
}
