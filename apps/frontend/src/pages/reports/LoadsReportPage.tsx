import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { getLoadsReport, type LoadsReportDateField, type LoadsReportRow } from "../../api/reports";
import { searchCustomersAutocomplete } from "../../api/mdata";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ReportsSubNav } from "./ReportsSubNav";
import { ReportFilterBar } from "../../components/reports/ReportFilterBar";
import { useStagedListFilters } from "../../components/table";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityPicker } from "../../components/EntityPicker";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { SelectCombobox } from "../../components/Combobox";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { entityLabel } from "../../lib/entity-label";
import { formatUsdCents } from "../../lib/money";
import { formatDateQboList } from "../../lib/formatDate";

function money(cents: number) {
  if (!cents) return "—";
  return formatUsdCents(cents);
}

function miles(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function laneLabel(row: LoadsReportRow) {
  const from = [row.origin_city, row.origin_state].filter(Boolean).join(", ");
  const to = [row.destination_city, row.destination_state].filter(Boolean).join(", ");
  if (!from && !to) return "—";
  return `${from || "—"} → ${to || "—"}`;
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

type LoadsReportFilters = {
  start: string;
  end: string;
  dateField: LoadsReportDateField;
  customerId: string;
  driverId: string;
  unitId: string;
  trailerId: string;
  status: string;
  tripType: string;
  factoringStatus: string;
};

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "booked", label: "Booked" },
  { value: "dispatched", label: "Dispatched" },
  { value: "in_transit", label: "In transit" },
  { value: "delivered", label: "Delivered" },
  { value: "delivered_pending_docs", label: "Delivered pending docs" },
  { value: "completed_docs_received", label: "Completed docs received" },
  { value: "closed", label: "Closed" },
  { value: "invoiced", label: "Invoiced" },
  { value: "paid", label: "Paid" },
];

export function LoadsReportPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const emptyFilters: LoadsReportFilters = {
    ...currentMonthRange(),
    dateField: "created",
    customerId: "",
    driverId: "",
    unitId: "",
    trailerId: "",
    status: "",
    tripType: "",
    factoringStatus: "",
  };
  const [applied, setApplied] = useState(emptyFilters);
  const staged = useStagedListFilters({ applied, empty: emptyFilters, onApply: setApplied });
  const [reportSearch, setReportSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");

  const customersQuery = useQuery({
    queryKey: ["loads-report-customers", companyId, customerSearch],
    queryFn: () => searchCustomersAutocomplete(companyId, customerSearch, { limit: 50 }),
    enabled: Boolean(companyId),
    staleTime: 15_000,
  });

  const customerOptions = useMemo(
    () =>
      (customersQuery.data ?? []).map((c) => ({
        value: c.id,
        label: entityLabel(c.display_name, c.id, "Customer"),
      })),
    [customersQuery.data]
  );

  const query = useQuery({
    queryKey: ["reports", "loads", companyId, applied],
    queryFn: () =>
      getLoadsReport({
        operating_company_id: companyId,
        from: applied.start,
        to: applied.end,
        date_field: applied.dateField,
        customer_id: applied.customerId || undefined,
        driver_id: applied.driverId || undefined,
        unit_id: applied.unitId || undefined,
        trailer_id: applied.trailerId || undefined,
        status: applied.status || undefined,
        trip_type: applied.tripType || undefined,
        factoring_status: applied.factoringStatus || undefined,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const filtered = useMemo(() => {
    const rows = query.data?.rows ?? [];
    const q = reportSearch.toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        String(r.load_number ?? "").toLowerCase().includes(q) ||
        String(r.customer_name ?? "").toLowerCase().includes(q) ||
        String(r.driver_name ?? "").toLowerCase().includes(q) ||
        String(r.unit_number ?? "").toLowerCase().includes(q)
      );
    });
  }, [query.data?.rows, reportSearch]);

  const columns = useMemo<ParityColumn<LoadsReportRow>[]>(
    () => [
      {
        key: "load_number",
        label: "Load",
        sortable: true,
        render: (row) => <EntityLink kind="load" id={row.load_id} label={entityLabel(row.load_number, row.load_id, "Load")} />,
      },
      {
        key: "customer_name",
        label: "Customer",
        sortable: true,
        render: (row) => (
          <EntityLink kind="customer" id={row.customer_id} label={entityLabel(row.customer_name, row.customer_id, "Customer")} />
        ),
      },
      { key: "trip_type", label: "Trip", sortable: true, render: (row) => row.trip_type ?? "—" },
      { key: "status", label: "Status", sortable: true, render: (row) => row.status ?? "—" },
      {
        key: "driver_name",
        label: "Driver",
        sortable: true,
        render: (row) => (
          <EntityLink kind="driver" id={row.driver_id} label={entityLabel(row.driver_name, row.driver_id, "Driver")} />
        ),
      },
      {
        key: "unit_number",
        label: "Unit",
        sortable: true,
        render: (row) => <EntityLink kind="unit" id={row.unit_id} label={entityLabel(row.unit_number, row.unit_id, "Unit")} />,
      },
      {
        key: "trailer_number",
        label: "Trailer",
        sortable: true,
        render: (row) => (
          <EntityLink kind="trailer" id={row.trailer_id} label={entityLabel(row.trailer_number, row.trailer_id, "Trailer")} />
        ),
      },
      { key: "lane", label: "Lane", sortable: true, sortValue: (row) => laneLabel(row), render: (row) => laneLabel(row) },
      {
        key: "pickup_date",
        label: "Pickup",
        sortable: true,
        render: (row) => (row.pickup_date ? formatDateQboList(row.pickup_date) : "—"),
      },
      {
        key: "delivery_date",
        label: "Delivery",
        sortable: true,
        render: (row) => (row.delivery_date ? formatDateQboList(row.delivery_date) : "—"),
      },
      { key: "miles_practical", label: "Practical mi", sortable: true, className: "text-right", cellClass: "text-right", render: (row) => miles(row.miles_practical) },
      { key: "miles_shortest", label: "Short mi", sortable: true, className: "text-right", cellClass: "text-right", render: (row) => miles(row.miles_shortest) },
      {
        key: "miles_driven_actual",
        label: "Driven mi",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => miles(row.miles_driven_actual),
      },
      { key: "revenue_cents", label: "Rate", sortable: true, className: "text-right", cellClass: "text-right", render: (row) => money(row.revenue_cents) },
      { key: "driver_pay_cents", label: "Driver pay", sortable: true, className: "text-right", cellClass: "text-right", render: (row) => money(row.driver_pay_cents) },
      { key: "fuel_cents", label: "Fuel", sortable: true, className: "text-right", cellClass: "text-right", render: (row) => money(row.fuel_cents) },
      { key: "margin_cents", label: "Margin", sortable: true, className: "text-right", cellClass: "text-right", render: (row) => money(row.margin_cents) },
      {
        key: "invoice_number",
        label: "Invoice",
        sortable: true,
        render: (row) =>
          row.invoice_id ? (
            <EntityLink kind="invoice" id={row.invoice_id} label={entityLabel(row.invoice_number, row.invoice_id, "Invoice")} />
          ) : (
            "—"
          ),
      },
      {
        key: "factoring_display",
        label: "Factored",
        sortable: true,
        render: (row) =>
          row.factoring_advance_id ? (
            <EntityLink
              kind="factoring_advance"
              id={row.factoring_advance_id}
              label={entityLabel(row.factoring_display, row.factoring_advance_id, "Advance")}
            />
          ) : (
            "—"
          ),
      },
      {
        key: "settlement_number",
        label: "Settlement",
        sortable: true,
        render: (row) =>
          row.settlement_id ? (
            <EntityLink
              kind="settlement"
              id={row.settlement_id}
              label={entityLabel(row.settlement_number, row.settlement_id, "Settlement")}
            />
          ) : (
            row.settlement_number ?? "—"
          ),
      },
    ],
    []
  );

  const footerCells = query.data
    ? {
        load_number: (
          <span className="font-semibold uppercase tracking-[0.4px] text-gray-600 text-section-header">
            Totals ({filtered.length})
          </span>
        ),
        revenue_cents: <span className="text-gray-900">{money(query.data.totals.revenue_cents)}</span>,
        driver_pay_cents: <span className="text-gray-900">{money(query.data.totals.driver_pay_cents)}</span>,
        fuel_cents: <span className="text-gray-900">{money(query.data.totals.fuel_cents)}</span>,
        margin_cents: <span className="font-semibold text-gray-900">{money(query.data.totals.margin_cents)}</span>,
      }
    : undefined;

  return (
    <div className="space-y-3" data-testid="loads-report-page">
      <ReportsSubNav />
      <PageHeader title="Loads report" backHref="/reports" breadcrumb={["Reports", "Loads report"]} />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Print
        </button>
      </div>

      <ReportFilterBar
        testIdPrefix="reports-loads"
        fromDate={staged.draft.start}
        toDate={staged.draft.end}
        onFromDateChange={(d) => staged.setDraft((p) => ({ ...p, start: d ?? "" }))}
        onToDateChange={(d) => staged.setDraft((p) => ({ ...p, end: d ?? "" }))}
        onPresetSelect={(preset) => {
          const next = new URLSearchParams(searchParams);
          next.set("preset", preset);
          setSearchParams(next, { replace: true });
        }}
        search={reportSearch}
        onSearchChange={setReportSearch}
        onApply={staged.apply}
        onCancel={staged.cancel}
        onReset={staged.reset}
        applyDisabled={!staged.dirty}
      >
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <span className="font-semibold text-slate-600">Date on</span>
          <SelectCombobox
            className="h-7 rounded-sm border border-slate-300 px-2 text-xs"
            value={staged.draft.dateField}
            onChange={(e) => staged.setDraft((p) => ({ ...p, dateField: e.target.value as LoadsReportDateField }))}
          >
            <option value="created">Created</option>
            <option value="pickup">Pickup</option>
            <option value="delivery">Delivery</option>
          </SelectCombobox>
        </label>
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-slate-600">
          <span className="font-semibold text-slate-600">Customer</span>
          <ReferenceSelect
            size="sm"
            value={staged.draft.customerId || null}
            onChange={(next) => staged.setDraft((p) => ({ ...p, customerId: next ?? "" }))}
            options={customerOptions}
            createKind="customer"
            operatingCompanyId={companyId}
            placeholder="All customers"
            loading={customersQuery.isLoading}
            onSearch={setCustomerSearch}
            disabled={!companyId}
          />
        </label>
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-slate-600">
          <span className="font-semibold text-slate-600">Driver</span>
          <EntityPicker
            kind="driver"
            operatingCompanyId={companyId}
            value={staged.draft.driverId || null}
            onChange={(next) => staged.setDraft((p) => ({ ...p, driverId: next ?? "" }))}
            allowCreate={false}
            placeholder="All drivers"
            className="h-7 w-full text-xs"
          />
        </label>
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-slate-600">
          <span className="font-semibold text-slate-600">Unit</span>
          <EntityPicker
            kind="unit"
            operatingCompanyId={companyId}
            value={staged.draft.unitId || null}
            onChange={(next) => staged.setDraft((p) => ({ ...p, unitId: next ?? "" }))}
            allowCreate={false}
            placeholder="All units"
            className="h-7 w-full text-xs"
          />
        </label>
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-slate-600">
          <span className="font-semibold text-slate-600">Trailer</span>
          <EntityPicker
            kind="trailer"
            operatingCompanyId={companyId}
            value={staged.draft.trailerId || null}
            onChange={(next) => staged.setDraft((p) => ({ ...p, trailerId: next ?? "" }))}
            allowCreate={false}
            placeholder="All trailers"
            className="h-7 w-full text-xs"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <span className="font-semibold text-slate-600">Status</span>
          <SelectCombobox
            className="h-7 rounded-sm border border-slate-300 px-2 text-xs"
            value={staged.draft.status}
            onChange={(e) => staged.setDraft((p) => ({ ...p, status: e.target.value }))}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <span className="font-semibold text-slate-600">Trip</span>
          <SelectCombobox
            className="h-7 rounded-sm border border-slate-300 px-2 text-xs"
            value={staged.draft.tripType}
            onChange={(e) => staged.setDraft((p) => ({ ...p, tripType: e.target.value }))}
          >
            <option value="">All</option>
            <option value="NB">NB</option>
            <option value="TR">TR</option>
            <option value="SB">SB</option>
            <option value="LOCAL">LOCAL</option>
          </SelectCombobox>
        </label>
      </ReportFilterBar>

      {query.isLoading ? <div className="rounded-sm border bg-white p-4 text-xs text-slate-500">Loading…</div> : null}
      {query.isError ? (
        <ListErrorState title="Couldn't load loads report" {...formatQueryErrorDetail(query.error)} onRetry={() => void query.refetch()} />
      ) : null}

      {query.data ? (
        <>
          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-sm border bg-white p-3">
              <div className="text-xs text-slate-500">Loads</div>
              <div className="text-page-title font-semibold">{query.data.totals.load_count}</div>
            </div>
            <div className="rounded-sm border bg-white p-3">
              <div className="text-xs text-slate-500">Revenue</div>
              <div className="text-page-title font-semibold">{money(query.data.totals.revenue_cents)}</div>
            </div>
            <div className="rounded-sm border bg-white p-3">
              <div className="text-xs text-slate-500">Driver pay</div>
              <div className="text-page-title font-semibold">{money(query.data.totals.driver_pay_cents)}</div>
            </div>
            <div className="rounded-sm border bg-white p-3">
              <div className="text-xs text-slate-500">Fuel</div>
              <div className="text-page-title font-semibold">{money(query.data.totals.fuel_cents)}</div>
            </div>
            <div className="rounded-sm border bg-white p-3">
              <div className="text-xs text-slate-500">Margin</div>
              <div className="text-page-title font-semibold">{money(query.data.totals.margin_cents)}</div>
            </div>
          </div>

          <ParityTable
            rows={filtered}
            columns={columns}
            rowKey={(row) => row.load_id}
            loading={query.isPending || (query.isFetching && filtered.length === 0)}
            storageKey="loads-report"
            emptyText="No loads match these filters."
            exportFilename="loads-report.csv"
            footerCells={footerCells}
            minWidthPx={1800}
          />
        </>
      ) : null}
    </div>
  );
}
