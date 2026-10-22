import { companyToday, monthBoundsIso } from "../../lib/businessDate";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getCustomerStatementOfAccount, getVendorStatementOfAccount, type CounterpartyStatementLine, type CounterpartyStatementResponse } from "../../api/reports";
import { listAllDispatchLoads, type DispatchLoad } from "../../api/dispatch";
import { listExpenses, type ExpenseListRow } from "../../api/accounting";
import { EntityLink, resolveEntityRoute } from "../../components/shared/EntityLink";
import { MoneyCell } from "../../components/shared/MoneyCell";

/** ROUND 433.2 — the route of a statement line's own document, or null (a kind with no mounted route stays plain). */
function lineKind(line: CounterpartyStatementLine): Parameters<typeof resolveEntityRoute>[0] | null {
  const kind = line.link_kind as Parameters<typeof resolveEntityRoute>[0];
  return line.link_id && resolveEntityRoute(kind, line.link_id) ? kind : null;
}
import { ALL_PAGE_SIZE, ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useStagedListFilters } from "../../components/table";
import { openPrintableDocument } from "../../lib/openPrintableDocument";
import { formatUsdCents } from "../../lib/money";
import { mmmDd } from "../../lib/formatDate";

// V2 — COUNTERPARTY STATEMENTS (owner-requested 2026-09-05, STANDING-DIRECTIVES-2026-09-05.md §CC-1
// item 5): one shared component for both the customer AR statement (extended from a partial list to a
// real running-ledger statement of account) and the net-new vendor AP statement, drillable from
// /customers/:id and /vendors/:id respectively. Same read model, same footing guarantee
// (scripts/verify-counterparty-statements-foot-to-gl.mjs), same UI — a customer and a vendor statement
// are the same document shape by design (opening -> chronological ledger -> closing), never two
// independently-drifting implementations.

function money(cents: number) {
  if (!cents) return "—";
  return formatUsdCents(cents);
}

function csvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportStatementCsv(response: CounterpartyStatementResponse) {
  const headers = ["Date", "Type", "Reference", "Description", "Debit", "Credit", "Running Balance"];
  const rows = response.lines.map((line) => [
    line.date,
    typeLabel(line.type),
    line.reference,
    line.description,
    line.debit_cents ? (line.debit_cents / 100).toFixed(2) : "",
    line.credit_cents ? (line.credit_cents / 100).toFixed(2) : "",
    (line.running_balance_cents / 100).toFixed(2),
  ]);
  const csv = [headers, ...rows].map((row) => row.map((cell) => csvCell(String(cell))).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `statement-${response.counterparty_id}-${response.from_date}-${response.to_date}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function currentMonthRange() {
  return monthBoundsIso(companyToday());
}

function typeLabel(type: CounterpartyStatementLine["type"]) {
  switch (type) {
    case "invoice":
      return "Invoice";
    case "payment":
      return "Payment";
    case "credit_memo":
      return "Credit memo";
    case "bill":
      return "Bill";
    case "bill_payment":
      return "Payment";
    case "vendor_credit":
      return "Vendor credit";
    default:
      return type;
  }
}

type LoadRow = Pick<DispatchLoad, "id" | "load_number" | "status" | "pickup_scheduled_at" | "scheduled_delivery_date" | "rate_total_cents">;

const loadColumns: Array<ParityColumn<LoadRow>> = [
  {
    key: "load_number",
    label: "Load #",
    sortable: true,
    render: (load) => <EntityLink kind="load" id={load.id} label={load.load_number ?? "—"} />,
  },
  { key: "status", label: "Status", sortable: true, render: (load) => load.status ?? "—" },
  {
    key: "pickup_scheduled_at",
    label: "Pickup",
    sortable: true,
    render: (load) => load.pickup_scheduled_at ? mmmDd(load.pickup_scheduled_at) : "—",
  },
  {
    key: "scheduled_delivery_date",
    label: "Delivery",
    sortable: true,
    render: (load) => load.scheduled_delivery_date ? mmmDd(load.scheduled_delivery_date) : "—",
  },
  {
    key: "rate_total_cents",
    label: "Rate",
    sortable: true,
    render: (load) => load.rate_total_cents != null ? formatUsdCents(load.rate_total_cents) : "—",
  },
];

type ExpenseRow = Pick<ExpenseListRow, "id" | "transaction_date" | "memo" | "total_amount_cents" | "status" | "load_number" | "load_id">;

const expenseColumns: Array<ParityColumn<ExpenseRow>> = [
  {
    key: "transaction_date",
    label: "Date",
    sortable: true,
    render: (exp) => exp.transaction_date ? mmmDd(exp.transaction_date) : "—",
  },
  { key: "memo", label: "Description", sortable: true, render: (exp) => exp.memo ?? "—" },
  { key: "load_number", label: "Load", sortable: true, render: (exp) => exp.load_id ? <EntityLink kind="load" id={exp.load_id} label={exp.load_number ?? "—"} /> : (exp.load_number ?? "—") },
  {
    key: "total_amount_cents",
    label: "Amount",
    sortable: true,
    render: (exp) => exp.total_amount_cents != null ? formatUsdCents(Number(exp.total_amount_cents)) : "—",
  },
  { key: "status", label: "Status", sortable: true, render: (exp) => exp.status ?? "—" },
];

/**
 * ACC-45 (row 45): `counterpartyId`/`embedded` let this SAME view mount inline as a "Statements"
 * tab (Vendors.tsx list-drawer, no route param to read) as well as the standalone
 * /customers/:id/statement · /vendors/:id/statement pages it already served — one read model, one
 * rendering, never a second statement view that could drift from this one on what "balanced" means.
 */
type StatementRow = {
  key: string;
  kind: "opening" | "line" | "empty";
  line: CounterpartyStatementLine | null;
  date: string;
  running_balance_cents: number;
};

const statementColumns: ParityColumn<StatementRow>[] = [
  {
    key: "date",
    label: "Date",
    sortable: true,
    render: (r) => (r.kind === "line" ? mmmDd(r.date) : ""),
  },
  { key: "type", label: "Type", sortable: true, sortValue: (r) => (r.line ? typeLabel(r.line.type) : ""), render: (r) => (r.line ? typeLabel(r.line.type) : "") },
  { key: "reference", label: "Reference", sortable: true, sortValue: (r) => r.line?.reference ?? "", render: (r) => (r.line ? r.line.reference || "—" : "") },
  {
    key: "description",
    label: "Description",
    sortable: true,
    allowWrap: true,
    sortValue: (r) => r.line?.description ?? "",
    render: (r) =>
      r.kind === "opening" ? (
        <span className="font-semibold">Opening balance ({mmmDd(r.date)})</span>
      ) : r.kind === "empty" ? (
        <span className="text-gray-500">No activity in this period</span>
      ) : (
        r.line!.description
      ),
  },
  {
    key: "debit_cents",
    label: "Charge",
    sortable: true,
    kind: "money",
    sortValue: (r) => r.line?.debit_cents ?? 0,
    render: (r) => {
      const line = r.line;
      if (!line) return "";
      return line.debit_cents > 0 ? (lineKind(line) ? <EntityLink kind={lineKind(line)!} id={line.link_id} label={money(line.debit_cents)} /> : money(line.debit_cents)) : "—";
    },
  },
  {
    key: "credit_cents",
    label: "Payment/Credit",
    sortable: true,
    kind: "money",
    sortValue: (r) => r.line?.credit_cents ?? 0,
    render: (r) => {
      const line = r.line;
      if (!line) return "";
      return line.credit_cents > 0 ? (lineKind(line) ? <EntityLink kind={lineKind(line)!} id={line.link_id} label={money(line.credit_cents)} /> : money(line.credit_cents)) : "—";
    },
  },
  {
    key: "running_balance_cents",
    label: "Balance",
    sortable: true,
    kind: "money",
    render: (r) =>
      r.kind === "opening" ? (
        <MoneyCell cents={r.running_balance_cents} format={money} drill={{ none: "Opening balance of this statement: everything before the first line listed below" }} />
      ) : r.kind === "empty" ? (
        ""
      ) : (
        <MoneyCell cents={r.running_balance_cents} format={money} drill={{ none: "Running balance: opening plus every line up to this one, each of which opens its document" }} />
      ),
  },
];

export function CounterpartyStatementView({
  kind,
  counterpartyId: counterpartyIdProp,
  embedded = false,
}: {
  kind: "customer" | "vendor";
  counterpartyId?: string;
  embedded?: boolean;
}) {
  const { id } = useParams<{ id: string }>();
  const counterpartyId = counterpartyIdProp ?? id ?? "";
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const defaultRange = currentMonthRange();
  const emptyFilters = { ...defaultRange };
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const staged = useStagedListFilters({ applied: appliedFilters, empty: emptyFilters, onApply: setAppliedFilters });

  const query = useQuery({
    queryKey: ["reports", "counterparty-statement", kind, companyId, counterpartyId, appliedFilters.start, appliedFilters.end],
    queryFn: () =>
      kind === "customer"
        ? getCustomerStatementOfAccount({ operating_company_id: companyId, customer_id: counterpartyId, from_date: appliedFilters.start, to_date: appliedFilters.end })
        : getVendorStatementOfAccount({ operating_company_id: companyId, vendor_id: counterpartyId, from_date: appliedFilters.start, to_date: appliedFilters.end }),
    enabled: Boolean(companyId) && Boolean(counterpartyId),
    retry: false,
  });

  // Transaction history — loads for customers, expenses for vendors
  const loadsQuery = useQuery({
    queryKey: ["reports", "counterparty-statement", "loads", companyId, counterpartyId],
    queryFn: () => listAllDispatchLoads({ operating_company_id: companyId, view: "home", status: [], customer: counterpartyId, scope: "all" }),
    enabled: Boolean(companyId) && Boolean(counterpartyId) && kind === "customer",
    retry: false,
  });

  const expensesQuery = useQuery({
    queryKey: ["reports", "counterparty-statement", "expenses", companyId, counterpartyId],
    queryFn: () => listExpenses(companyId, { vendor_uuid: counterpartyId }),
    enabled: Boolean(companyId) && Boolean(counterpartyId) && kind === "vendor",
    retry: false,
  });

  const backHref = kind === "customer" ? `/customers/${counterpartyId}` : `/vendors/${counterpartyId}`;
  const printPath =
    kind === "customer"
      ? `/api/v1/accounting/customers/${encodeURIComponent(counterpartyId)}/statement.html?operating_company_id=${encodeURIComponent(companyId)}&from_date=${appliedFilters.start}&to_date=${appliedFilters.end}`
      : `/api/v1/accounting/vendors/${encodeURIComponent(counterpartyId)}/statement.html?operating_company_id=${encodeURIComponent(companyId)}&from_date=${appliedFilters.start}&to_date=${appliedFilters.end}`;

  // LEAD 443.181 — the statement ledger on ParityTable. The opening balance stays a (computed, un-linked) first
  // row, each line keeps its EntityLink on the charge / credit figure (so the row opens its document), and the
  // closing balance moves to the footer. Running balance is the server figure per line — no math here.
  const statementRows: StatementRow[] = query.data
    ? [
        { key: "opening", kind: "opening", line: null, date: query.data.from_date, running_balance_cents: query.data.opening_balance_cents },
        ...(query.data.lines.length === 0
          ? [{ key: "no-activity", kind: "empty" as const, line: null, date: "", running_balance_cents: 0 }]
          : query.data.lines.map((line, idx) => ({
              key: `${line.link_kind}-${line.link_id}-${idx}`,
              kind: "line" as const,
              line,
              date: line.date,
              running_balance_cents: line.running_balance_cents,
            }))),
      ]
    : [];

  return (
    <div className="space-y-4 print:space-y-2">
      {embedded ? (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" disabled={!query.data} onClick={() => query.data && exportStatementCsv(query.data)}>
            Export CSV
          </Button>
          <Button size="sm" variant="secondary" disabled={!query.data} onClick={() => openPrintableDocument(printPath)}>
            Print
          </Button>
        </div>
      ) : (
        <PageHeader
          title={query.data ? `Statement — ${query.data.counterparty_name}` : "Statement of account"}
          subtitle={kind === "customer" ? "Customer accounts receivable statement" : "Vendor accounts payable statement"}
          backHref={backHref}
          breadcrumb={[kind === "customer" ? "Customers" : "Vendors", "Statement"]}
          actions={
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={!query.data} onClick={() => query.data && exportStatementCsv(query.data)}>
                Export CSV
              </Button>
              <Button size="sm" variant="secondary" disabled={!query.data} onClick={() => openPrintableDocument(printPath)}>
                Print
              </Button>
            </div>
          }
        />
      )}

      {!companyId ? <p className="text-xs text-red-600">Select an operating company.</p> : null}
      {query.isError ? <p className="text-xs text-red-700">Failed to load statement — {String((query.error as Error)?.message ?? "unknown error")}</p> : null}

      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-gray-200 bg-white p-3">
        <label className="text-xs text-gray-600">
          From
          <DatePicker className="mt-1 block h-9" value={staged.draft.start} onChange={(next) => staged.setDraft((p) => ({ ...p, start: next }))} />
        </label>
        <label className="text-xs text-gray-600">
          To
          <DatePicker className="mt-1 block h-9" value={staged.draft.end} onChange={(next) => staged.setDraft((p) => ({ ...p, end: next }))} />
        </label>
        <div className="mx-1 h-5 w-px bg-[#E5E7EB]" />
        <button
          type="button"
          onClick={staged.reset}
          className="h-7 rounded-sm border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#4B5563] hover:bg-[#F7F8FA]"
          data-testid="reports-counterparty-statement-reset"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={staged.cancel}
          className="h-7 rounded-sm border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#4B5563] hover:bg-[#F7F8FA]"
          data-testid="reports-counterparty-statement-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={staged.apply}
          disabled={!staged.dirty}
          className="h-7 rounded-sm border border-[#1F2A44] bg-[#1F2A44] px-3 text-xs font-medium text-white hover:bg-[#1F2A44] disabled:opacity-50"
          data-testid="reports-counterparty-statement-apply"
        >
          Apply
        </button>
      </div>

      {query.data ? (
        <ParityTable
          title={kind === "customer" ? "Customer statement activity" : "Vendor statement activity"}
          rows={statementRows}
          columns={statementColumns}
          rowKey={(r) => r.key}
          storageKey="ih35.reports.counterparty-statement.ledger.v1"
          emptyText="No activity in this period"
          pageSize={ALL_PAGE_SIZE}
          hidePager
          suppressToolbarSearch
          suppressToolbarRange
          footerCells={{
            description: `Closing balance (${mmmDd(query.data.to_date)})`,
            running_balance_cents: <MoneyCell cents={query.data.closing_balance_cents} format={money} drill={{ none: "Closing balance of this statement: opening plus the lines listed above" }} />,
          }}
        />
      ) : query.isLoading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : null}

      {kind === "customer" && loadsQuery.data ? (
        <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="statement-loads-history">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#4B5563]">Load history</h2>
          <ParityTable
            columns={loadColumns}
            rows={loadsQuery.data.loads}
            rowKey={(load) => String(load.id)}
            storageKey="statement-loads-history"
            tableTestId="statement-loads-history-table"
            emptyText="No loads in this period."
          />
        </section>
      ) : null}

      {kind === "vendor" && expensesQuery.data?.rows ? (
        <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="statement-expenses-history">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#4B5563]">Expense history</h2>
          <ParityTable
            columns={expenseColumns}
            rows={expensesQuery.data.rows}
            rowKey={(exp) => String(exp.id)}
            storageKey="statement-expenses-history"
            tableTestId="statement-expenses-history-table"
            emptyText="No expenses in this period."
          />
        </section>
      ) : null}
    </div>
  );
}

export function CustomerStatementPage() {
  return <CounterpartyStatementView kind="customer" />;
}

export function VendorStatementPage() {
  return <CounterpartyStatementView kind="vendor" />;
}
