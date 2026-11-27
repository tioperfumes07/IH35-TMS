/**
 * SCENTSX B3c — the ScentsX invoice box of a TIO Perfumes sales order: shipped / billed / left to bill per line, the
 * invoices already made (each opens on the Invoices page), and "Invoice shipped units" by channel. The invoice is a draft in
 * ScentsX's books; it posts to A/R and revenue when finalized on the Invoices page.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityLink } from "../../components/shared/EntityLink";
import { userFacingApiError } from "../../lib/api-error-message";
import { getScentsxSalesOrderBilling, invoiceScentsxSalesOrder } from "../../api/scentsx";
import { tr } from "./perfumeI18n";

const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function ScentsxSalesOrderInvoice({ salesOrderId }: { salesOrderId: string }) {
  const { pushToast } = useToast();
  const [channel, setChannel] = useState<"wholesale" | "retail" | "export">("wholesale");
  const [busy, setBusy] = useState(false);
  const bill = useQuery({ queryKey: ["scentsx", "so-billing", salesOrderId], queryFn: () => getScentsxSalesOrderBilling(salesOrderId) });
  if (bill.isError) return <ListErrorState title={tr("scentsx.inv.error", "Couldn't load ScentsX billing")} status={0} message={(bill.error as Error)?.message} onRetry={() => void bill.refetch()} />;
  const lines = bill.data?.lines ?? [];
  const toBill = lines.reduce((s, l) => s + l.to_bill, 0);
  const run = async () => {
    setBusy(true);
    try {
      const { invoice } = await invoiceScentsxSalesOrder(salesOrderId, channel);
      pushToast(`Invoice ${invoice.display_id} drafted in ScentsX's books (${invoice.units} units)`, "success");
      void bill.refetch();
    } catch (e) { pushToast(userFacingApiError(e, "Not invoiced"), "error"); } finally { setBusy(false); }
  };
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3 text-xs" data-testid="scentsx-so-invoice">
      <div className="text-section-header">{tr("scentsx.inv.title", "ScentsX invoice")}</div>
      <div className="flex flex-wrap items-center gap-2">
        <span>{tr("scentsx.inv.left", "Shipped units not yet invoiced")}: <b className="tabular-nums">{toBill}</b></span>
        <select className="h-[30px] rounded-sm border border-[#C6D1DC] px-2" aria-label={tr("scentsx.inv.channel", "Sales channel")} value={channel}
          onChange={(e) => setChannel(e.target.value as typeof channel)}>
          <option value="wholesale">{tr("scentsx.inv.wholesale", "Wholesale")}</option>
          <option value="retail">{tr("scentsx.inv.retail", "Retail")}</option>
          <option value="export">{tr("scentsx.inv.export", "Export")}</option>
        </select>
        <Button type="button" className="h-[30px] px-3 text-xs" disabled={busy || toBill === 0} onClick={() => void run()} data-testid="scentsx-so-invoice-run">
          {tr("scentsx.inv.run", "Invoice shipped units")}</Button>
      </div>
      {(bill.data?.invoices ?? []).filter((d) => d.invoice_id).map((d) => (
        <div key={d.id} className="flex gap-2">
          <EntityLink kind="invoice" id={d.invoice_id} label={d.invoice_number ?? tr("scentsx.inv.invoice", "Invoice")} />
          <span className="text-[#64748B]">{d.invoice_status ?? ""} · {money(Number(d.invoice_total_cents ?? 0))}</span>
        </div>
      ))}
    </section>
  );
}
