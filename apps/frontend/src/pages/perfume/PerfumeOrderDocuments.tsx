/**
 * PERFUME M22 (LEAD ROUND L.32): the sales order's documents — the packing slip (no prices, server-rendered like the count sheet) and
 * the ScentsX invoices made from it (the books' own invoice document) — printed, or e-mailed as a PDF from jpm@tioperfumes.com.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { openPrintableDocument } from "../../lib/openPrintableDocument";
import { emailPerfumeOrderDocument, getPerfumeOrderInvoices } from "../../api/perfume";
import { money, usDate } from "./perfumeDocParts";

const btn = "h-[28px] rounded-sm border border-[#1F2A44] bg-white px-2 text-xs font-semibold text-[#1F2A44] disabled:opacity-50";
const ctl = "h-[28px] rounded-sm border border-[#C6D1DC] px-1 text-xs";

export function PerfumeOrderDocuments({ orderId, number, customerEmail }: { orderId: string; number: string; customerEmail: string | null }) {
  const { pushToast } = useToast();
  const inv = useQuery({ queryKey: ["perfume", "order-invoices", orderId], queryFn: () => getPerfumeOrderInvoices(orderId) });
  const [doc, setDoc] = useState<"packing_slip" | "invoice">("packing_slip");
  const [invoiceId, setInvoiceId] = useState("");
  const [to, setTo] = useState(customerEmail ?? "");
  const [busy, setBusy] = useState(false);
  const invoices = inv.data?.invoices ?? [];
  const co = inv.data?.operating_company_id ?? null;
  const send = async () => {
    setBusy(true);
    try {
      const r = await emailPerfumeOrderDocument(orderId, { doc, to, ...(doc === "invoice" && invoiceId ? { invoice_id: invoiceId } : {}) });
      pushToast(`${r.file} sending to ${r.recipients} address${r.recipients === 1 ? "" : "es"}`, "success");
    } catch (e) { pushToast(userFacingApiError(e, "Not sent"), "error"); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-[3px] border border-[#D8E0E8] p-3 text-xs" data-testid="perfume-order-documents">
      <div className="font-bold uppercase text-[#14314F]">Documents</div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => openPrintableDocument(`/api/v1/perfume/orders/${encodeURIComponent(orderId)}/packing-slip.html`)} data-testid="perfume-order-print-slip">
          {`Print packing slip ${number}`}
        </button>
        {invoices.map((i) => (
          <button key={i.id} type="button" className={btn} disabled={!co} data-testid={`perfume-order-print-invoice-${i.id}`}
            onClick={() => co && openPrintableDocument(`/api/v1/accounting/invoices/${encodeURIComponent(i.id)}.html?operating_company_id=${encodeURIComponent(co)}`)}>
            {`Print invoice ${i.display_id ?? i.id.slice(0, 8)} · ${money(i.total_cents)} · ${usDate(i.issue_date)}`}
          </button>
        ))}
        {!invoices.length ? <span className="text-gray-600">No ScentsX invoice yet — invoice the shipped units to print or e-mail one.</span> : null}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label>E-mail{" "}
          <select className={ctl} value={doc} onChange={(e) => setDoc(e.target.value as typeof doc)} data-testid="perfume-order-email-doc">
            <option value="packing_slip">Packing slip</option>
            <option value="invoice" disabled={!invoices.length}>Invoice</option>
          </select>
        </label>
        {doc === "invoice" && invoices.length > 1 ? (
          <select className={ctl} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} aria-label="Invoice" data-testid="perfume-order-email-invoice">
            <option value="">Newest</option>{invoices.map((i) => <option key={i.id} value={i.id}>{i.display_id ?? "Invoice (no number yet)"}</option>)}
          </select>
        ) : null}
        <label className="min-w-[260px] flex-1">To <input className={`${ctl} w-full`} value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com, …" data-testid="perfume-order-email-to" /></label>
        <button type="button" className={btn} disabled={busy || !to.trim()} onClick={() => void send()} data-testid="perfume-order-email-send">{busy ? "Sending…" : "Send as PDF from jpm@tioperfumes.com"}</button>
      </div>
    </div>
  );
}
