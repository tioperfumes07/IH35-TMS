import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getCustomerStatementOfAccount, getVendorStatementOfAccount, type CounterpartyStatementLine } from "../../api/reports";
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

function currentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
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

export function CounterpartyStatementView({ kind }: { kind: "customer" | "vendor" }) {
  const { id } = useParams<{ id: string }>();
  const counterpartyId = id ?? "";
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const defaultRange = currentMonthRange();
  const [range, setRange] = useState(defaultRange);

  const query = useQuery({
    queryKey: ["reports", "counterparty-statement", kind, companyId, counterpartyId, range.start, range.end],
    queryFn: () =>
      kind === "customer"
        ? getCustomerStatementOfAccount({ operating_company_id: companyId, customer_id: counterpartyId, from_date: range.start, to_date: range.end })
        : getVendorStatementOfAccount({ operating_company_id: companyId, vendor_id: counterpartyId, from_date: range.start, to_date: range.end }),
    enabled: Boolean(companyId) && Boolean(counterpartyId),
    retry: false,
  });

  const backHref = kind === "customer" ? `/customers/${counterpartyId}` : `/vendors/${counterpartyId}`;
  const printPath =
    kind === "customer"
      ? `/api/v1/accounting/customers/${encodeURIComponent(counterpartyId)}/statement.html?operating_company_id=${encodeURIComponent(companyId)}&from_date=${range.start}&to_date=${range.end}`
      : `/api/v1/accounting/vendors/${encodeURIComponent(counterpartyId)}/statement.html?operating_company_id=${encodeURIComponent(companyId)}&from_date=${range.start}&to_date=${range.end}`;

  return (
    <div className="space-y-4 print:space-y-2">
      <PageHeader
        title={query.data ? `Statement — ${query.data.counterparty_name}` : "Statement of account"}
        subtitle={kind === "customer" ? "Customer accounts receivable statement" : "Vendor accounts payable statement"}
        backHref={backHref}
        breadcrumb={[kind === "customer" ? "Customers" : "Vendors", "Statement"]}
        actions={
          <Button size="sm" variant="secondary" disabled={!query.data} onClick={() => openPrintableDocument(printPath)}>
            Print
          </Button>
        }
      />

      {!companyId ? <p className="text-xs text-red-600">Select an operating company.</p> : null}
      {query.isError ? <p className="text-xs text-red-700">Failed to load statement — {String((query.error as Error)?.message ?? "unknown error")}</p> : null}

      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-gray-200 bg-white p-3">
        <label className="text-xs text-gray-600">
          From
          <DatePicker className="mt-1 block h-9" value={range.start} onChange={(next) => setRange((prev) => ({ ...prev, start: next }))} />
        </label>
        <label className="text-xs text-gray-600">
          To
          <DatePicker className="mt-1 block h-9" value={range.end} onChange={(next) => setRange((prev) => ({ ...prev, end: next }))} />
        </label>
      </div>

      {query.data ? (
        <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Charge</th>
                <th className="px-3 py-2 text-right">Payment/Credit</th>
                <th className="px-3 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100 bg-slate-50 font-semibold">
                <td className="px-3 py-2" colSpan={6}>
                  Opening balance ({mmmDd(query.data.from_date)})
                </td>
                <td className="px-3 py-2 text-right">{money(query.data.opening_balance_cents)}</td>
              </tr>
              {query.data.lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-gray-500">
                    No activity in this period
                  </td>
                </tr>
              ) : (
                query.data.lines.map((line, idx) => (
                  <tr key={`${line.link_kind}-${line.link_id}-${idx}`} className="border-b border-gray-100">
                    <td className="px-3 py-2">{mmmDd(line.date)}</td>
                    <td className="px-3 py-2">{typeLabel(line.type)}</td>
                    <td className="px-3 py-2">{line.reference || "—"}</td>
                    <td className="px-3 py-2">{line.description}</td>
                    <td className="px-3 py-2 text-right">{line.debit_cents > 0 ? money(line.debit_cents) : "—"}</td>
                    <td className="px-3 py-2 text-right">{line.credit_cents > 0 ? money(line.credit_cents) : "—"}</td>
                    <td className="px-3 py-2 text-right">{money(line.running_balance_cents)}</td>
                  </tr>
                ))
              )}
              <tr className="bg-slate-50 font-semibold">
                <td className="px-3 py-2" colSpan={6}>
                  Closing balance ({mmmDd(query.data.to_date)})
                </td>
                <td className="px-3 py-2 text-right">{money(query.data.closing_balance_cents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : query.isLoading ? (
        <p className="text-xs text-gray-500">Loading…</p>
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
