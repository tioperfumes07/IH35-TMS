import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  getEscrowDriverBalances,
  getEscrowLedger,
  ESCROW_POSTING_TYPES,
  type EscrowLedgerRow,
  type EscrowPostingType,
} from "../../../api/banking";
import { MultiSelectDropdown } from "../../../components/forms/MultiSelectDropdown";
import { DatePicker } from "../../../components/forms/DatePicker";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel, visibleDocumentLabel } from "../../../lib/entity-label";
import { formatDateUS } from "../../../lib/formatDate";
import { RegisterToolbar } from "./RegisterToolbar";
import { useListState } from "../../../components/list-state";
import {
  BankingControlBox,
  BankingControlGroup,
  BankingControlSegment,
  BANKING_CONTROL_LABEL_CLASS,
  bankingControlBoxClass,
} from "./BankingControlBox";

type Props = {
  operatingCompanyId: string;
  driverEscrowBalance: number;
};

const POSTING_TYPE_LABEL: Record<EscrowPostingType, string> = {
  deposit: "Deposit",
  release: "Release",
  adjustment: "Adjustment",
  forfeiture: "Forfeiture",
};

type ClearedFilter = "all" | "cleared" | "uncleared";
type StatusFilter = "all" | "active" | "closed";

// ROUND 197.1 — QuickBooks-parity date presets. Computed in UTC (matches the rest of this file's
// date handling) at click time, never persisted as a stale precomputed range.
function presetRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (preset) {
    case "this_month":
      return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) };
    case "last_month":
      return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
    case "this_quarter": {
      const q = Math.floor(m / 3);
      return { from: iso(new Date(Date.UTC(y, q * 3, 1))), to: iso(new Date(Date.UTC(y, q * 3 + 3, 0))) };
    }
    case "last_quarter": {
      const q = Math.floor(m / 3) - 1;
      return { from: iso(new Date(Date.UTC(y, q * 3, 1))), to: iso(new Date(Date.UTC(y, q * 3 + 3, 0))) };
    }
    case "this_year":
      return { from: iso(new Date(Date.UTC(y, 0, 1))), to: iso(new Date(Date.UTC(y, 11, 31))) };
    case "last_year":
      return { from: iso(new Date(Date.UTC(y - 1, 0, 1))), to: iso(new Date(Date.UTC(y - 1, 11, 31))) };
    default:
      return { from: "", to: "" };
  }
}

const DATE_PRESETS: Array<{ id: string; label: string }> = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "this_quarter", label: "This quarter" },
  { id: "last_quarter", label: "Last quarter" },
  { id: "this_year", label: "This year" },
  { id: "last_year", label: "Last year" },
];

function dollarsToCents(dollars: number | null): number | undefined {
  return dollars == null ? undefined : Math.round(dollars * 100);
}

export function DriverEscrowTabContent({ operatingCompanyId, driverEscrowBalance }: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [dateFrom, setDateFrom] = useState(() => searchParams.get("from") ?? "");
  const [dateTo, setDateTo] = useState(() => searchParams.get("to") ?? "");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>(() => {
    const raw = searchParams.get("driver_id");
    return raw ? raw.split(",").filter(Boolean) : [];
  });
  // LINK-F5171 reverse_link — the deep link from a driver's own profile
  // (/banking/driver-escrow?driver_id=<id>) is read on load above; this keeps it a two-way,
  // bookmarkable/shareable URL by writing selectedDriverIds back out whenever it changes (multi-
  // select encodes as a comma-separated driver_id, single-driver case unchanged from before).
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (selectedDriverIds.length) next.set("driver_id", selectedDriverIds.join(","));
        else next.delete("driver_id");
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDriverIds]);
  const [selectedTypes, setSelectedTypes] = useState<EscrowPostingType[]>([]);
  const [amountMinInput, setAmountMinInput] = useState<number | null>(null);
  const [amountMaxInput, setAmountMaxInput] = useState<number | null>(null);
  const [clearedFilter, setClearedFilter] = useState<ClearedFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const driverBalancesQuery = useQuery({
    queryKey: ["banking", "escrow", "drivers", operatingCompanyId],
    queryFn: () => getEscrowDriverBalances(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });
  const driverOptions = useMemo(
    () =>
      (driverBalancesQuery.data?.drivers ?? []).map((d) => ({
        value: d.driver_id,
        label: entityLabel(d.driver_name, d.driver_id, "Driver"),
      })),
    [driverBalancesQuery.data?.drivers],
  );

  const amountMinCents = dollarsToCents(amountMinInput);
  const amountMaxCents = dollarsToCents(amountMaxInput);

  const ledgerQuery = useQuery({
    queryKey: [
      "banking",
      "escrow",
      "ledger",
      operatingCompanyId,
      dateFrom,
      dateTo,
      selectedDriverIds.join(","),
      selectedTypes.join(","),
      amountMinCents ?? "",
      amountMaxCents ?? "",
      clearedFilter,
      statusFilter,
    ],
    queryFn: () =>
      getEscrowLedger(operatingCompanyId, {
        from: dateFrom || undefined,
        to: dateTo || undefined,
        driverIds: selectedDriverIds.length ? selectedDriverIds : undefined,
        types: selectedTypes.length ? selectedTypes : undefined,
        amountMinCents,
        amountMaxCents,
        cleared: clearedFilter === "all" ? undefined : clearedFilter,
        accountStatus: statusFilter === "all" ? undefined : statusFilter,
      }),
    enabled: Boolean(operatingCompanyId),
  });

  const tableRows = ledgerQuery.data?.rows ?? [];
  const listState = useListState(ledgerQuery, tableRows.length === 0);

  // ROUND 197.1 — the header total is derived from the SAME filtered query as the rows, computed
  // server-side over the whole filtered set (not just the rendered page). It follows every filter
  // change; it is never the unfiltered account balance rendered as if it answered the filter.
  const filteredTotal = (ledgerQuery.data?.total_amount_cents ?? 0) / 100;
  const filteredCount = ledgerQuery.data?.total_count ?? 0;
  const isFiltered =
    Boolean(dateFrom || dateTo) ||
    selectedDriverIds.length > 0 ||
    selectedTypes.length > 0 ||
    amountMinCents != null ||
    amountMaxCents != null ||
    clearedFilter !== "all" ||
    statusFilter !== "all";

  function applyPreset(id: string) {
    const r = presetRange(id);
    setDateFrom(r.from);
    setDateTo(r.to);
    setActivePreset(id);
    setShowPresets(false);
  }

  function clearAll() {
    setDateFrom("");
    setDateTo("");
    setActivePreset(null);
    setSelectedDriverIds([]);
    setSelectedTypes([]);
    setAmountMinInput(null);
    setAmountMaxInput(null);
    setClearedFilter("all");
    setStatusFilter("all");
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("driver_id");
      next.delete("from");
      next.delete("to");
      return next;
    }, { replace: true });
  }

  // Removable chips — one per active dimension, so the operator can see what's applied without
  // opening the panel (owner requirement). A driver/type chip removes just that one value.
  type Chip = { key: string; label: string; onRemove: () => void };
  const chips: Chip[] = [];
  if (dateFrom || dateTo) {
    const label = activePreset
      ? DATE_PRESETS.find((p) => p.id === activePreset)?.label ?? "Date range"
      : `${dateFrom || "…"} – ${dateTo || "…"}`;
    chips.push({
      key: "date",
      label,
      onRemove: () => {
        setDateFrom("");
        setDateTo("");
        setActivePreset(null);
      },
    });
  }
  for (const id of selectedDriverIds) {
    const opt = driverOptions.find((o) => o.value === id);
    chips.push({
      key: `driver-${id}`,
      label: opt?.label ?? entityLabel(undefined, id, "Driver"),
      onRemove: () => setSelectedDriverIds((prev) => prev.filter((d) => d !== id)),
    });
  }
  for (const t of selectedTypes) {
    chips.push({
      key: `type-${t}`,
      label: POSTING_TYPE_LABEL[t],
      onRemove: () => setSelectedTypes((prev) => prev.filter((x) => x !== t)),
    });
  }
  if (amountMinCents != null || amountMaxCents != null) {
    chips.push({
      key: "amount",
      label: `Amount ${amountMinInput ?? "0"}–${amountMaxInput ?? "∞"}`,
      onRemove: () => {
        setAmountMinInput(null);
        setAmountMaxInput(null);
      },
    });
  }
  if (clearedFilter !== "all") {
    chips.push({
      key: "cleared",
      label: clearedFilter === "cleared" ? "Cleared" : "Uncleared",
      onRemove: () => setClearedFilter("all"),
    });
  }
  if (statusFilter !== "all") {
    chips.push({
      key: "status",
      label: statusFilter === "active" ? "Active accounts" : "Closed accounts",
      onRemove: () => setStatusFilter("all"),
    });
  }

  const columns = useMemo<ParityColumn<EscrowLedgerRow>[]>(
    () => [
      { key: "created_at", label: "Date", render: (row) => formatDateUS(row.created_at) },
      {
        key: "driver_name",
        label: "Driver",
        render: (row) => (
          <Link to={`/drivers/${row.driver_id}`} className="text-[#1F2A44] hover:underline">
            {entityLabel(row.driver_name, row.driver_id, "Driver")}
          </Link>
        ),
      },
      {
        key: "entry_type",
        label: "Type",
        render: (row) => POSTING_TYPE_LABEL[row.entry_type as EscrowPostingType] ?? String(row.entry_type ?? ""),
      },
      { key: "memo", label: "Description", render: (row) => String(row.memo ?? "") },
      {
        key: "amount",
        label: "Amount",
        cellClass: "text-[#1F2A44]",
        render: (row) => `$${Number(row.amount ?? 0).toFixed(2)}`,
      },
      {
        key: "cleared",
        label: "Status",
        render: (row) =>
          row.cleared ? (
            <span className="rounded-sm bg-[#F7F8FA] px-1.5 py-0.5 text-[11px] font-semibold text-[#1F2A44]">Cleared</span>
          ) : (
            <span className="text-[11px] text-[#6B7280]">Uncleared</span>
          ),
      },
      {
        key: "settlement_id",
        label: "Settlement",
        render: (row) => {
          const sid = String(row.settlement_id ?? "").trim();
          if (!sid) return <span className="text-xs text-[#6B7280]">—</span>;
          return (
            <EntityLink
              kind="settlement"
              id={sid}
              label={visibleDocumentLabel(String(row.settlement_display_id ?? "") || null, sid, "Settlement")}
              data-testid="banking-escrow-settlement-link"
            />
          );
        },
      },
      {
        key: "journal_entry_id",
        label: "Journal Entry",
        render: (row) => {
          const jeId = String(row.journal_entry_id ?? "").trim();
          if (!jeId) return <span className="text-xs text-[#6B7280]">—</span>;
          return (
            <EntityLink
              kind="journal_entry"
              id={jeId}
              label={visibleDocumentLabel(String(row.journal_entry_memo ?? "") || null, jeId, "Journal entry")}
              data-testid="banking-escrow-journal-entry-link"
            />
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      {ledgerQuery.isSuccess && listState.isEmpty && Number(driverEscrowBalance ?? 0) === 0 && !isFiltered ? (
        <div
          className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#1F2A44]"
          data-testid="banking-escrow-empty-honesty-banner"
        >
          <p className="font-semibold">Driver Escrow shows $0 with no ledger rows and no per-driver balances.</p>
          <p className="mt-1">
            Escrow is a liability virtual bank — empty is not "healthy zero" until settlements / deductions / holdbacks
            post into escrow and appear here. Cross-check Settlements and for-review bank rows that may be escrow-related
            but still unmatched.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link to="/driver-finance/settlements" className="font-medium text-[#1F2A44] underline">
              Settlements
            </Link>
            <Link to="/banking/transactions?type=uncategorized" className="font-medium text-[#1F2A44] underline">
              For-review Match/Categorize
            </Link>
          </div>
        </div>
      ) : null}

      <div className="rounded-sm border border-[#E5E7EB] bg-white p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2">
            <p className={BANKING_CONTROL_LABEL_CLASS}>Escrow virtual account balance (current, unfiltered)</p>
            <p className="mt-1 text-page-title font-semibold text-[#0F1219]">${Number(driverEscrowBalance ?? 0).toFixed(2)}</p>
          </div>
          <div className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2" data-testid="banking-escrow-filtered-total">
            <p className={BANKING_CONTROL_LABEL_CLASS}>{isFiltered ? "Filtered postings total" : "All postings total"}</p>
            <p className="mt-1 text-page-title font-semibold text-[#0F1219]">
              ${filteredTotal.toFixed(2)} <span className="text-xs font-normal text-[#6B7280]">across {filteredCount} posting(s)</span>
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-sm border border-[#E5E7EB] bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-7 items-center gap-1">
            <label htmlFor="escrow-date-from" className={BANKING_CONTROL_LABEL_CLASS}>
              From
            </label>
            <DatePicker
              id="escrow-date-from"
              value={dateFrom}
              onChange={(v) => {
                setDateFrom(v);
                setActivePreset(null);
              }}
              className="h-7 w-[130px]"
            />
            <label htmlFor="escrow-date-to" className={BANKING_CONTROL_LABEL_CLASS}>
              To
            </label>
            <DatePicker
              id="escrow-date-to"
              value={dateTo}
              onChange={(v) => {
                setDateTo(v);
                setActivePreset(null);
              }}
              className="h-7 w-[130px]"
            />
            <div className="relative">
              <BankingControlBox onClick={() => setShowPresets((v) => !v)} data-testid="banking-escrow-presets-button">
                Presets ▾
              </BankingControlBox>
              {showPresets ? (
                <div className="absolute left-0 z-20 mt-1 w-48 rounded-sm border border-[#E5E7EB] bg-white p-2 shadow-sm">
                  <div className="flex flex-wrap gap-1">
                    {DATE_PRESETS.map((p) => (
                      <BankingControlBox
                        key={p.id}
                        className="!h-6 px-1.5 text-xs"
                        active={activePreset === p.id}
                        onClick={() => applyPreset(p.id)}
                      >
                        {p.label}
                      </BankingControlBox>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div data-testid="banking-escrow-driver-filter">
            <MultiSelectDropdown
              label="Driver"
              options={driverOptions}
              selected={selectedDriverIds}
              onChange={setSelectedDriverIds}
              allLabel="All drivers"
              searchable
              searchPlaceholder="Type a driver name…"
              triggerClassName={bankingControlBoxClass({ active: selectedDriverIds.length > 0 })}
              className="mt-0"
              data-testid="banking-escrow-driver-filter-dropdown"
            />
          </div>

          <div data-testid="banking-escrow-type-filter">
            <MultiSelectDropdown
              label="Transaction type"
              options={ESCROW_POSTING_TYPES.map((t) => ({ value: t, label: POSTING_TYPE_LABEL[t] }))}
              selected={selectedTypes}
              onChange={(next) => setSelectedTypes(next as EscrowPostingType[])}
              allLabel="All transaction types"
              triggerClassName={bankingControlBoxClass({ active: selectedTypes.length > 0 })}
              className="mt-0"
              data-testid="banking-escrow-type-filter-dropdown"
            />
          </div>

          <div className="flex h-7 items-center gap-1">
            <label htmlFor="escrow-amount-min" className={BANKING_CONTROL_LABEL_CLASS}>
              Amount
            </label>
            <MoneyInput
              id="escrow-amount-min"
              valueDollars={amountMinInput}
              onChangeDollars={setAmountMinInput}
              ariaLabel="Minimum amount (USD)"
              placeholder="Min"
              className="w-[80px]"
            />
            <span className="text-[#6B7280]">–</span>
            <MoneyInput
              id="escrow-amount-max"
              valueDollars={amountMaxInput}
              onChangeDollars={setAmountMaxInput}
              ariaLabel="Maximum amount (USD)"
              placeholder="Max"
              className="w-[80px]"
            />
          </div>

          <div className="flex h-7 items-center gap-1">
            <span className={BANKING_CONTROL_LABEL_CLASS}>Status</span>
            <BankingControlGroup>
              {(["all", "active", "closed"] as const).map((s) => (
                <BankingControlSegment key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                  {s === "all" ? "All" : s === "active" ? "Active" : "Closed"}
                </BankingControlSegment>
              ))}
            </BankingControlGroup>
          </div>

          <div className="flex h-7 items-center gap-1">
            <span className={BANKING_CONTROL_LABEL_CLASS}>Cleared</span>
            <BankingControlGroup>
              {(["all", "cleared", "uncleared"] as const).map((c) => (
                <BankingControlSegment key={c} active={clearedFilter === c} onClick={() => setClearedFilter(c)}>
                  {c === "all" ? "All" : c === "cleared" ? "Cleared" : "Uncleared"}
                </BankingControlSegment>
              ))}
            </BankingControlGroup>
          </div>

          <BankingControlBox
            className="ml-auto"
            disabled={!isFiltered}
            onClick={clearAll}
            data-testid="banking-escrow-clear-all"
          >
            Clear all
          </BankingControlBox>
        </div>

        {chips.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="banking-escrow-filter-chips">
            {chips.map((chip) => (
              <span
                key={chip.key}
                className="flex h-6 items-center gap-1 rounded-sm border border-[#14314F] bg-[#14314F] px-2 text-[11px] font-medium text-white"
              >
                {chip.label}
                <button
                  type="button"
                  className="ml-0.5 text-white/80 hover:text-white"
                  onClick={chip.onRemove}
                  aria-label={`Remove filter: ${chip.label}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-3">
          <RegisterToolbar rowCount={tableRows.length} onRefresh={() => void ledgerQuery.refetch()} />
        </div>

        {listState.isError ? (
          <div className="mt-2">
            <ListErrorBanner message="Failed to load the escrow ledger. Try refreshing." onRetry={() => void ledgerQuery.refetch()} />
          </div>
        ) : null}

        <div className="mt-2">
          <ParityTable
            columns={columns}
            rows={tableRows}
            rowKey={(row) => String(row.id ?? "")}
            loading={listState.isLoading}
            storageKey="banking-driver-escrow-ledger"
            tableTestId="driver-escrow-ledger-table"
            emptyText={listState.isEmpty ? "No escrow ledger rows found for this filter." : undefined}
            onRowClick={(row) => navigate(`/drivers/${row.driver_id}`)}
          />
        </div>
      </div>
    </div>
  );
}
