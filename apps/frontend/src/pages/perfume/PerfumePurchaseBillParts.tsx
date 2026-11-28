/**
 * TIO Perfumes · Bill a received purchase order (migration 202617120100; owner 2026-11-27 15:05 CT "fully wire … ap … vendors").
 * The vendor's invoice for received units becomes a ScentsX A/P bill: POST /api/v1/scentsx/purchase-orders/:id/bill runs the one
 * bill writer + bill poster (Dr Goods Received Not Billed 2050 at the vendor's price / Cr A/P 2000), moves a price difference
 * between GRNI and COGS, and books freight or other charges to the account picked. This screen only collects what is on the
 * vendor's invoice: their invoice number, dates, units and price per line, and extra charges.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "../../components/Button";
import { ParityTable } from "../../components/parity/ParityTable";
import { DatePicker } from "../../components/forms/DatePicker";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { billScentsxPurchaseOrder, creditScentsxVendorReturn, getScentsxPoBillable, listScentsxAccounts, type ScentsxBillablePoLine, type ScentsxPoBill } from "../../api/scentsx";
import { tr } from "./perfumeI18n";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { ctl, DASH, money, usDate } from "./perfumeDocParts";

const todayCT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
type Charge = { account_id: string; description: string; amount_cents: number | null };

/** Received cost per unit still waiting for a bill (what GRNI holds for each unit of the line). */
const receivedUnit = (l: ScentsxBillablePoLine) =>
  l.to_bill > 0 ? Math.round((l.received_value_cents - l.billed_received_value_cents) / l.to_bill) : l.unit_cost_cents;

export function PurchaseBillForm({ poId, poNumber, onDone }: { poId: string; poNumber: string; onDone: () => void }) {
  const { pushToast } = useToast();
  const q = useQuery({ queryKey: ["scentsx", "po-billable", poId], queryFn: () => getScentsxPoBillable(poId) });
  const accts = useQuery({ queryKey: ["scentsx", "accounts"], queryFn: listScentsxAccounts, staleTime: 300_000 });
  const [open, setOpen] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [billDate, setBillDate] = useState(todayCT());
  const [dueDate, setDueDate] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [price, setPrice] = useState<Record<string, number | null>>({});
  const [lineAcct, setLineAcct] = useState<Record<string, string>>({});
  const [charges, setCharges] = useState<Charge[]>([]);
  const [busy, setBusy] = useState(false);
  const postable = useMemo(() => (accts.data?.accounts ?? []).filter((a) => a.account_number), [accts.data]);
  if (q.isError) return <ListErrorState title={tr("perfume.pbill.error", "Couldn't load what is left to bill")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />;
  if (!q.data) return null;
  const lines = q.data.lines;
  const leftUnits = lines.reduce((s, l) => s + l.to_bill, 0);
  const qtyOf = (l: ScentsxBillablePoLine) => qty[l.po_line_id] ?? l.to_bill;
  const priceOf = (l: ScentsxBillablePoLine) => { const t = price[l.po_line_id]; return t == null ? receivedUnit(l) : t; };
  const picked = lines.filter((l) => qtyOf(l) > 0 && l.to_bill > 0);
  const linesTotal = picked.reduce((s, l) => s + qtyOf(l) * (priceOf(l) ?? 0), 0);
  const chargeCents = charges.map((c) => c.amount_cents);
  const total = linesTotal + chargeCents.reduce<number>((s, c) => s + (c ?? 0), 0);
  const variance = picked.filter((l) => l.item_id).reduce((s, l) => s + qtyOf(l) * ((priceOf(l) ?? 0) - receivedUnit(l)), 0);
  const problem = !invoiceNo.trim() ? tr("perfume.pbill.need_no", "Type the vendor's invoice number")
    : !picked.length ? tr("perfume.pbill.need_line", "Nothing to bill")
    : picked.find((l) => qtyOf(l) > l.to_bill) ? tr("perfume.pbill.too_many", "More units than received and not billed")
    : picked.find((l) => !l.item_id && !lineAcct[l.po_line_id]) ? tr("perfume.pbill.need_acct", "Pick the account for each line with no item")
    : charges.find((c, i) => !c.account_id || !c.description.trim() || !chargeCents[i]) ? tr("perfume.pbill.bad_charge", "Each charge needs an account, what it is and an amount")
    : null;
  const save = async () => {
    setBusy(true);
    try {
      const res = await billScentsxPurchaseOrder(poId, {
        vendor_invoice_number: invoiceNo.trim(), bill_date: billDate, due_date: dueDate || null,
        lines: picked.map((l) => {
          const typed = price[l.po_line_id];
          return { po_line_id: l.po_line_id, qty: qtyOf(l), ...(typed != null ? { unit_price_cents: typed } : {}),
            ...(l.item_id ? {} : { account_id: lineAcct[l.po_line_id] }) };
        }),
        charges: charges.map((c, i) => ({ account_id: c.account_id, description: c.description.trim(), amount_cents: chargeCents[i]! })),
      });
      pushToast(`${res.display_id ?? "Bill"} posted — ${money(res.amount_cents)} to A/P${res.variance_cents ? ` · price difference ${money(-res.variance_cents)} to COGS` : ""}`, "success");
      setOpen(false); setInvoiceNo(""); setQty({}); setPrice({}); setCharges([]);
      await q.refetch(); onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Bill not posted"), "error"); } finally { setBusy(false); }
  };
  return (
    <section className="space-y-2" data-testid="perfume-po-bills">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-[#1F2A44]">{`${tr("perfume.pbill.title", "Vendor bills")} · ${leftUnits.toLocaleString("en-US")} ${tr("perfume.pbill.left", "units received and not billed")}`}</div>
        <Button type="button" className="h-[34px] px-3 text-xs" disabled={!leftUnits} onClick={() => setOpen(!open)} data-testid="perfume-po-bill-open">{tr("perfume.pbill.enter", "Enter vendor bill")}</Button>
      </div>
      {lines.some((l) => l.to_credit > 0) ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[3px] border border-[#F59E0B] bg-[#FFFBEB] p-2 text-xs" data-testid="perfume-po-credit-due">
          <span>{`${lines.reduce((s, l) => s + l.to_credit, 0).toLocaleString("en-US")} ${tr("perfume.pbill.credit_due", "billed units were returned to the vendor — the vendor owes a credit")}`}</span>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy} data-testid="perfume-po-credit-issue" onClick={() => void (async () => {
            setBusy(true);
            try {
              const r = await creditScentsxVendorReturn(poId, { credit_date: todayCT(), lines: lines.filter((l) => l.to_credit > 0).map((l) => ({ po_line_id: l.po_line_id, qty: l.to_credit })) });
              pushToast(`${r.display_id} — vendor credit ${money(r.amount_cents)} (apply it to a bill in Payables)`, "success");
              await q.refetch(); onDone();
            } catch (e) { pushToast(userFacingApiError(e, "Vendor credit not issued"), "error"); } finally { setBusy(false); }
          })()}>{tr("perfume.pbill.credit_issue", "Issue vendor credit")}</Button>
        </div>) : null}
      {open ? (
        <div className="space-y-2 rounded-[3px] border border-[#D8E0E8] p-3" data-testid="perfume-po-bill-form" aria-label={`${tr("perfume.pbill.title", "Vendor bill")} ${poNumber}`}>
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label>{tr("perfume.pbill.no", "Vendor invoice #")} <input className={`${ctl} block w-[160px]`} aria-label={tr("perfume.pbill.no", "Vendor invoice #")} value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} data-testid="perfume-po-bill-no" /></label>
            <label>{tr("perfume.pbill.date", "Bill date")} <DatePicker aria-label={tr("perfume.pbill.date", "Bill date")} value={billDate} onChange={(v) => setBillDate(v || todayCT())} /></label>
            <label>{tr("perfume.pbill.due", "Due date")} <DatePicker aria-label={tr("perfume.pbill.due", "Due date")} value={dueDate} onChange={(v) => setDueDate(v || "")} /></label>
            <span className="text-[#64748B]">{tr("perfume.pbill.due_help", "Blank = from the PO terms (Net 30 …), else due on receipt.")}</span>
          </div>
          <ParityTable<ScentsxBillablePoLine> selectable
            rows={lines} rowKey={(l) => l.po_line_id} storageKey="perfume-po-bill-lines-v1" emptyText="No lines on this PO."
            columns={[
              { key: "line_no", label: "#", kind: "number", cellClass: "text-right tabular-nums", render: (l) => String(l.line_no) },
              { className: "text-left", key: "description", label: "Item", render: (l) => l.description, exportValue: (l) => l.description },
              { key: "received", label: "Received", kind: "number", cellClass: "text-right tabular-nums", render: (l) => l.received.toLocaleString("en-US") },
              { key: "billed", label: "Billed before", kind: "number", cellClass: "text-right tabular-nums", render: (l) => l.billed.toLocaleString("en-US") },
              { key: "unit", label: "Received at", kind: "number", cellClass: "text-right tabular-nums", render: (l) => money(receivedUnit(l)) },
              { key: "qty", label: "Units billed", render: (l) => (
                <input type="number" min={0} max={l.to_bill} className={`${ctl} w-[80px] text-right`} aria-label={`Units billed line ${l.line_no}`} disabled={l.to_bill <= 0}
                  value={l.to_bill > 0 ? qtyOf(l) : 0} onChange={(e) => setQty({ ...qty, [l.po_line_id]: e.target.value === "" ? 0 : Math.max(0, Math.floor(Number(e.target.value))) })}
                  data-testid={`perfume-po-bill-qty-${l.line_no}`} />) },
              { key: "price", label: "Vendor price", render: (l) => (
                <span data-testid={`perfume-po-bill-price-${l.line_no}`}><MoneyInput className="w-[96px]" ariaLabel={`Vendor price line ${l.line_no}`} disabled={l.to_bill <= 0}
                  placeholder={(receivedUnit(l) / 100).toFixed(2)} valueCents={price[l.po_line_id] ?? null} onChangeCents={(v) => setPrice({ ...price, [l.po_line_id]: v })} /></span>) },
              { key: "account", label: "Account", render: (l) => l.item_id ? <span className="text-[#64748B]">{tr("perfume.pbill.grni", "2050 Goods Received Not Billed")}</span> : (
                <select className={`${ctl} w-[220px]`} aria-label={`Account line ${l.line_no}`} value={lineAcct[l.po_line_id] ?? ""} onChange={(e) => setLineAcct({ ...lineAcct, [l.po_line_id]: e.target.value })}
                  data-testid={`perfume-po-bill-acct-${l.line_no}`}>
                  <option value="">{tr("perfume.pbill.pick", "Pick account")}</option>
                  {postable.map((a) => <option key={a.id} value={a.id}>{`${a.account_number} ${a.account_name}`}</option>)}
                </select>) },
              { key: "total", label: "Line total", kind: "number", cellClass: "text-right tabular-nums", render: (l) => l.to_bill > 0 ? money(qtyOf(l) * (priceOf(l) ?? 0)) : DASH },
            ]}
          />
          <div className="space-y-1 text-xs" data-testid="perfume-po-bill-charges">
            {charges.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select className={`${ctl} w-[240px]`} aria-label={`Charge ${i + 1} account`} value={c.account_id} onChange={(e) => setCharges(charges.map((x, j) => (j === i ? { ...x, account_id: e.target.value } : x)))}>
                  <option value="">{tr("perfume.pbill.pick", "Pick account")}</option>
                  {postable.map((a) => <option key={a.id} value={a.id}>{`${a.account_number} ${a.account_name}`}</option>)}
                </select>
                <input className={`${ctl} w-[220px]`} aria-label={`Charge ${i + 1} description`} placeholder={tr("perfume.pbill.charge_what", "Freight, handling …")} value={c.description}
                  onChange={(e) => setCharges(charges.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                <MoneyInput className="w-[110px]" ariaLabel={`Charge ${i + 1} amount`} placeholder="0.00" valueCents={c.amount_cents}
                  onChangeCents={(v) => setCharges(charges.map((x, j) => (j === i ? { ...x, amount_cents: v } : x)))} />
                <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={() => setCharges(charges.filter((_, j) => j !== i))}>{tr("perfume.pbill.remove", "Remove")}</Button>
              </div>
            ))}
            <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={() => setCharges([...charges, { account_id: "", description: "", amount_cents: null }])} data-testid="perfume-po-bill-add-charge">
              {tr("perfume.pbill.add_charge", "Add freight / other charge")}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-4 text-xs">
            {variance ? <span data-testid="perfume-po-bill-variance">{`${tr("perfume.pbill.variance", "Price difference to COGS")} ${money(variance)}`}</span> : null}
            <span className="font-semibold" data-testid="perfume-po-bill-total">{`${tr("perfume.pbill.total", "Bill total")} ${money(total)}`}</span>
            {problem ? <span className="text-[#B91C1C]">{problem}</span> : null}
            <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || Boolean(problem)} onClick={() => void save()} data-testid="perfume-po-bill-save">{tr("perfume.pbill.post", "Post bill")}</Button>
          </div>
        </div>
      ) : null}
      <ParityTable<ScentsxPoBill> selectable
        rows={q.data.bills} rowKey={(b) => b.id} storageKey="perfume-po-bill-list-v1" exportFilename={`${poNumber} bills`} exportExcel emptyText="No vendor bills on this PO yet."
        columns={[
          { className: "text-left", key: "display_id", label: "Bill", render: (b) => <Link className="underline" to={`/accounting/bills/${encodeURIComponent(b.id)}`}>{b.display_id ?? b.id.slice(0, 8)}</Link>, exportValue: (b) => b.display_id ?? "" },
          { className: "text-left", key: "bill_number", label: "Vendor invoice", render: (b) => b.bill_number ?? DASH, exportValue: (b) => b.bill_number ?? "" },
          { key: "bill_date", label: "Date", cellClass: "text-right tabular-nums", render: (b) => usDate(b.bill_date), exportValue: (b) => b.bill_date },
          { key: "due_date", label: "Due", cellClass: "text-right tabular-nums", render: (b) => (b.due_date ? usDate(b.due_date) : DASH), exportValue: (b) => b.due_date ?? "" },
          { key: "units", label: "Units", kind: "number", cellClass: "text-right tabular-nums", render: (b) => (b.units ?? 0).toLocaleString("en-US") },
          { key: "amount_cents", label: "Amount", kind: "number", cellClass: "text-right tabular-nums", render: (b) => money(b.amount_cents), exportValue: (b) => b.amount_cents / 100 },
          { className: "text-left", key: "status", label: "Status", render: (b) => (b.voided ? "Voided" : b.status), exportValue: (b) => (b.voided ? "Voided" : b.status) },
        ]}
      />
    </section>
  );
}
