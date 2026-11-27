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
import { addScentsxExportProof, getScentsxCompany, getScentsxSalesOrderBilling, invoiceScentsxSalesOrder } from "../../api/scentsx";
import { uploadSourceDocumentFromFile } from "../../api/docs";
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
      <ComplianceLine data={bill.data} />
      <ExportProofBox salesOrderId={salesOrderId} proofs={bill.data?.export_proofs ?? []} onDone={() => void bill.refetch()} />
      {(bill.data?.invoices ?? []).filter((d) => d.invoice_id).map((d) => (
        <div key={d.id} className="flex gap-2">
          <EntityLink kind="invoice" id={d.invoice_id} label={d.invoice_number ?? tr("scentsx.inv.invoice", "Invoice")} />
          <span className="text-[#64748B]">{d.invoice_status ?? ""} · {money(Number(d.invoice_total_cents ?? 0))}</span>
        </div>
      ))}
    </section>
  );
}

const SANCTIONS_TEXT = {
  never_screened: "Not screened against the OFAC list yet — screen it on Books → Compliance before invoicing.",
  list_changed: "The OFAC list changed since this customer was screened — it is re-screened on the next daily load or from Books → Compliance.",
  possible_match: "Possible OFAC match waiting for your decision on Books → Compliance — no invoice until it is cleared.",
  confirmed_match: "Confirmed OFAC match — no sale.",
} as const;

function ComplianceLine({ data }: { data?: { export_proof_on_file: boolean; resale_certificate_on_file: boolean; sanctions: { blocked: boolean; reason: keyof typeof SANCTIONS_TEXT | null } | null } }) {
  if (!data) return null;
  return (
    <div className="space-y-0.5" data-testid="scentsx-so-compliance">
      {data.sanctions?.blocked && data.sanctions.reason ? <div className="font-semibold text-[#B91C1C]">{SANCTIONS_TEXT[data.sanctions.reason]}</div> : null}
      <div className="text-[#64748B]">
        {tr("scentsx.inv.tax", "Texas sales tax")}: {data.export_proof_on_file ? "export proof on file — an export invoice is tax-free" : data.resale_certificate_on_file ? "resale certificate on file — tax-free resale" : "no resale certificate and no export proof — add sales tax on the invoice before finalizing"}
      </div>
    </div>
  );
}

function ExportProofBox({ salesOrderId, proofs, onDone }: { salesOrderId: string; proofs: Array<{ id: string; proof_kind: string; document_number: string | null; crossed_on: string | null }>; onDone: () => void }) {
  const { pushToast } = useToast();
  const co = useQuery({ queryKey: ["scentsx", "company"], queryFn: getScentsxCompany });
  const [kind, setKind] = useState<"broker_export_certification" | "foreign_import_papers" | "bill_of_lading_outside_us">("foreign_import_papers");
  const [docNo, setDocNo] = useState("");
  const [crossed, setCrossed] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const label = { broker_export_certification: "Customs broker export certification", foreign_import_papers: "Foreign import papers (pedimento)", bill_of_lading_outside_us: "Bill of lading to a point outside the US" };
  const save = async () => {
    const companyId = co.data?.company.id;
    if (!file || !companyId) return;
    setBusy(true);
    try {
      const fileId = await uploadSourceDocumentFromFile(file, { operating_company_id: companyId });
      if (!fileId) throw new Error("The file did not upload");
      await addScentsxExportProof({ sales_order_id: salesOrderId, proof_kind: kind, document_number: docNo || null, crossed_on: crossed || null, file_id: fileId });
      pushToast("Export proof saved", "success"); setFile(null); setDocNo(""); onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-1 border-t border-[#E5EAF0] pt-2" data-testid="scentsx-export-proof">
      <div className="font-semibold">{tr("scentsx.inv.proof", "Export proof")}</div>
      {proofs.map((p) => <div key={p.id} className="text-[#64748B]">{label[p.proof_kind as keyof typeof label] ?? p.proof_kind}{p.document_number ? ` · ${p.document_number}` : ""}{p.crossed_on ? ` · crossed ${p.crossed_on}` : ""}</div>)}
      <div className="flex flex-wrap items-center gap-2">
        <select className="h-[30px] rounded-sm border border-[#C6D1DC] px-2" aria-label="Proof kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          {Object.entries(label).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input className="h-[30px] rounded-sm border border-[#C6D1DC] px-2" placeholder="Document number" aria-label="Document number" value={docNo} onChange={(e) => setDocNo(e.target.value)} />
        <input type="date" className="h-[30px] rounded-sm border border-[#C6D1DC] px-2" aria-label="Crossed on" value={crossed} onChange={(e) => setCrossed(e.target.value)} />
        <input type="file" accept="image/*,application/pdf" aria-label="Proof file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Button type="button" className="h-[30px] px-3 text-xs" disabled={busy || !file || !co.data} onClick={() => void save()}>{tr("scentsx.inv.proof_save", "Save proof")}</Button>
      </div>
    </div>
  );
}
