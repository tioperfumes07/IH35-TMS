import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listAllChecks, type AllChecksRow } from "../../../api/checks";
import { AccountingSubNavWrapper } from "../AccountingSubNavWrapper";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { Button } from "../../../components/Button";
import { formatDateUS } from "../../../lib/formatDate";
import { formatUsdCents } from "../../../lib/money";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { MultiSelectDropdown } from "../../../components/forms/MultiSelectDropdown";
import { DatePicker } from "../../../components/forms/DatePicker";
import { MoneyListToolbar } from "../../../components/table/MoneyListToolbar";
import { moneyListKpiCard } from "../moneyListKpiCard";
import { FORM_LABEL_STACK_CLASS } from "../../../components/forms/inputClass";

/**
 * Check list (`/accounting/checks`). U6 (owner, 2026-10-03): "Checks list must show all checks with full filters".
 * It used to read only EXPENSE checks; a bill paid by check and a driver settlement paid by check never appeared. It
 * now lists every check the company wrote (GET /api/v1/checks/all), each opening its own document, with multi-select
 * kind / status / bank account filters, a payee / number search, a date range, and sortable headers.
 *
 * FILTER-MULTI-01 — MoneyListToolbar live apply + AccountingSubNavWrapper kpiStrip (V3 board grammar).
 */
const KIND_LABEL: Record<AllChecksRow["kind"], string> = {
  expense: "Check (expense)",
  bill_payment: "Bill payment",
  driver_settlement_payment: "Driver settlement",
};
const STATUS_LABEL: Record<string, string> = { to_print: "To print", issued: "Issued", printed: "Printed", cleared: "Cleared", voided: "Voided", spoiled: "Spoiled" };

function documentHref(row: AllChecksRow): string {
  if (row.kind === "bill_payment") return `/accounting/bill-payments/${row.id}`;
  if (row.kind === "driver_settlement_payment") return "/driver-finance/settlements";
  return `/accounting/checks/${row.id}`;
}

export function CheckListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [kinds, setKinds] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [banks, setBanks] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["checks", "all", companyId, dateFrom, dateTo],
    queryFn: () => listAllChecks(companyId, { date_from: dateFrom || undefined, date_to: dateTo || undefined }),
    enabled: Boolean(companyId),
  });
  const all = query.data?.rows ?? [];

  const bankOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of all) if (r.bank_account_id) seen.set(r.bank_account_id, r.bank_account ?? r.bank_account_id);
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [all]);
  const statusOptions = useMemo(
    () => [...new Set(all.map((r) => r.status))].map((v) => ({ value: v, label: STATUS_LABEL[v] ?? v })),
    [all],
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return all.filter(
      (r) =>
        (kinds.length === 0 || kinds.includes(r.kind)) &&
        (statuses.length === 0 || statuses.includes(r.status)) &&
        (banks.length === 0 || (r.bank_account_id != null && banks.includes(r.bank_account_id))) &&
        (!needle || `${r.check_number ?? ""} ${r.payee ?? ""} ${r.memo ?? ""}`.toLowerCase().includes(needle)),
    );
  }, [all, kinds, statuses, banks, search]);

  const checkKpis = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.totalCents += Number(r.amount_cents ?? 0) || 0;
        if (r.status === "to_print") acc.toPrint += 1;
        if (r.status === "issued" || r.status === "printed") acc.openCount += 1;
        return acc;
      },
      { totalCents: 0, toPrint: 0, openCount: 0 },
    );
  }, [rows]);

  const activeFilterCount =
    (kinds.length > 0 ? 1 : 0) +
    (statuses.length > 0 ? 1 : 0) +
    (banks.length > 0 ? 1 : 0) +
    (dateFrom || dateTo ? 1 : 0);

  const columns: Array<ParityColumn<AllChecksRow>> = [
    {
      key: "check_number", label: "Check #", sortable: true, sortValue: (r) => Number(r.check_number ?? 0),
      render: (r) => <Link to={documentHref(r)} className="text-[var(--accent-green)] underline">{r.check_number ?? "To print"}</Link>,
    },
    { key: "check_date", label: "Date", sortable: true, sortValue: (r) => r.check_date ?? "", render: (r) => (r.check_date ? formatDateUS(r.check_date) : "—") },
    { key: "kind", label: "Type", sortable: true, sortValue: (r) => KIND_LABEL[r.kind], render: (r) => KIND_LABEL[r.kind] },
    { key: "payee", label: "Payee", sortable: true, sortValue: (r) => r.payee ?? "", render: (r) => r.payee ?? "—" },
    { key: "bank_account", label: "Bank account", sortable: true, sortValue: (r) => r.bank_account ?? "", render: (r) => r.bank_account ?? "—" },
    { key: "memo", label: "Memo", sortable: true, sortValue: (r) => r.memo ?? "", render: (r) => r.memo ?? "—" },
    {
      key: "amount_cents", label: "Amount", sortable: true, className: "text-right", cellClass: "text-right",
      sortValue: (r) => Number(r.amount_cents), render: (r) => formatUsdCents(Number(r.amount_cents)),
    },
    { key: "status", label: "Status", sortable: true, sortValue: (r) => STATUS_LABEL[r.status] ?? r.status, render: (r) => STATUS_LABEL[r.status] ?? r.status },
  ];

  const filterBar = (
    <div className="space-y-2 w-full" data-testid="checks-filters">
      <MoneyListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Payee / number / memo"
        searchTestId="checks-search"
        onClearAll={() => {
          setSearch("");
          setKinds([]);
          setStatuses([]);
          setBanks([]);
          setDateFrom("");
          setDateTo("");
        }}
        activeFilterCount={activeFilterCount}
        testIdPrefix="checks"
      >
        <label className={FORM_LABEL_STACK_CLASS}>
          From
          <DatePicker value={dateFrom} onChange={setDateFrom} />
        </label>
        <label className={FORM_LABEL_STACK_CLASS}>
          To
          <DatePicker value={dateTo} onChange={setDateTo} />
        </label>
        <MultiSelectDropdown
          label="Type"
          options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))}
          selected={kinds}
          onChange={setKinds}
          allLabel="All types"
          data-testid="checks-filter-kind"
        />
        <MultiSelectDropdown
          label="Status"
          options={statusOptions}
          selected={statuses}
          onChange={setStatuses}
          allLabel="All statuses"
          data-testid="checks-filter-status"
        />
        <MultiSelectDropdown
          label="Bank account"
          options={bankOptions}
          selected={banks}
          onChange={setBanks}
          allLabel="All bank accounts"
          searchable
          data-testid="checks-filter-bank"
        />
      </MoneyListToolbar>
    </div>
  );

  return (
    <AccountingSubNavWrapper
      title="Checks"
      subtitle="Every check written — expenses, bill payments and driver settlements"
      createControl={
        <div className="flex items-center gap-2">
          <Link to="/accounting/checks/print">
            <Button variant="tertiary">Print checks</Button>
          </Link>
          <Link to="/accounting/checks/new">
            <Button variant="primary">+ Check</Button>
          </Link>
        </div>
      }
      kpiStrip={
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4" data-testid="checks-kpi-strip">
          {query.isError ? (
            <>
              {moneyListKpiCard("Total", "—", "Error loading")}
              {moneyListKpiCard("To print", "—", "Error loading")}
              {moneyListKpiCard("Open", "—", "Error loading")}
              {moneyListKpiCard("Rows", "—", "Error loading")}
            </>
          ) : (
            <>
              {moneyListKpiCard("Total", formatUsdCents(checkKpis.totalCents), `${rows.length} of ${all.length}`)}
              {moneyListKpiCard(
                "To print",
                String(checkKpis.toPrint),
                "Awaiting print",
                checkKpis.toPrint > 0 ? "warn" : "neutral",
              )}
              {moneyListKpiCard("Open", String(checkKpis.openCount), "Issued or printed")}
              {moneyListKpiCard("Rows", String(rows.length), "Matching filters")}
            </>
          )}
        </div>
      }
    >
      {!companyId ? (
        <div className="text-xs text-red-600">Select an operating company in the shell header.</div>
      ) : query.isError ? (
        <ListErrorBanner onRetry={() => void query.refetch()} />
      ) : (
        <div className="rounded border border-gray-200">
          <ParityTable<AllChecksRow>
            title="Checks written"
            columns={columns}
            rows={rows}
            rowKey={(r) => `${r.kind}:${r.id}:${r.check_number ?? ""}`}
            loading={query.isLoading}
            emptyText={all.length === 0 ? "No checks written yet." : "No checks match these filters."}
            storageKey="checks-all"
            filterBar={filterBar}
            suppressToolbarSearch
          />
        </div>
      )}
    </AccountingSubNavWrapper>
  );
}
