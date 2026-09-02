import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listBills, listExpenses, type ExpenseListRow, type VendorBill } from "../../api/accounting";
import { apiRequest } from "../../api/client";
import type { LoadDetail } from "../../api/loads";
import { entityLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";
import { Button } from "../Button";
import { ListErrorState } from "../ListErrorState";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { formatMoneyCents } from "./constants";

type DriverBillRow = {
  id: string;
  gross_amount_cents: number;
  status: string;
};

type CostChoice = "expense" | "bill" | null;
type LoadCostRow =
  | { key: string; kind: "expense"; source: ExpenseListRow }
  | { key: string; kind: "bill"; source: VendorBill };

type Props = {
  load: LoadDetail;
  canEdit: boolean;
};

function createQuery(load: LoadDetail) {
  const query = new URLSearchParams({ load_id: load.id, load_number: load.load_number });
  if (load.assigned_primary_driver_id) query.set("driver_id", load.assigned_primary_driver_id);
  if (load.assigned_unit_id) query.set("unit_id", load.assigned_unit_id);
  if (load.trailer_id) query.set("trailer_id", load.trailer_id);
  return query.toString();
}

function expenseDriver(row: ExpenseListRow) {
  if (!row.driver_uuid) return <span className="text-gray-400">Not set</span>;
  const name = [row.driver_first_name, row.driver_last_name].filter(Boolean).join(" ");
  return <EntityLink kind="driver" id={row.driver_uuid} label={entityLabel(name || null, row.driver_uuid, "Driver")} />;
}

function billDriver(row: VendorBill) {
  if (!row.driver_id) return <span className="text-gray-400">Not set</span>;
  return <EntityLink kind="driver" id={row.driver_id} label={entityLabel(null, row.driver_id, "Driver")} />;
}

export function LoadDetailCostsTab({ load, canEdit }: Props) {
  const [choice, setChoice] = useState<CostChoice>(null);
  const opco = load.operating_company_id;
  const expensesQuery = useQuery({
    queryKey: ["load-costs", "expenses", opco, load.id],
    queryFn: () => listExpenses(opco, { load_id: load.id, limit: 200 }),
  });
  const billsQuery = useQuery({
    queryKey: ["load-costs", "bills", opco, load.id],
    queryFn: () => listBills(opco, { load_id: load.id, limit: 200 }),
  });
  const driverBillsQuery = useQuery({
    queryKey: ["load-costs", "driver-bills", opco, load.id],
    queryFn: () =>
      apiRequest<{ driver_bills: DriverBillRow[] }>(
        `/api/v1/driver-finance/driver-bills?load_id=${encodeURIComponent(load.id)}&operating_company_id=${encodeURIComponent(opco)}`
      ),
  });

  const expenses = expensesQuery.data?.rows ?? [];
  const bills = billsQuery.data?.rows ?? [];
  const linkedCostCents =
    expenses.filter((row) => row.status !== "void").reduce((sum, row) => sum + Number(row.total_amount_cents || 0), 0) +
    bills.filter((row) => row.status !== "voided").reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
  const estimatedDriverPayCents = (driverBillsQuery.data?.driver_bills ?? [])
    .filter((row) => row.status !== "void")
    .reduce((sum, row) => sum + Number(row.gross_amount_cents || 0), 0);
  const linehaulCents = Number(load.rate_total_cents ?? 0);
  const approximateMarginCents = linehaulCents - linkedCostCents - estimatedDriverPayCents;
  const currency = load.currency_code === "MXN" ? "MXN" : "USD";
  const query = createQuery(load);
  const costRows: LoadCostRow[] = [
    ...expenses.map((source) => ({ key: `expense-${source.id}`, kind: "expense" as const, source })),
    ...bills.map((source) => ({ key: `bill-${source.id}`, kind: "bill" as const, source })),
  ];
  const columns: Array<ParityColumn<LoadCostRow>> = [
    { key: "date", label: "Date", sortable: true, sortValue: (row) => row.kind === "expense" ? row.source.transaction_date : row.source.bill_date, render: (row) => formatDateUS(row.kind === "expense" ? row.source.transaction_date : row.source.bill_date) },
    { key: "type", label: "Type", sortable: true, sortValue: (row) => row.kind, render: (row) => <EntityLink kind={row.kind} id={row.source.id} label={row.kind === "expense" ? "Expense" : "Bill"} /> },
    { key: "vendor", label: "Vendor", sortable: true, sortValue: (row) => row.source.vendor_name, render: (row) => row.source.vendor_name ?? "Not set" },
    { key: "category", label: "Category / GL", render: (row) => row.kind === "expense" ? row.source.line_description ?? row.source.memo ?? "Not set" : row.source.memo ?? "Not set" },
    { key: "amount", label: "Amount", sortable: true, sortValue: (row) => Number(row.kind === "expense" ? row.source.total_amount_cents : row.source.amount_cents), cellClass: "text-right", render: (row) => formatMoneyCents(Number(row.kind === "expense" ? row.source.total_amount_cents : row.source.amount_cents), currency) },
    { key: "driver", label: "Driver", render: (row) => row.kind === "expense" ? <span data-cost-driver-column="driver_uuid">{expenseDriver(row.source)}</span> : <span data-cost-driver-column="driver_id">{billDriver(row.source)}</span> },
    { key: "truck", label: "Truck", render: (row) => row.kind === "bill" && row.source.unit_id ? <EntityLink kind="unit" id={row.source.unit_id} label={entityLabel(row.source.unit_display_id, row.source.unit_id, "Truck")} /> : "Not set" },
    { key: "trailer", label: "Trailer", render: (row) => row.kind === "expense" && row.source.trailer_id ? <EntityLink kind="trailer" id={row.source.trailer_id} label={entityLabel(row.source.trailer_display_id, row.source.trailer_id, "Trailer")} /> : "Not set" },
    { key: "load", label: "Load", render: () => <EntityLink kind="load" id={load.id} label={load.load_number} /> },
    { key: "je", label: "JE", render: (row) => row.source.journal_entry_id ? <EntityLink kind="journal_entry" id={row.source.journal_entry_id} label={entityLabel(row.source.journal_entry_memo, row.source.journal_entry_id, "JE")} /> : "Not posted" },
    { key: "bank", label: "Bank match", render: (row) => row.kind === "expense" ? row.source.matched_bank_transaction_id ? <EntityLink kind="bank_transaction" id={row.source.matched_bank_transaction_id} label={entityLabel(row.source.matched_bank_transaction_description, row.source.matched_bank_transaction_id, "Bank transaction")} /> : "Unmatched" : row.source.is_reconciled ? "Matched" : "Unmatched" },
    { key: "status", label: "Status", sortable: true, sortValue: (row) => row.source.status, render: (row) => row.source.status },
  ];
  const isLoading = expensesQuery.isLoading || billsQuery.isLoading || driverBillsQuery.isLoading;
  const failedQuery = expensesQuery.isError ? expensesQuery : billsQuery.isError ? billsQuery : driverBillsQuery.isError ? driverBillsQuery : null;

  return (
    <div className="space-y-4" data-testid="load-detail-costs-tab">
      <section className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-5">
          <div><div className="font-semibold uppercase text-gray-500">Load</div><EntityLink kind="load" id={load.id} label={load.load_number} /></div>
          <div><div className="font-semibold uppercase text-gray-500">Customer</div><EntityLinkOrTombstone kind="customer" id={load.customer_id} name={load.customer_name} noun="Customer" /></div>
          <div><div className="font-semibold uppercase text-gray-500">Driver</div><EntityLinkOrTombstone kind="driver" id={load.assigned_primary_driver_id} name={load.assigned_primary_driver_name} noun="Driver" /></div>
          <div><div className="font-semibold uppercase text-gray-500">Truck</div><EntityLinkOrTombstone kind="unit" id={load.assigned_unit_id} name={load.assigned_unit_number} noun="Truck" /></div>
          <div><div className="font-semibold uppercase text-gray-500">Trailer</div><EntityLinkOrTombstone kind="trailer" id={load.trailer_id} name={load.trailer_number} noun="Trailer" /></div>
        </div>
      </section>

      <section className="rounded-sm border border-gray-200 bg-gray-50 p-3">
        <div className="font-semibold uppercase text-gray-500" style={{ fontSize: 11 }}>Approximate · before settlement</div>
        <div className="mt-1 text-xs font-semibold text-gray-900">{formatMoneyCents(approximateMarginCents, currency)}</div>
        <div className="mt-1 text-xs text-gray-500">
          {formatMoneyCents(linehaulCents, currency)} linehaul − {formatMoneyCents(linkedCostCents, currency)} linked costs − {formatMoneyCents(estimatedDriverPayCents, currency)} estimated driver pay
        </div>
      </section>

      {canEdit ? (
        <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="load-cost-create-choice">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-700">+ Create</span>
            <Button type="button" size="sm" variant={choice === "expense" ? "primary" : "secondary"} onClick={() => setChoice("expense")}>Expense · paid now</Button>
            <Button type="button" size="sm" variant={choice === "bill" ? "primary" : "secondary"} onClick={() => setChoice("bill")}>Bill · vendor invoice</Button>
            {choice ? (
              <Link
                className="text-xs font-semibold text-slate-700 underline"
                data-testid={`load-cost-create-${choice}`}
                to={`${choice === "expense" ? "/accounting/expenses/new" : "/accounting/bills/vendor"}?${query}`}
              >
                Continue to {choice === "expense" ? "Expense" : "Bill"}
              </Link>
            ) : <span className="text-xs text-gray-500">Choose a cost type to continue.</span>}
            <Link className="text-xs font-semibold text-slate-700 underline" to={`/accounting/receipts?${query}`}>+ From a receipt photo</Link>
            <Link className="text-xs font-semibold text-slate-700 underline" to={`/cash-advances?${query}`}>+ Fuel advance</Link>
          </div>
        </section>
      ) : null}

      {failedQuery ? (
        <ListErrorState title="Could not load costs for this load." status={(failedQuery.error as { status?: number })?.status ?? 0} onRetry={() => void failedQuery.refetch()} />
      ) : null}
      {!failedQuery && isLoading ? <div className="py-8 text-center text-sm text-gray-500">Loading costs…</div> : null}
      {!failedQuery && !isLoading && expenses.length === 0 && bills.length === 0 ? (
        <div className="rounded-sm border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">No costs on this load yet.</div>
      ) : null}
      {!failedQuery && !isLoading && costRows.length > 0 ? (
        <ParityTable<LoadCostRow>
          columns={columns}
          rows={costRows}
          rowKey={(row) => row.key}
          emptyText="No costs on this load yet."
          storageKey="dispatch-load-costs"
          initialPageSize={25}
          pageSizeOptions={[25, 50, 100]}
          suppressToolbarRange
          exportFilename={`load-${load.load_number}-costs`}
          tableTestId="load-costs-table"
        />
      ) : null}
    </div>
  );
}
