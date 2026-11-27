/**
 * SCENTSX B13 — Sales by Customer and Sales by Item for ScentsX LLC, in Books. The numbers come from ScentsX's issued invoices
 * (sales-report.service.ts): drafts and voided invoices are left out; units, cost and margin come from the sales order behind
 * each line. Same books as the P&L.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ParityTable } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { DatePicker } from "../../components/forms/DatePicker";
import { getScentsxSalesReport, type ScentsxSalesRow } from "../../api/scentsx";
import { tr } from "./perfumeI18n";
import { usDate } from "./perfumeDocParts";

const money = (c: number | null) => (c == null ? "—" : (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }));
const yearStart = () => `${new Date().getFullYear()}-01-01`;
const today = () => new Date().toISOString().slice(0, 10);

export function ScentsxSalesReport() {
  const [by, setBy] = useState<"customer" | "item">("customer");
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const q = useQuery({ queryKey: ["scentsx", "sales-report", by, from, to], queryFn: () => getScentsxSalesReport(by, from, to), enabled: !!from && !!to && from <= to });
  const r = q.data?.report;
  return (
    <div className="space-y-1" data-testid="scentsx-sales-report">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-[#1F2A44]">{tr("scentsx.sales.title", "Sales")}</span>
        <select className="h-10 rounded-sm border border-[#C6D1DC] px-2 text-xs" aria-label={tr("scentsx.sales.by", "Sales by")} value={by} onChange={(e) => setBy(e.target.value as "customer" | "item")} data-testid="scentsx-sales-by">
          <option value="customer">{tr("scentsx.sales.by_customer", "By customer")}</option>
          <option value="item">{tr("scentsx.sales.by_item", "By item")}</option>
        </select>
        <DatePicker aria-label={tr("scentsx.sales.from", "From")} value={from} onChange={setFrom} />
        <DatePicker aria-label={tr("scentsx.sales.to", "To")} value={to} onChange={setTo} />
        {r ? <span className="ml-auto tabular-nums" data-testid="scentsx-sales-total">{tr("scentsx.sales.total", "Total")}: <b>{money(r.total.sales_cents)}</b> · {r.total.invoices} {tr("scentsx.sales.invoices", "invoices")}{r.total.margin_cents != null ? <> · {tr("scentsx.sales.margin", "margin")} {money(r.total.margin_cents)}</> : null}</span> : null}
      </div>
      {q.isError ? (
        <ListErrorState title={tr("scentsx.sales.error", "Couldn't load sales")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />
      ) : (
        <ParityTable<ScentsxSalesRow>
          cardTitle title={by === "customer" ? tr("scentsx.sales.title_customer", "Sales by customer") : tr("scentsx.sales.title_item", "Sales by item")}
          rows={r?.rows ?? []}
          rowKey={(x) => x.key}
          loading={q.isLoading}
          storageKey={`scentsx-sales-${by}-v1`}
          exportFilename={by === "customer" ? "ScentsX sales by customer" : "ScentsX sales by item"}
          exportExcel
          emptyText={tr("scentsx.sales.empty", "No issued ScentsX invoice in these dates.")}
          columns={[
            { key: "name", label: by === "customer" ? tr("scentsx.sales.col_customer", "Customer") : tr("scentsx.sales.col_item", "Item"), sortable: true },
            { key: "last_sale_date", label: tr("scentsx.sales.col_last", "Last sale"), sortable: true, render: (x) => (x.last_sale_date ? usDate(x.last_sale_date) : "—") },
            { key: "invoices", label: tr("scentsx.sales.col_invoices", "Invoices"), sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
            { key: "units", label: tr("scentsx.sales.col_units", "Units"), sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
            { key: "sales_cents", label: tr("scentsx.sales.col_sales", "Sales"), sortable: true, cellClass: "text-right tabular-nums", render: (x) => money(x.sales_cents) },
            { key: "pct_of_sales", label: tr("scentsx.sales.col_pct", "% of sales"), sortable: true, cellClass: "text-right tabular-nums", render: (x) => `${x.pct_of_sales.toFixed(2)}%` },
            { key: "cost_cents", label: tr("scentsx.sales.col_cost", "Cost on order"), sortable: true, cellClass: "text-right tabular-nums", render: (x) => money(x.cost_cents) },
            { key: "margin_cents", label: tr("scentsx.sales.col_margin", "Margin"), sortable: true, cellClass: "text-right tabular-nums", render: (x) => money(x.margin_cents) },
          ]}
        />
      )}
    </div>
  );
}
