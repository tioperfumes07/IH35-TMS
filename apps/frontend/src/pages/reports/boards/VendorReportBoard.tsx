/**
 * Row 83 (11-03 register) — Reports › Vendor report, board docs/design/v3/V3-Reports-Vendors.dc.html.
 * Spend / category / 1099: GET /api/v1/mdata/boards/vendors (party-board.service.ts readVendorBoard — accounting.expenses +
 * expense_lines → catalogs.accounts, accounting.bills, mdata.vendors.vendor_category / eligible_1099).
 * Open bills: GET /api/v1/reports/ap-aging (the canonical A/P aging). No new engine.
 */
import { useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { currentOriginHref, withReturnContext } from "../../../lib/returnContext";
import { getApAgingReport, getVendorBoardReport, type APAgingRow, type PartyBoardRange, type VendorBoardReportRow } from "../../../api/reports";
import { listAllUnits } from "../../../api/mdata";
import { EntityMultiSelect, entityFilterIds } from "../../../components/EntityMultiSelect";
import { MultiSelectDropdown } from "../../../components/forms/MultiSelectDropdown";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink } from "../../../components/shared/EntityLink";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { V3Segmented } from "../../../components/v3/V3Segmented";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { companyToday } from "../../../lib/businessDate";
import { formatCompanyName } from "../../../lib/formatCompanyName";
import { mmmDd } from "../../../lib/formatDate";
import { formatUsdCents } from "../../../lib/money";
import { formatQueryErrorDetail } from "../../../lib/tableError";
import { ReportBoardShell, ReportKpiGrid, ReportMeasuredNote } from "./ReportBoardShell";
import { pct, pctLabel, sumBy } from "./reportBoardGroup";

type View = "spend" | "open" | "category" | "1099";
const VIEW_OPTIONS: Array<{ id: View; label: string }> = [
  { id: "spend", label: "Spend by vendor" },
  { id: "open", label: "Open bills" },
  { id: "category", label: "By category" },
  { id: "1099", label: "1099" },
];
const RANGE_OPTIONS: Array<{ id: PartyBoardRange; label: string }> = [
  { id: "ytd", label: "YTD" },
  { id: "12m", label: "Last 12 months" },
  { id: "all", label: "All time" },
];

type CategoryRow = { key: string; account_id: string | null; category: string; spend_cents: number };

const money = (cents: number) => formatUsdCents(cents);
const name = (n: string | null | undefined) => (n ? formatCompanyName(n) : "Vendor");

/** BOARD 31 — the liability tile's caption: each card account's balance and the as-of date. */
export function cardPayablesSub(rows: Array<{ account_name: string; balance_cents: number }>, asOf?: string): string {
  if (!rows.length) return asOf ? `nothing owed on fuel cards · as of ${mmmDd(asOf)}` : "nothing owed on fuel cards";
  const parts = rows.map((r) => `${r.account_name} ${formatUsdCents(r.balance_cents)}`);
  return asOf ? `${parts.join(" · ")} · as of ${mmmDd(asOf)}` : parts.join(" · ");
}

/** BOARD 31 — drill to the register of the largest card-payable account (the source of the number). */
export function cardPayablesHref(rows: Array<{ account_id: string; balance_cents: number }>): string | undefined {
  const top = [...rows].sort((a, b) => b.balance_cents - a.balance_cents)[0];
  return top ? `/accounting/chart-of-accounts/register/${encodeURIComponent(top.account_id)}` : undefined;
}

export function VendorReportBoard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // ROUND 8.20 board31 — view/range/vendors/categories/units in URL so reverse restores cohort.
  const rangeFromUrl = (searchParams.get("range") ?? "ytd") as PartyBoardRange;
  const range: PartyBoardRange = RANGE_OPTIONS.some((r) => r.id === rangeFromUrl) ? rangeFromUrl : "ytd";
  const viewFromUrl = (searchParams.get("view") ?? "spend") as View;
  const view: View = VIEW_OPTIONS.some((v) => v.id === viewFromUrl) ? viewFromUrl : "spend";
  const vendorIds = searchParams.get("vendors") ?? "";
  const categories = (searchParams.get("categories") ?? "").split(",").filter(Boolean);
  const unitIds = (searchParams.get("units") ?? "").split(",").filter(Boolean);
  const originHref = currentOriginHref(pathname, searchParams.toString() ? `?${searchParams.toString()}` : "");
  const patchUrl = (patch: Record<string, string | null>) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v == null || v === "") p.delete(k);
          else p.set(k, v);
        }
        return p;
      },
      { replace: true },
    );
  };
  const setRange = (next: PartyBoardRange) => patchUrl({ range: next === "ytd" ? null : next });
  const setView = (next: View) => patchUrl({ view: next === "spend" ? null : next });
  const setVendorIds = (next: string) => patchUrl({ vendors: next || null });
  const setCategories = (next: string[]) => patchUrl({ categories: next.length ? next.join(",") : null });
  const setUnitIds = (next: string[]) => patchUrl({ units: next.length ? next.join(",") : null });
  const withRet = (href: string) => withReturnContext(href, originHref);
  const asOf = companyToday();

  const unitsQ = useQuery({
    queryKey: ["vendor-report-units", companyId],
    queryFn: () => listAllUnits({ operating_company_id: companyId }),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });
  const unitOptions = useMemo(
    () =>
      (unitsQ.data?.units ?? [])
        .map((u) => {
          const row = u as { id?: string; unit_number?: string | null };
          return { value: String(row.id ?? ""), label: String(row.unit_number ?? row.id ?? "") };
        })
        .filter((o) => o.value)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [unitsQ.data],
  );

  const board = useQuery({
    queryKey: ["reports", "vendor-board", companyId, range, unitIds.join(",")],
    queryFn: () => getVendorBoardReport(companyId, range, { unitIds }),
    enabled: Boolean(companyId),
    retry: false,
  });
  const ap = useQuery({
    queryKey: ["reports", "vendor-board-ap-aging", companyId, asOf],
    queryFn: () => getApAgingReport(companyId, asOf),
    enabled: Boolean(companyId),
    retry: false,
  });

  const ids = entityFilterIds(vendorIds);
  const categoryOptions = useMemo(
    () => [...new Set((board.data?.rows ?? []).map((r) => r.category ?? "Uncategorized"))].sort().map((c) => ({ value: c, label: c })),
    [board.data?.rows]
  );
  const rows = useMemo(
    () =>
      (board.data?.rows ?? [])
        .filter((r) => !ids.length || ids.includes(r.id))
        .filter((r) => !categories.length || categories.includes(r.category ?? "Uncategorized")),
    [board.data?.rows, ids.join(","), categories]
  );
  const spendRows = useMemo(() => rows.filter((r) => r.txns > 0).sort((a, b) => b.spend_cents - a.spend_cents), [rows]);
  const spend = sumBy(spendRows, (r) => r.spend_cents);
  const apRows = useMemo(() => (ap.data?.rows ?? []).filter((r) => !ids.length || ids.includes(r.vendor_id)), [ap.data?.rows, ids.join(",")]);
  const apTotal = sumBy(apRows, (r) => r.total_open_cents);
  const categoryRows = useMemo<CategoryRow[]>(
    () => (board.data?.by_category ?? []).map((c) => ({ key: c.account_id ?? "none", account_id: c.account_id, category: c.category, spend_cents: c.spend_cents })),
    [board.data?.by_category]
  );
  const categoryTotal = sumBy(categoryRows, (c) => c.spend_cents);
  const rows1099 = useMemo(() => rows.filter((r) => r.eligible_1099), [rows]);
  const savedCategoryCount = rows.filter((r) => r.saved_category).length;

  const vendorCell = (r: { id: string; name: string }) => <EntityLink kind="vendor" id={r.id} label={name(r.name)} />;

  const spendColumns: ParityColumn<VendorBoardReportRow>[] = [
    { key: "name", label: "Vendor", sortable: true, render: vendorCell },
    {
      key: "category",
      label: "Category",
      sortable: true,
      render: (r) =>
        r.saved_category ? r.saved_category : <span className="text-[#94A3B8]" title="Not saved on the vendor — read from the expense account">{r.category ?? "—"}</span>,
    },
    { key: "txns", label: "Transactions", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => String(r.txns) },
    { key: "spend_cents", label: "Spend", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.spend_cents) },
    { key: "share", label: "% of spend", sortable: true, sortValue: (r) => r.spend_cents, cellClass: "text-right", className: "text-right", render: (r) => pctLabel(pct(r.spend_cents, spend)) },
    { key: "open_bills_cents", label: "Open bills", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.open_bills_cents) },
    {
      key: "pays_through",
      label: "Pays through",
      sortable: true,
      // ROUND 8.20 board10/31 — Pays-through is a CoA account, not plain text.
      render: (r) =>
        r.pays_through && r.pays_through_account_id ? (
          <EntityLink kind="account" id={r.pays_through_account_id} label={r.pays_through} />
        ) : (
          (r.pays_through ?? "—")
        ),
    },
    { key: "last_paid", label: "Last", sortable: true, render: (r) => mmmDd(r.last_paid) || "—" },
    {
      key: "expenses",
      label: "Transactions list",
      sortable: true,
      sortValue: (r) => r.txns,
      render: (r) => (
        <Link className="text-[#1D4ED8] hover:underline" to={withRet(`/vendors/${encodeURIComponent(r.id)}`)}>
          Open vendor
        </Link>
      ),
    },
  ];

  const openColumns: ParityColumn<APAgingRow>[] = [
    { key: "vendor_name", label: "Vendor", sortable: true, render: (r) => <EntityLink kind="vendor" id={r.vendor_id} label={name(r.vendor_name)} /> },
    {
      key: "open_bill_count",
      label: "Bills",
      sortable: true,
      cellClass: "text-right",
      className: "text-right",
      render: (r) => (
        <Link className="text-[#1D4ED8] hover:underline" to={withRet(`/accounting/bills?vendor_id=${encodeURIComponent(r.vendor_id)}`)}>
          {r.open_bill_count}
        </Link>
      ),
    },
    { key: "current_cents", label: "Current", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.current_cents) },
    { key: "bucket_1_30_cents", label: "1–30", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.bucket_1_30_cents) },
    { key: "bucket_31_60_cents", label: "31–60", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.bucket_31_60_cents) },
    { key: "bucket_61_90_cents", label: "61–90", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.bucket_61_90_cents) },
    { key: "bucket_91_plus_cents", label: "90+", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.bucket_91_plus_cents) },
    { key: "total_open_cents", label: "Open", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.total_open_cents) },
  ];

  const categoryColumns: ParityColumn<CategoryRow>[] = [
    {
      key: "category",
      label: "Category (expense account)",
      sortable: true,
      render: (c) =>
        c.account_id ? <EntityLink kind="account" id={c.account_id} label={c.category} /> : <span>{c.category}</span>,
    },
    { key: "spend_cents", label: "Spend", sortable: true, cellClass: "text-right", className: "text-right", render: (c) => money(c.spend_cents) },
    { key: "share", label: "% of spend", sortable: true, sortValue: (c) => c.spend_cents, cellClass: "text-right", className: "text-right", render: (c) => pctLabel(pct(c.spend_cents, categoryTotal)) },
    {
      key: "lines",
      label: "Expenses",
      sortable: true,
      sortValue: (c) => c.spend_cents,
      render: (c) => (
        <Link className="text-[#1D4ED8] hover:underline" to={withRet(`/accounting/expenses?expense_account_id=${encodeURIComponent(c.account_id ?? "none")}&date_from=${board.data?.range_from ?? ""}`)}>
          Open expenses
        </Link>
      ),
    },
  ];

  const columns1099: ParityColumn<VendorBoardReportRow>[] = [
    { key: "name", label: "Vendor", sortable: true, render: vendorCell },
    { key: "saved_category", label: "Category", sortable: true, render: (r) => r.saved_category ?? "—" },
    { key: "txns", label: "Transactions", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => String(r.txns) },
    { key: "spend_cents", label: "Paid in range", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.spend_cents) },
  ];

  const xlsx = () => {
    if (view === "open") {
      return {
        filename: "vendor-report-open-bills",
        header: ["Vendor", "Bills", "Current", "1-30", "31-60", "61-90", "90+", "Open"],
        body: apRows.map((r) => [
          name(r.vendor_name),
          r.open_bill_count,
          r.current_cents / 100,
          r.bucket_1_30_cents / 100,
          r.bucket_31_60_cents / 100,
          r.bucket_61_90_cents / 100,
          r.bucket_91_plus_cents / 100,
          r.total_open_cents / 100,
        ]),
      };
    }
    if (view === "category") {
      return { filename: "vendor-report-by-category", header: ["Category", "Spend"], body: categoryRows.map((c) => [c.category, c.spend_cents / 100]) };
    }
    const list = view === "1099" ? rows1099 : spendRows;
    return {
      filename: `vendor-report-${view}`,
      header: ["Vendor", "Category", "Transactions", "Spend", "Open bills", "Last"],
      body: list.map((r) => [name(r.name), r.saved_category ?? r.category ?? "", r.txns, r.spend_cents / 100, r.open_bills_cents / 100, mmmDd(r.last_paid)]),
    };
  };

  return (
    <ReportBoardShell
      id="vendor-report"
      subtitle="spend, open bills and 1099 by vendor · source: expenses + bills (open bills from the canonical A/P aging)"
      xlsx={xlsx}
    >
      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-[#E5E7EB] bg-white px-3 py-2 text-xs" data-testid="vendor-report-filters">
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-[#4B5563]">Date</span>
          <V3Segmented value={range} options={RANGE_OPTIONS} onChange={setRange} testId="vendor-report-range" />
        </label>
        <label className="flex min-w-[12rem] flex-col gap-1 text-[#4B5563]">
          <span className="font-semibold">Vendor</span>
          <EntityMultiSelect
            kind="vendor"
            operatingCompanyId={companyId}
            value={vendorIds || null}
            onChange={(next) => setVendorIds(next ?? "")}
            placeholder="All vendors"
          />
        </label>
        <MultiSelectDropdown
          label="Category"
          options={categoryOptions}
          selected={categories}
          onChange={setCategories}
          allLabel="All categories"
          data-testid="vendor-report-category-filter"
        />
        {/* R6 — board Truck ▾ multi-select; filters expense spend to selected units. */}
        <div className="min-w-[160px]" data-testid="vendor-report-truck-filter">
          <MultiSelectDropdown
            label="Truck"
            options={unitOptions}
            selected={unitIds}
            onChange={setUnitIds}
            allLabel="All trucks"
            data-testid="vendor-report-truck-multiselect"
          />
        </div>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-[#4B5563]">View</span>
          <V3Segmented value={view} options={VIEW_OPTIONS} onChange={setView} testId="vendor-report-view" />
        </label>
      </div>

      {board.isError ? <ListErrorState title="Couldn't load the vendor report" {...formatQueryErrorDetail(board.error)} onRetry={() => void board.refetch()} /> : null}
      {ap.isError ? <ListErrorState title="Couldn't load A/P aging" {...formatQueryErrorDetail(ap.error)} onRetry={() => void ap.refetch()} /> : null}

      <ReportKpiGrid>
        <V3KpiTile testId="vr-kpi-vendors" label="Vendors paid" value={board.data ? String(spendRows.length) : "…"} onClick={() => setView("spend")} />
        <V3KpiTile
          testId="vr-kpi-spend"
          label="Spend"
          value={board.data ? money(spend) : "…"}
          sub={`${sumBy(spendRows, (r) => r.txns)} expenses`}
          onClick={() => setView("spend")}
        />
        <V3KpiTile
          testId="vr-kpi-fuel-share"
          label="Fuel share"
          value={board.data ? pctLabel(board.data.kpis.fuel_share_pct) : "…"}
          sub={board.data ? `${money(board.data.kpis.fuel_cents)} on fuel accounts` : undefined}
          onClick={() => setView("category")}
        />
        <V3KpiTile
          testId="vr-kpi-open-bills"
          label="Open vendor bills"
          value={ap.data ? money(apTotal) : "…"}
          sub={`${sumBy(apRows, (r) => r.open_bill_count)} bills · as of ${mmmDd(asOf)}`}
          onClick={() => setView("open")}
        />
        {/* BOARD 31 (LEAD ROUND 8.25) — Card payables = what the company OWES the fuel-card issuers now (Dreamline 2510,
            WEX 2520 credit balances from readCardPayableBalances), never fuel SPEND. Fail-old (live): the tile showed
            kpis.fuel_cents — period fuel expense — under a liability label. Drills to the card-payable account register. */}
        <V3KpiTile
          testId="vr-kpi-card-payables"
          label="Card payables"
          value={board.data ? money(board.data.kpis.card_payables_cents ?? 0) : "…"}
          sub={cardPayablesSub(board.data?.card_payables ?? [], board.data?.card_payables_as_of)}
          href={cardPayablesHref(board.data?.card_payables ?? [])}
        />
      </ReportKpiGrid>

      {view === "spend" ? (
        <ParityTable
          rows={spendRows}
          title={`Spend by vendor · ${spendRows.length} vendors`}
          columns={spendColumns}
          rowKey={(r) => r.id}
          loading={board.isPending}
          storageKey="vendor-report-spend"
          emptyText="No vendor spend in this range."
          exportFilename="vendor-report-spend"
          exportExcel
          footerCells={{
            name: <span className="font-semibold text-[#111827]">Totals ({spendRows.length})</span>,
            txns: String(sumBy(spendRows, (r) => r.txns)),
            spend_cents: money(spend),
            open_bills_cents: money(sumBy(spendRows, (r) => r.open_bills_cents)),
          }}
        />
      ) : null}
      {view === "open" ? (
        <ParityTable
          rows={apRows}
          title={`Open bills · as of ${mmmDd(asOf)} · by due date`}
          columns={openColumns}
          rowKey={(r) => r.vendor_id}
          loading={ap.isPending}
          storageKey="vendor-report-open"
          emptyText="No open vendor bills."
          exportFilename="vendor-report-open-bills"
          exportExcel
          footerCells={{
            vendor_name: <span className="font-semibold text-[#111827]">Totals ({apRows.length})</span>,
            open_bill_count: String(sumBy(apRows, (r) => r.open_bill_count)),
            current_cents: money(sumBy(apRows, (r) => r.current_cents)),
            bucket_1_30_cents: money(sumBy(apRows, (r) => r.bucket_1_30_cents)),
            bucket_31_60_cents: money(sumBy(apRows, (r) => r.bucket_31_60_cents)),
            bucket_61_90_cents: money(sumBy(apRows, (r) => r.bucket_61_90_cents)),
            bucket_91_plus_cents: money(sumBy(apRows, (r) => r.bucket_91_plus_cents)),
            total_open_cents: money(apTotal),
          }}
        />
      ) : null}
      {view === "category" ? (
        <ParityTable
          rows={categoryRows}
          title="Spend by category (expense account)"
          columns={categoryColumns}
          rowKey={(c) => c.key}
          loading={board.isPending}
          storageKey="vendor-report-category"
          emptyText="No categorized spend in this range."
          exportFilename="vendor-report-by-category"
          exportExcel
          footerCells={{
            category: <span className="font-semibold text-[#111827]">Totals ({categoryRows.length})</span>,
            spend_cents: money(categoryTotal),
          }}
        />
      ) : null}
      {view === "1099" ? (
        <ParityTable
          rows={rows1099}
          title="Vendors flagged 1099 on the vendor record"
          columns={columns1099}
          rowKey={(r) => r.id}
          loading={board.isPending}
          storageKey="vendor-report-1099"
          emptyText="No vendor is flagged 1099 on its vendor record."
          exportFilename="vendor-report-1099"
          exportExcel
          footerCells={{
            name: <span className="font-semibold text-[#111827]">Totals ({rows1099.length})</span>,
            spend_cents: money(sumBy(rows1099, (r) => r.spend_cents)),
          }}
        />
      ) : null}

      {board.data ? (
        <ReportMeasuredNote>
          {savedCategoryCount} of {rows.length} vendors have a category saved (grey categories are read from the expense
          account until set); {rows1099.length} vendors are flagged 1099. Card payables (fuel cards) post as card
          liabilities, not vendor bills, so they are not in Open bills. Each vendor opens its profile; each bill count opens its bills.
        </ReportMeasuredNote>
      ) : null}
    </ReportBoardShell>
  );
}
