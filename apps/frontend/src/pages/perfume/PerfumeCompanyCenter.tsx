/**
 * PERFUME M19 (LEAD ROUND L.32): the customer center / vendor center, QuickBooks style, on the ONE company record — open
 * A/R and A/P (the books' own aging), every transaction (quotes, sales orders, invoices, payments, credit memos, purchase
 * orders, bills, bill payments, vendor credits) where each row opens its document, the statement, and the notes.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { getPerfumeCompanyCenter, savePerfumeCompanyNotes, type PerfumeCenterTxn } from "../../api/perfume";
import { CustomerStatement } from "./PerfumeReturnsParts";
import { DASH, DocLink, money, usDate } from "./perfumeDocParts";

const TYPES: PerfumeCenterTxn["type"][] = ["Quote", "Sales order", "Invoice", "Payment", "Credit memo", "Purchase order", "Bill", "Bill payment", "Vendor credit"];

function Opener({ t }: { t: PerfumeCenterTxn }) {
  const label = t.number ?? t.id.slice(0, 8);
  if (t.tab) return <DocLink tab={t.tab} id={t.id}>{label}</DocLink>;
  if (t.path) return <Link className="underline" to={t.path} onClick={(e) => e.stopPropagation()}>{label}</Link>;
  return <>{label}</>;
}

/** `view` — the company profile page (owner 2026-11-28 14:02 CT "similar to QuickBooks … under that the tabs") shows ONE part per tab:
 *  the header carries the balances, so with a view the KPI strip and the inner tab buttons are left out. */
export function PerfumeCompanyCenter({ companyId, view }: { companyId: string; view?: "txns" | "statement" | "notes" }) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const q = useQuery({ queryKey: ["perfume", "company-center", companyId], queryFn: () => getPerfumeCompanyCenter(companyId) });
  const [tabState, setTab] = useState<"txns" | "statement" | "notes">("txns");
  const tab = view ?? tabState;
  const [side, setSide] = useState<"all" | "customer" | "vendor">("all");
  const [type, setType] = useState<string>("");
  const [notes, setNotes] = useState("");
  useEffect(() => { setNotes(q.data?.notes ?? ""); }, [q.data?.notes]);
  if (!q.data) return null;
  const d = q.data;
  const rows = d.transactions.filter((t) => (side === "all" || t.side === side) && (!type || t.type === type));
  const saveNotes = async () => {
    try { await savePerfumeCompanyNotes(companyId, notes.trim() ? notes : null); await qc.invalidateQueries({ queryKey: ["perfume", "company-center", companyId] }); pushToast("Notes saved", "success"); }
    catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
  };
  const tabBtn = (k: typeof tab, label: string) => (
    <button type="button" onClick={() => setTab(k)} data-testid={`perfume-center-tab-${k}`} aria-pressed={tab === k}
      className={`h-[30px] rounded-sm border px-3 text-xs font-semibold ${tab === k ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-300 bg-[var(--surface-unselected)] text-[#1F2A44] hover:bg-[var(--surface-hover)]"}`}>{label}</button>
  );
  return (
    <div className="space-y-3" data-testid="perfume-company-center">
      {view ? null : <div className="grid grid-cols-2 gap-[10px] md:grid-cols-4">
        <KpiCard label="Open balance — they owe us (A/R)" number={money(d.open_ar_cents)} to="/perfume?tab=receivables" />
        <KpiCard label="Overdue A/R" number={money(d.ar_aging.b1 + d.ar_aging.b2 + d.ar_aging.b3)} to="/perfume?tab=receivables" />
        <KpiCard label="Open balance — we owe them (A/P)" number={money(d.open_ap_cents)} to="/perfume?tab=payables" />
        <KpiCard label="Transactions" number={d.transactions.length.toLocaleString("en-US")} onClick={() => { setSide("all"); setType(""); setTab("txns"); }} />
      </div>}
      {view ? null : <div className="flex flex-wrap gap-2">
        {tabBtn("txns", "Transactions")}
        {tabBtn("statement", "Statement")}
        {tabBtn("notes", "Notes")}
      </div>}
      {tab === "txns" ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label>Side{" "}
              <select className="h-[28px] rounded-sm border border-[#C6D1DC] px-1" value={side} onChange={(e) => setSide(e.target.value as typeof side)} data-testid="perfume-center-side">
                <option value="all">Customer + vendor</option><option value="customer">As a customer</option><option value="vendor">As a vendor</option>
              </select>
            </label>
            <label>Type{" "}
              <select className="h-[28px] rounded-sm border border-[#C6D1DC] px-1" value={type} onChange={(e) => setType(e.target.value)} data-testid="perfume-center-type">
                <option value="">All types</option>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <ParityTable<PerfumeCenterTxn> selectable
            cardTitle title="Transactions" rows={rows} rowKey={(t) => t.key} storageKey="perfume-company-center-txns-v1"
            exportFilename={`${d.company.name} transactions`} exportExcel emptyText="No transactions with this company yet."
            columns={[
              { className: "text-left", key: "date", label: "Date", sortable: true, render: (t) => (t.date ? usDate(t.date) : DASH), exportValue: (t) => t.date ?? "" },
              { className: "text-left", key: "type", label: "Type", sortable: true, render: (t) => t.type, exportValue: (t) => t.type },
              { className: "text-left", key: "number", label: "No.", render: (t) => <Opener t={t} />, exportValue: (t) => t.number ?? "" },
              { className: "text-left", key: "side", sortable: true, label: "As", render: (t) => (t.side === "customer" ? "Customer" : "Vendor"), exportValue: (t) => t.side },
              { className: "text-left", key: "due_date", sortable: true, label: "Due", render: (t) => (t.due_date ? usDate(t.due_date) : DASH), exportValue: (t) => t.due_date ?? "" },
              { className: "text-left", key: "status", sortable: true, label: "Status", render: (t) => t.status ?? DASH, exportValue: (t) => t.status ?? "" },
              { key: "amount_cents", label: "Amount", kind: "money", cellClass: "text-right tabular-nums", sortable: true, render: (t) => money(t.amount_cents), exportValue: (t) => t.amount_cents / 100 },
              { key: "open_cents", sortable: true, label: "Open", kind: "money", cellClass: "text-right tabular-nums", render: (t) => (t.open_cents == null ? DASH : money(t.open_cents)), exportValue: (t) => (t.open_cents == null ? "" : t.open_cents / 100) },
            ]}
          />
        </>
      ) : null}
      {tab === "statement" ? (
        d.customer_ids.length
          ? d.customer_ids.map((cid) => <CustomerStatement key={cid} companyId={d.operating_company_id} customerId={cid} />)
          : <p className="text-xs text-gray-600" data-testid="perfume-center-no-statement">Not a ScentsX customer yet — use "Make ScentsX customer" on its profile to start its statement.</p>
      ) : null}
      {tab === "notes" ? (
        <div className="space-y-2">
          <textarea className="block min-h-[120px] w-full rounded-sm border border-[#C6D1DC] p-2 text-xs" value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="perfume-center-notes" />
          <button type="button" onClick={() => void saveNotes()} disabled={(q.data.notes ?? "") === notes} data-testid="perfume-center-notes-save"
            className="h-[30px] rounded-sm border border-[#1F2A44] bg-[#1F2A44] px-3 text-xs font-semibold text-white disabled:opacity-50">Save notes</button>
        </div>
      ) : null}
    </div>
  );
}
