/**
 * TIO Perfumes · Customers · Salespeople — ROUND L.31 M18 E3 (CONTROL "Salesman"; owner 2026-11-27 22:54 CT "… customers … fully total
 * and complete"). Who sells for TIO and their commission %, each customer's salesperson (one at a time, every change kept as history),
 * and QuickBooks-style "Sales by rep": each salesperson's customers, their sales in the dates (ScentsX invoices before tax + the imported
 * purchase history), and the commission. Read only on money — a commission actually paid goes through Expenses & checks / a bill.
 * The owner's "LISTA DE CLIENTES POR VENDEDOR" holds customer names only (no salesperson column), so assignments are made here, never
 * guessed from it.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { DatePicker } from "../../components/forms/DatePicker";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { formatUsdCents } from "../../lib/money";
import { listPerfumeContacts } from "../../api/perfume";
import {
  assignPerfumeSalesperson, createPerfumeSalesperson, getPerfumeRepCustomers, getPerfumeSalesByRep, listPerfumeSalespeople, updatePerfumeSalesperson,
  type PerfumeRepCustomer, type PerfumeRepRow, type PerfumeSalesperson,
} from "../../api/perfume-salespeople";
import { tr } from "./perfumeI18n";
import { ctl, DASH, usDate } from "./perfumeDocParts";

const todayCT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
const fmt = (c: number, cur: "USD" | "MXN") => (cur === "USD" ? formatUsdCents(c) : `MX${formatUsdCents(c)}`);

export function PerfumeSalespeoplePanel() {
  const [from, setFrom] = useState(`${todayCT().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(todayCT());
  const [cur, setCur] = useState<"USD" | "MXN">("USD");
  const people = useQuery({ queryKey: ["perfume", "salespeople"], queryFn: listPerfumeSalespeople });
  const rep = useQuery({ queryKey: ["perfume", "sales-by-rep", from, to, cur], queryFn: () => getPerfumeSalesByRep(from, to, cur) });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PerfumeSalesperson | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [open, setOpen] = useState<PerfumeRepRow | null>(null);
  const refresh = async () => { await Promise.all([people.refetch(), rep.refetch()]); };
  if (people.isError) return <ListErrorState title={tr("perfume.sp.error", "Couldn't load the salespeople")} status={0} message={(people.error as Error)?.message} onRetry={() => void people.refetch()} />;
  const list = people.data?.salespeople ?? [];
  const byId = new Map(list.map((p) => [p.id, p]));
  return (
    <div className="space-y-3" data-testid="perfume-salespeople-panel">
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.sp.title", "Salespeople")}>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <div className="text-card-title mr-2">{tr("perfume.sp.title", "Salespeople")}</div>
          <label>{tr("perfume.sp.from", "From")} <DatePicker aria-label="From" value={from} onChange={(v) => setFrom(v || `${todayCT().slice(0, 4)}-01-01`)} /></label>
          <label>{tr("perfume.sp.to", "To")} <DatePicker aria-label="To" value={to} onChange={(v) => setTo(v || todayCT())} /></label>
          <label>{tr("perfume.sp.currency", "Currency")}
            <select className={`${ctl} block`} value={cur} onChange={(e) => setCur(e.target.value as "USD" | "MXN")} data-testid="perfume-sp-currency"><option value="USD">USD</option><option value="MXN">MXN</option></select>
          </label>
          <Button type="button" className="h-[34px] px-3 text-xs" onClick={() => setAdding(true)} data-testid="perfume-sp-new">{tr("perfume.sp.new", "+ Salesperson")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!list.some((p) => p.active)} onClick={() => setAssigning(true)} data-testid="perfume-sp-assign">{tr("perfume.sp.assign", "Assign customers")}</Button>
        </div>
        <div className="grid grid-cols-2 gap-[10px] md:grid-cols-4">
          <KpiCard label={tr("perfume.sp.k_people", "Salespeople")} number={String(list.filter((p) => p.active).length)} disabled />
          <KpiCard label={tr("perfume.sp.k_customers", "Customers assigned")} number={String(list.reduce((s, p) => s + p.customers, 0))} disabled />
          <KpiCard label={tr("perfume.sp.k_sales", "Sales")} number={fmt(rep.data?.totals.sales_cents ?? 0, cur)} disabled />
          <KpiCard label={tr("perfume.sp.k_comm", "Commission")} number={fmt(rep.data?.totals.commission_cents ?? 0, cur)} disabled />
        </div>
        {rep.isError ? <ListErrorState title={tr("perfume.sp.rep_error", "Couldn't load sales by salesperson")} status={0} message={(rep.error as Error)?.message} onRetry={() => void rep.refetch()} /> : (
          <>
            {/* TABLE_DATE_OMIT: one row per salesperson for the chosen dates — a summary, not a dated event. */}
            <ParityTable<PerfumeRepRow> selectable
              cardTitle title={tr("perfume.sp.by_rep", "Sales & commission by salesperson")} rows={rep.data?.rows ?? []} rowKey={(r) => r.salesperson_id ?? "unassigned"} loading={rep.isLoading || people.isLoading}
              storageKey="perfume-sp-rep-v1" exportFilename={`TIO sales by salesperson ${from} to ${to} ${cur}`} exportExcel emptyText="No salespeople yet — add one." onRowClick={(r) => setOpen(r)}
              columns={[
                { className: "text-left", cellClass: "text-left font-semibold", key: "salesperson", sortable: true, label: "Salesperson", render: (r) => <button type="button" className="text-left text-[#1D4ED8] hover:underline" onClick={(e) => { e.stopPropagation(); setOpen(r); }}>{r.salesperson}</button>, exportValue: (r) => r.salesperson },
                { key: "commission_pct", sortable: true, label: "Commission %", kind: "number", cellClass: "text-right tabular-nums", render: (r) => (r.salesperson_id ? `${r.commission_pct.toFixed(2)}%` : DASH), exportValue: (r) => r.commission_pct },
                { key: "customers", sortable: true, label: "Customers", kind: "number", cellClass: "text-right tabular-nums", render: (r) => String(r.customers), exportValue: (r) => r.customers },
                { key: "buying_customers", sortable: true, label: "Bought in dates", kind: "number", cellClass: "text-right tabular-nums", render: (r) => String(r.buying_customers), exportValue: (r) => r.buying_customers },
                { key: "invoice_sales_cents", sortable: true, label: "ScentsX invoices", kind: "number", cellClass: "text-right tabular-nums", render: (r) => fmt(r.invoice_sales_cents, cur), exportValue: (r) => r.invoice_sales_cents / 100 },
                { key: "history_sales_cents", sortable: true, label: "Purchase history", kind: "number", cellClass: "text-right tabular-nums", render: (r) => fmt(r.history_sales_cents, cur), exportValue: (r) => r.history_sales_cents / 100 },
                { key: "sales_cents", sortable: true, label: "Sales", kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (r) => fmt(r.sales_cents, cur), exportValue: (r) => r.sales_cents / 100 },
                { key: "commission_cents", sortable: true, label: "Commission", kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (r) => fmt(r.commission_cents, cur), exportValue: (r) => r.commission_cents / 100 },
                { key: "edit", sortable: false, label: "", render: (r) => (r.salesperson_id && byId.get(r.salesperson_id) ? <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={(e) => { e.stopPropagation(); setEditing(byId.get(r.salesperson_id!)!); }} data-testid={`perfume-sp-edit-${r.salesperson_id}`}>{tr("perfume.sp.edit", "Edit")}</Button> : DASH) },
              ]}
            />
            <p className="text-xs text-[#5B6B7F]">{tr("perfume.sp.note", "Sales are counted for each customer's CURRENT salesperson (like QuickBooks Sales by Rep): ScentsX invoices before tax plus the imported purchase history. Commission = sales × the salesperson's %.")}</p>
          </>
        )}
      </section>
      {open ? <RepCustomers row={open} from={from} to={to} cur={cur} onClose={() => setOpen(null)} /> : null}
      {adding ? <SalespersonModal onClose={() => setAdding(false)} onDone={async () => { setAdding(false); await refresh(); }} /> : null}
      {editing ? <SalespersonModal person={editing} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); await refresh(); }} /> : null}
      {assigning ? <AssignModal people={list.filter((p) => p.active)} onClose={() => setAssigning(false)} onDone={async () => { setAssigning(false); await refresh(); }} /> : null}
    </div>
  );
}

function RepCustomers({ row, from, to, cur, onClose }: { row: PerfumeRepRow; from: string; to: string; cur: "USD" | "MXN"; onClose: () => void }) {
  const q = useQuery({ queryKey: ["perfume", "rep-customers", row.salesperson_id, from, to, cur], queryFn: () => getPerfumeRepCustomers(row.salesperson_id, from, to, cur) });
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-sp-customers" aria-label={row.salesperson}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-card-title">{`${row.salesperson} · ${tr("perfume.sp.customers", "customers")}`}</div>
        <Button type="button" variant="secondary" className="h-[30px] px-2 text-xs" onClick={onClose}>{tr("perfume.sp.close", "Close")}</Button>
      </div>
      <ParityTable<PerfumeRepCustomer> selectable
        rows={q.data?.customers ?? []} rowKey={(c) => c.company_id} loading={q.isLoading} storageKey="perfume-sp-customers-v1" exportFilename={`TIO ${row.salesperson} customers`} exportExcel emptyText="No customers."
        columns={[
          { className: "text-left", cellClass: "text-left font-semibold", key: "name", sortable: true, label: "Customer", render: (c) => c.name, exportValue: (c) => c.name },
          { key: "assigned_at", sortable: true, label: "Since", cellClass: "text-right tabular-nums", render: (c) => (c.assigned_at ? usDate(c.assigned_at.slice(0, 10)) : DASH), exportValue: (c) => c.assigned_at ?? "" },
          { key: "invoice_sales_cents", sortable: true, label: "ScentsX invoices", kind: "number", cellClass: "text-right tabular-nums", render: (c) => fmt(c.invoice_sales_cents, cur), exportValue: (c) => c.invoice_sales_cents / 100 },
          { key: "history_sales_cents", sortable: true, label: "Purchase history", kind: "number", cellClass: "text-right tabular-nums", render: (c) => fmt(c.history_sales_cents, cur), exportValue: (c) => c.history_sales_cents / 100 },
          { key: "sales_cents", sortable: true, label: "Sales", kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (c) => fmt(c.sales_cents, cur), exportValue: (c) => c.sales_cents / 100 },
        ]}
      />
    </section>
  );
}

function SalespersonModal({ person, onClose, onDone }: { person?: PerfumeSalesperson; onClose: () => void; onDone: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [name, setName] = useState(person?.name ?? "");
  const [pct, setPct] = useState(person ? String(person.commission_pct) : "0");
  const [active, setActive] = useState(person?.active ?? true);
  const [busy, setBusy] = useState(false);
  const p = Number(pct);
  const ok = name.trim().length > 0 && Number.isFinite(p) && p >= 0 && p <= 100;
  const go = async () => {
    setBusy(true);
    try {
      if (person) await updatePerfumeSalesperson(person.id, { name: name.trim(), commission_pct: p, active });
      else await createPerfumeSalesperson({ name: name.trim(), commission_pct: p });
      pushToast(`${name.trim()} · ${p.toFixed(2)}%`, "success"); await onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={person ? `${tr("perfume.sp.edit", "Edit")} · ${person.name}` : tr("perfume.sp.new_title", "New salesperson")} size="sm" variant="drawer" data-testid="perfume-sp-modal">
      <div className="space-y-3 text-xs">
        <label className="block">{tr("perfume.sp.name", "Name")} *<input className={`${ctl} block w-full`} aria-label="Salesperson name" value={name} onChange={(e) => setName(e.target.value)} data-testid="perfume-sp-name" /></label>
        <label className="block">{tr("perfume.sp.pct", "Commission %")}<input className={`${ctl} block w-[120px] text-right`} aria-label="Commission percent" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} data-testid="perfume-sp-pct" /></label>
        {person ? <label className="flex items-center gap-2"><input type="checkbox" aria-label="Active" checked={active} onChange={(e) => setActive(e.target.checked)} />{tr("perfume.sp.active", "Active")}</label> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.sp.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void go()} data-testid="perfume-sp-save">{tr("perfume.sp.save", "Save")}</Button>
        </div>
      </div>
    </Modal>
  );
}

function AssignModal({ people, onClose, onDone }: { people: PerfumeSalesperson[]; onClose: () => void; onDone: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [sp, setSp] = useState(people[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const found = useQuery({ queryKey: ["perfume", "sp-assign-find", q], queryFn: () => listPerfumeContacts({ role: "customer", q, limit: 200 }), enabled: q.trim().length >= 2 });
  const rows = found.data?.rows ?? [];
  const go = async () => {
    setBusy(true);
    try {
      const r = await assignPerfumeSalesperson({ company_ids: picked, salesperson_id: sp || null });
      pushToast(`${r.changed} ${tr("perfume.sp.assigned", "assigned")}${r.unchanged ? ` · ${r.unchanged} ${tr("perfume.sp.already", "already theirs")}` : ""}`, "success"); await onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Not assigned"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={tr("perfume.sp.assign", "Assign customers")} size="md" data-testid="perfume-sp-assign-modal">
      <div className="space-y-3 text-xs">
        <label className="block">{tr("perfume.sp.to_sp", "Salesperson")}
          <select className={`${ctl} block w-full`} value={sp} onChange={(e) => setSp(e.target.value)} data-testid="perfume-sp-assign-to">
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="">{tr("perfume.sp.none", "No salesperson (remove)")}</option>
          </select>
        </label>
        <input type="search" className={`${ctl} block w-full`} aria-label="Find customers" placeholder={tr("perfume.sp.find", "Find customers (2+ letters)")} value={q} onChange={(e) => setQ(e.target.value)} data-testid="perfume-sp-assign-find" />
        {/* TABLE_DATE_OMIT: a pick list of customers to assign — not dated rows. */}
        <ParityTable<{ id: string; name: string }> selectable selectedKeys={picked} onSelectionChange={setPicked}
          rows={rows} rowKey={(r) => r.id} loading={found.isLoading && q.trim().length >= 2} storageKey="perfume-sp-assign-v1" emptyText={q.trim().length >= 2 ? "No customer matches." : "Type a name."}
          columns={[{ className: "text-left", cellClass: "text-left font-semibold", key: "name", sortable: true, label: "Customer", render: (r) => r.name }]}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.sp.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !picked.length} onClick={() => void go()} data-testid="perfume-sp-assign-save">{`${tr("perfume.sp.assign_n", "Assign")} ${picked.length}`}</Button>
        </div>
      </div>
    </Modal>
  );
}
