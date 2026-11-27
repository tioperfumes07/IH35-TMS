/**
 * PERFUME-PRICE-LEVELS + CUSTOMER-ACCOUNTS screens (owner 2026-11-26 20:21 CT: "different price levels credit limits approvals new
 * accounts new credit accounts"; 20:28 CT: Retail, Wholesale, Distributor, Export Mexico; he approves every new credit account
 * and any limit over $25,000). Two views:
 *  - Price levels: each level's rule (markup or margin % on my average cost or the best supplier cost) and its fixed prices.
 *  - Customer accounts: how each customer pays, its level, terms, limit, hold; credit applications and his decision; history.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  decidePerfumeCreditApplication, getPerfumeCustomerAccount, listPerfumeContacts, listPerfumeCreditApplications, listPerfumeCustomerAccounts, listPerfumeLevelItems,
  listPerfumePriceLevels, savePerfumeCustomerAccount, savePerfumePriceLevel, setPerfumeCustomerHold, setPerfumeLevelItem, submitPerfumeCreditApplication,
  type PerfumeAccountType, type PerfumeCreditApplication, type PerfumeCustomerAccount, type PerfumeLevelItem, type PerfumePriceLevel,
} from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { Badge, ctl, DASH, DocLink, HistoryTable, ItemFinder, money, NumberCell, toCents, useOpenDoc, usDate } from "./perfumeDocParts";

const TYPE_TEXT: Record<PerfumeAccountType, string> = { cash: "Cash and carry", prepaid: "Prepaid", credit: "Credit account", export: "Export Mexico" };
const APP_TEXT = { submitted: "Waiting for me", approved: "Approved", rejected: "Rejected", withdrawn: "Withdrawn" } as const;
const APP_CLASS = { submitted: "bg-[#8A4208]", approved: "bg-[#1F6B32]", rejected: "bg-[#9B2C2C]", withdrawn: "bg-[#64748B]" } as const;
const err = (push: (m: string, k: "error") => void) => (e: unknown) => push(userFacingApiError(e, "Not saved"), "error");

/* ------------------------------------------------------------------ Price levels */

export function PerfumePriceLevelsPanel() {
  const { pushToast } = useToast();
  const levels = useQuery({ queryKey: ["perfume", "price-levels"], queryFn: listPerfumePriceLevels });
  const [selected, setSelected] = useState<string | null>(null);
  if (levels.isError) return <ListErrorState title={tr("perfume.acct.levelsError", "Couldn't load the price levels")} status={0} message={(levels.error as Error)?.message} onRetry={() => void levels.refetch()} />;
  const save = (id: string, b: Parameters<typeof savePerfumePriceLevel>[1]) => void savePerfumePriceLevel(id, b).then(() => levels.refetch()).catch(err(pushToast));
  const rows = levels.data?.levels ?? [];
  const sel = rows.find((l) => l.id === selected) ?? null;
  return (
    <div className="space-y-3" data-testid="perfume-levels-panel">
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.acct.levels", "Price levels")}>
        <div className="text-xs text-[#64748B]">{tr("perfume.acct.levels_help", "A line with no price typed takes the customer's level: its fixed price for the quantity, else its % on the cost. A level with no % only uses its fixed prices.")}</div>
        {levels.data?.costs ? (
          <div className="text-xs" data-testid="perfume-level-costs">
            {`${tr("perfume.acct.costs", "Items with a cost")}: ${levels.data.costs.any_cost.toLocaleString("en-US")} — ${tr("perfume.acct.costs_avg", "my avg cost")} ${levels.data.costs.my_avg_cost.toLocaleString("en-US")} · ${tr("perfume.acct.costs_file", "my inventory file (last cost)")} ${levels.data.costs.inventory_file.toLocaleString("en-US")} · ${tr("perfume.acct.costs_vendor", "supplier lists")} ${levels.data.costs.vendor_lists.toLocaleString("en-US")} · ${tr("perfume.acct.costs_stock", "in stock")} ${levels.data.costs.stock.toLocaleString("en-US")}. ${tr("perfume.acct.costs_rule", "My average cost = stock average when in stock, else my avg cost, else my inventory file's last cost, else the best supplier cost.")}`}
          </div>) : null}
        <ParityTable<PerfumePriceLevel>
          rows={rows} rowKey={(l) => `${l.id}-${l.pct}-${l.method}-${l.cost_basis}-${l.floor_pct}-${l.tester_pct}`} loading={levels.isLoading} storageKey="perfume-levels-v1" exportFilename="TIO price levels" exportExcel
          emptyText="No price levels." onRowClick={(l) => setSelected(l.id)}
          columns={[
            { key: "name", label: "Level", render: (l) => <span className="font-semibold">{l.name}</span> },
            { key: "method", label: "Rule", render: (l) => (
              <select className={ctl} aria-label={tr("perfume.acct.method", "Rule")} value={l.method} onClick={(e) => e.stopPropagation()} onChange={(e) => save(l.id, { method: e.target.value as "markup" | "margin" })} data-testid={`perfume-level-method-${l.name}`}>
                <option value="markup">{tr("perfume.acct.markup", "Markup on cost")}</option><option value="margin">{tr("perfume.acct.margin", "Margin on price")}</option>
              </select>), exportValue: (l) => l.method },
            { key: "pct", label: "%", render: (l) => <PctCell value={l.pct} label={`${l.name} %`} testId={`perfume-level-pct-${l.name}`} onSave={(v) => save(l.id, { pct: v })} />, exportValue: (l) => l.pct ?? "" },
            { key: "cost_basis", label: "On which cost", render: (l) => (
              <select className={ctl} aria-label={tr("perfume.acct.basis", "On which cost")} value={l.cost_basis} onClick={(e) => e.stopPropagation()} onChange={(e) => save(l.id, { cost_basis: e.target.value as "avg" | "best_vendor" })} data-testid={`perfume-level-basis-${l.name}`}>
                <option value="avg">{tr("perfume.acct.avg", "My average cost")}</option><option value="best_vendor">{tr("perfume.acct.best", "Best supplier cost")}</option>
              </select>), exportValue: (l) => l.cost_basis },
            { key: "floor_pct", label: "Floor %", render: (l) => <PctCell value={l.floor_pct} label={`${l.name} floor %`} testId={`perfume-level-floor-${l.name}`} onSave={(v) => save(l.id, { floor_pct: v })} />, exportValue: (l) => l.floor_pct ?? "" },
            { key: "tester_pct", label: "Testers % of regular", render: (l) => <PctCell value={l.tester_pct} label={`${l.name} testers %`} testId={`perfume-level-tester-${l.name}`}
              onSave={(v) => { if (v == null || v <= 0 || v > 100) { pushToast(tr("perfume.acct.tester_bad", "Testers % must be above 0 and at most 100"), "error"); return; } save(l.id, { tester_pct: v }); }} />, exportValue: (l) => l.tester_pct },
            { key: "fixed_prices", label: "Fixed prices", kind: "number", cellClass: "text-right tabular-nums", render: (l) => l.fixed_prices.toLocaleString("en-US") },
            { key: "customers", label: "Customers", kind: "number", cellClass: "text-right tabular-nums", render: (l) => l.customers.toLocaleString("en-US") },
          ]}
        />
      </section>
      {sel ? <LevelItems level={sel} onChanged={() => void levels.refetch()} /> : null}
    </div>
  );
}

function PctCell({ value, label, testId, onSave }: { value: number | null; label: string; testId: string; onSave: (v: number | null) => void }) {
  const [v, setV] = useState(value == null ? "" : String(value));
  useEffect(() => setV(value == null ? "" : String(value)), [value]);
  return (
    <input className={`${ctl} w-[80px] text-right`} aria-label={label} value={v} placeholder={DASH} onClick={(e) => e.stopPropagation()} onChange={(e) => setV(e.target.value)} data-testid={testId}
      onBlur={() => { const t = v.trim(); const n = t === "" ? null : Number(t); if (n !== null && !(n >= 0)) { setV(value == null ? "" : String(value)); return; } if (n !== value) onSave(n); }} />
  );
}

function LevelItems({ level, onChanged }: { level: PerfumePriceLevel; onChanged: () => void }) {
  const { pushToast } = useToast();
  const items = useQuery({ queryKey: ["perfume", "price-level-items", level.id], queryFn: () => listPerfumeLevelItems(level.id) });
  const [price, setPrice] = useState<number | null>(null);
  if (items.isError) return <ListErrorState title={tr("perfume.acct.itemsError", "Couldn't load the fixed prices")} status={0} message={(items.error as Error)?.message} onRetry={() => void items.refetch()} />;
  const refresh = async () => { await items.refetch(); onChanged(); };
  const add = (itemId: string, minQty: number) => {
    const c = price;
    if (c == null || c <= 0) { pushToast("Type the price first", "error"); return; }
    void setPerfumeLevelItem(level.id, { item_id: itemId, min_qty: minQty, price_cents: c }).then(refresh).catch(err(pushToast));
  };
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-level-items" aria-label={level.name}>
      <div className="text-section-header">{`${level.name} — ${tr("perfume.acct.fixed", "fixed prices")}`}</div>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label>{tr("perfume.acct.price", "Price")} <MoneyInput className="block w-[100px]" ariaLabel={tr("perfume.acct.price", "Price")} valueCents={price} onChangeCents={setPrice} /></label>
        <span className="text-[#64748B]">{tr("perfume.acct.fixed_help", "then pick the item; Qty = the quantity from which this price applies")}</span>
      </div>
      <ItemFinder testId="perfume-level-find" onPick={add} />
      <ParityTable<PerfumeLevelItem>
        rows={items.data?.items ?? []} rowKey={(r) => `${r.id}-${r.price_cents}`} storageKey="perfume-level-items-v1" exportFilename="TIO level prices" exportExcel emptyText="No fixed prices — the level's % applies."
        columns={[
          { key: "display_name", label: "Item", render: (r) => <DocLink tab="items" id={r.item_id}>{r.display_name}</DocLink>, exportValue: (r) => r.display_name },
          { key: "min_qty", label: "From qty", kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.min_qty.toLocaleString("en-US") },
          { key: "price_cents", label: "Price", render: (r) => <NumberCell value={r.price_cents} money label={tr("perfume.acct.price", "Price")} testId={`perfume-level-item-${r.id}`}
            onSave={(n) => setPerfumeLevelItem(level.id, { item_id: r.item_id, min_qty: r.min_qty, price_cents: n }).then(refresh)} />, exportValue: (r) => r.price_cents / 100 },
          { key: "off", label: "", render: (r) => <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={() => void setPerfumeLevelItem(level.id, { item_id: r.item_id, min_qty: r.min_qty, price_cents: null }).then(refresh).catch(err(pushToast))}>{tr("perfume.acct.take_off", "Take off")}</Button> },
        ]}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ Customer accounts */

export function PerfumeAccountsPanel() {
  const { pushToast } = useToast();
  const { openId } = useOpenDoc();
  const accounts = useQuery({ queryKey: ["perfume", "customer-accounts"], queryFn: listPerfumeCustomerAccounts });
  const waiting = useQuery({ queryKey: ["perfume", "credit-applications", "submitted"], queryFn: () => listPerfumeCreditApplications("submitted") });
  const [filter, setFilter] = useState<"" | "credit" | "hold" | "waiting">("");
  const [selected, setSelected] = useState<string | null>(openId);
  const [find, setFind] = useState("");
  const found = useQuery({ queryKey: ["perfume", "contacts", "account-pick", find], queryFn: () => listPerfumeContacts({ q: find, limit: 20 }), enabled: find.trim().length >= 2 });
  useEffect(() => { if (openId) setSelected(openId); }, [openId]);
  if (accounts.isError) return <ListErrorState title={tr("perfume.acct.accountsError", "Couldn't load the accounts")} status={0} message={(accounts.error as Error)?.message} onRetry={() => void accounts.refetch()} />;
  const all = accounts.data?.accounts ?? [];
  const waitingIds = new Set((waiting.data?.applications ?? []).map((a) => a.company_id));
  const shown = all.filter((a) => !filter || (filter === "credit" ? a.account_type === "credit" : filter === "hold" ? a.on_hold : waitingIds.has(a.company_id)));
  const open = (id: string) => { setSelected(id); setFind(""); };
  return (
    <div className="space-y-3" data-testid="perfume-accounts-panel">
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-5" data-testid="perfume-accounts-kpis">
        <KpiCard label={tr("perfume.acct.kpi_all", "Customer accounts")} number={all.length.toLocaleString("en-US")} onClick={() => setFilter("")} />
        <KpiCard label={tr("perfume.acct.kpi_credit", "Credit accounts")} number={all.filter((a) => a.account_type === "credit").length.toLocaleString("en-US")} onClick={() => setFilter("credit")} />
        <KpiCard label={tr("perfume.acct.kpi_limits", "Credit limits total")} number={money(all.reduce((t, a) => t + (a.credit_limit_cents ?? 0), 0))} onClick={() => setFilter("credit")} />
        <KpiCard label={tr("perfume.acct.kpi_hold", "On hold")} number={all.filter((a) => a.on_hold).length.toLocaleString("en-US")} onClick={() => setFilter("hold")} />
        <KpiCard label={tr("perfume.acct.kpi_waiting", "Applications waiting for me")} number={(waiting.data?.applications?.length ?? 0).toLocaleString("en-US")} onClick={() => setFilter("waiting")} />
      </div>
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.acct.accounts", "Customer accounts")}>
        <label className="relative block text-xs">{tr("perfume.acct.open", "Open a customer's account (from Contacts)")}
          <input className={`${ctl} block w-[360px]`} value={find} onChange={(e) => setFind(e.target.value)} placeholder={tr("perfume.acct.find_ph", "Type the company name")} data-testid="perfume-accounts-find" />
          {found.isError ? <span className="text-xs text-[#9B2C2C]" role="alert">{tr("perfume.acct.find_error", "Couldn't search Contacts — try again.")}</span> : null}
          {find.trim().length >= 2 && (found.data?.rows?.length ?? 0) > 0 ? (
            <div className="absolute z-20 mt-1 max-h-64 w-[360px] overflow-y-auto border border-gray-300 bg-white shadow-lg" role="listbox">
              {found.data!.rows.map((r) => (
                <button key={r.id} type="button" role="option" aria-selected={false} className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-100" onClick={() => open(r.id)} data-testid={`perfume-accounts-pick-${r.id}`}>
                  <span className="font-semibold">{r.name}</span> <span className="text-[#64748B]">{[r.city, r.country].filter(Boolean).join(", ")}</span>
                </button>
              ))}
            </div>
          ) : null}
        </label>
        <ParityTable<PerfumeCustomerAccount>
          rows={shown} rowKey={(a) => a.company_id} loading={accounts.isLoading} storageKey="perfume-accounts-v1" exportFilename="TIO customer accounts" exportExcel
          emptyText={filter ? "No account matches." : "No customer accounts yet — open one above."} onRowClick={(a) => setSelected(a.company_id)}
          columns={[
            { key: "company_name", label: "Customer", sortable: true, render: (a) => <span className="font-semibold">{a.company_name}</span> },
            { key: "account_type", label: "Pays by", sortable: true, render: (a) => TYPE_TEXT[a.account_type], exportValue: (a) => TYPE_TEXT[a.account_type] },
            { key: "price_level", label: "Price level", sortable: true, render: (a) => a.price_level ?? DASH, exportValue: (a) => a.price_level ?? "" },
            { key: "terms_days", label: "Terms", sortable: true, render: (a) => (a.terms_days == null ? DASH : `Net ${a.terms_days}`), exportValue: (a) => a.terms_days ?? "" },
            { key: "credit_limit_cents", label: "Limit", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (a) => money(a.credit_limit_cents), exportValue: (a) => (a.credit_limit_cents == null ? "" : a.credit_limit_cents / 100) },
            { key: "open_orders_cents", label: "Open orders", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (a) => money(a.open_orders_cents), exportValue: (a) => a.open_orders_cents / 100 },
            { key: "on_hold", label: "Hold", sortable: true, render: (a) => (a.on_hold ? <Badge text={tr("perfume.acct.on_hold", "On hold")} color="bg-[#9B2C2C]" /> : DASH), exportValue: (a) => (a.on_hold ? a.hold_reason ?? "on hold" : "") },
            { key: "review_on", label: "Review on", sortable: true, cellClass: "text-right tabular-nums", render: (a) => usDate(a.review_on) },
          ]}
        />
      </section>
      {selected ? <AccountEditor companyId={selected} onChanged={() => { void accounts.refetch(); void waiting.refetch(); }} onClose={() => setSelected(null)} push={pushToast} /> : null}
    </div>
  );
}

function AccountEditor({ companyId, onChanged, onClose, push }: { companyId: string; onChanged: () => void; onClose: () => void; push: (m: string, k: "error" | "success") => void }) {
  const acct = useQuery({ queryKey: ["perfume", "customer-account", companyId], queryFn: () => getPerfumeCustomerAccount(companyId) });
  const levels = useQuery({ queryKey: ["perfume", "price-levels"], queryFn: listPerfumePriceLevels });
  // A credit hold / release note (why the account stops or resumes shipping) — not a void reason.
  const [holdNote, setHoldNote] = useState("");
  const [app, setApp] = useState({ legal_name: "", tax_number: "", limit: "", terms: "30", refs: "", bank: "" });
  if (acct.isError) return <ListErrorState title={tr("perfume.acct.oneError", "Couldn't load the account")} status={0} message={(acct.error as Error)?.message} onRetry={() => void acct.refetch()} />;
  if (!acct.data) return null;
  const { account: a, applications, events } = acct.data;
  const run = (f: () => Promise<unknown>, ok?: string) => void f().then(async () => { await acct.refetch(); onChanged(); if (ok) push(ok, "success"); }).catch(err(push as (m: string, k: "error") => void));
  const save = (b: Parameters<typeof savePerfumeCustomerAccount>[1]) => run(() => savePerfumeCustomerAccount(companyId, b));
  const apply = () => {
    const limit = toCents(app.limit), terms = Number(app.terms);
    if (!app.legal_name.trim() || limit == null || limit <= 0 || !Number.isInteger(terms)) { push("Legal name, the limit asked for and the terms (days) are needed", "error"); return; }
    run(() => submitPerfumeCreditApplication(companyId, { legal_name: app.legal_name.trim(), tax_number: app.tax_number || null, requested_limit_cents: limit, requested_terms_days: terms,
      trade_references: app.refs || null, bank_reference: app.bank || null }), "Application saved — waiting for your decision");
  };
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-account-editor" aria-label={a?.company_name ?? companyId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-section-header">{a?.company_name ?? tr("perfume.acct.new", "New customer account")} {a ? <span className="ml-1 text-xs">{TYPE_TEXT[a.account_type]}</span> : null}
          {a?.on_hold ? <span className="ml-2"><Badge text={`${tr("perfume.acct.on_hold", "On hold")}: ${a.hold_reason ?? ""}`} color="bg-[#9B2C2C]" /></span> : null}</div>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.acct.close", "Close")}</Button>
      </div>
      {!a ? (
        <Button type="button" className="h-[34px] px-3 text-xs" onClick={() => save({})} data-testid="perfume-account-create">{tr("perfume.acct.create", "Open account (cash and carry)")}</Button>
      ) : (
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <label>{tr("perfume.acct.pays_by", "Pays by")}
            <select className={`${ctl} block`} value={a.account_type} onChange={(e) => save({ account_type: e.target.value as "cash" | "prepaid" | "export" })} data-testid="perfume-account-type">
              {a.account_type === "credit" ? <option value="credit">{TYPE_TEXT.credit}</option> : null}
              <option value="cash">{TYPE_TEXT.cash}</option><option value="prepaid">{TYPE_TEXT.prepaid}</option><option value="export">{TYPE_TEXT.export}</option>
            </select>
          </label>
          <label>{tr("perfume.acct.level", "Price level")}
            <select className={`${ctl} block`} value={a.price_level_id ?? ""} onChange={(e) => save({ price_level_id: e.target.value || null })} data-testid="perfume-account-level">
              <option value="">{tr("perfume.acct.no_level", "None (desk rule)")}</option>
              {(levels.data?.levels ?? []).filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          {a.account_type === "credit" ? (
            <>
              <label>{tr("perfume.acct.limit", "Limit")} <NumberCell value={a.credit_limit_cents ?? 0} money label={tr("perfume.acct.limit", "Limit")} testId="perfume-account-limit" onSave={(n) => savePerfumeCustomerAccount(companyId, { credit_limit_cents: n }).then(() => acct.refetch())} /></label>
              <label>{tr("perfume.acct.terms", "Terms (days)")} <NumberCell value={a.terms_days ?? 0} label={tr("perfume.acct.terms", "Terms (days)")} testId="perfume-account-terms" onSave={(n) => savePerfumeCustomerAccount(companyId, { terms_days: n }).then(() => acct.refetch())} /></label>
            </>
          ) : null}
          <label className="flex items-center gap-1"><input type="checkbox" checked={a.resale_certificate} onChange={(e) => save({ resale_certificate: e.target.checked })} data-testid="perfume-account-resale" />{tr("perfume.acct.resale", "Resale certificate on file")}</label>
          <label>{tr("perfume.acct.hold_reason", "Hold / release reason")} <input className={`${ctl} block w-[240px]`} value={holdNote} onChange={(e) => setHoldNote(e.target.value)} data-testid="perfume-account-reason" /></label>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" data-testid="perfume-account-hold"
            onClick={() => { if (!holdNote.trim()) { push("Say why", "error"); return; } run(() => setPerfumeCustomerHold(companyId, !a.on_hold, holdNote), a.on_hold ? "Hold released" : "Put on hold"); setHoldNote(""); }}>
            {a.on_hold ? tr("perfume.acct.release", "Release hold") : tr("perfume.acct.hold", "Put on hold")}
          </Button>
        </div>
      )}
      <div className="border-t border-[#E8EDF2] pt-2 text-xs" data-testid="perfume-account-apply">
        <div className="text-section-header mb-1">{tr("perfume.acct.apply", "Credit application")}</div>
        <div className="flex flex-wrap items-end gap-2">
          <label>{tr("perfume.acct.legal", "Legal name")} <input className={`${ctl} block w-[220px]`} value={app.legal_name} onChange={(e) => setApp({ ...app, legal_name: e.target.value })} /></label>
          <label>{tr("perfume.acct.tax", "EIN / RFC")} <input className={`${ctl} block w-[140px]`} value={app.tax_number} onChange={(e) => setApp({ ...app, tax_number: e.target.value })} /></label>
          <label>{tr("perfume.acct.limit_asked", "Limit asked")} <input className={`${ctl} block w-[110px] text-right`} value={app.limit} onChange={(e) => setApp({ ...app, limit: e.target.value })} /></label>
          <label>{tr("perfume.acct.terms", "Terms (days)")} <input className={`${ctl} block w-[70px] text-right`} value={app.terms} onChange={(e) => setApp({ ...app, terms: e.target.value })} /></label>
          <label>{tr("perfume.acct.refs", "Trade references")} <input className={`${ctl} block w-[220px]`} value={app.refs} onChange={(e) => setApp({ ...app, refs: e.target.value })} /></label>
          <label>{tr("perfume.acct.bank", "Bank reference")} <input className={`${ctl} block w-[180px]`} value={app.bank} onChange={(e) => setApp({ ...app, bank: e.target.value })} /></label>
          <Button type="button" className="h-[34px] px-3 text-xs" onClick={apply} data-testid="perfume-account-apply-save">{tr("perfume.acct.apply_save", "Save application")}</Button>
        </div>
      </div>
      <ParityTable<PerfumeCreditApplication>
        title={tr("perfume.acct.applications", "Applications")} rows={applications} rowKey={(x) => `${x.id}-${x.status}`} storageKey="perfume-account-apps-v1" exportFilename="TIO credit applications" exportExcel emptyText="No applications."
        columns={[
          { key: "created_at", label: "Date", render: (x) => new Date(x.created_at).toLocaleDateString("en-US") },
          { key: "legal_name", label: "Legal name", render: (x) => x.legal_name },
          { key: "requested_limit_cents", label: "Asked", kind: "number", cellClass: "text-right tabular-nums", render: (x) => `${money(x.requested_limit_cents)} · Net ${x.requested_terms_days}`, exportValue: (x) => x.requested_limit_cents / 100 },
          { key: "status", label: "Status", render: (x) => <Badge text={APP_TEXT[x.status]} color={APP_CLASS[x.status]} />, exportValue: (x) => APP_TEXT[x.status] },
          { key: "approved_limit_cents", label: "Approved", kind: "number", cellClass: "text-right tabular-nums", render: (x) => (x.approved_limit_cents == null ? DASH : `${money(x.approved_limit_cents)} · Net ${x.approved_terms_days}`), exportValue: (x) => (x.approved_limit_cents == null ? "" : x.approved_limit_cents / 100) },
          { key: "decide", label: "", render: (x) => (x.status === "submitted" ? <Decide app={x} onDone={() => { void acct.refetch(); onChanged(); }} push={push} /> : (x.decided_by_email ?? DASH)) },
        ]}
      />
      <HistoryTable events={events} storageKey="perfume-account-history-v1" exportFilename="TIO account history" />
    </section>
  );
}

function Decide({ app, onDone, push }: { app: PerfumeCreditApplication; onDone: () => void; push: (m: string, k: "error" | "success") => void }) {
  const [limit, setLimit] = useState((app.requested_limit_cents / 100).toFixed(2));
  const [terms, setTerms] = useState(String(app.requested_terms_days));
  const [note, setNote] = useState("");
  const go = (decision: "approved" | "rejected") => {
    const body = decision === "approved" ? { decision, limit_cents: toCents(limit) ?? 0, terms_days: Number(terms), note: note || null } as const : { decision, note } as const;
    if (decision === "approved" && (!body.limit_cents || !Number.isInteger(Number(terms)))) { push("Type the limit and the terms", "error"); return; }
    if (decision === "rejected" && !note.trim()) { push("Say why it is rejected", "error"); return; }
    void decidePerfumeCreditApplication(app.id, body).then(() => { push(decision === "approved" ? "Approved — credit account open" : "Rejected", "success"); onDone(); }).catch(err(push as (m: string, k: "error") => void));
  };
  return (
    <div className="flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()} data-testid={`perfume-app-decide-${app.id}`}>
      <input className={`${ctl} w-[100px] text-right`} aria-label={tr("perfume.acct.limit", "Limit")} value={limit} onChange={(e) => setLimit(e.target.value)} />
      <input className={`${ctl} w-[56px] text-right`} aria-label={tr("perfume.acct.terms", "Terms (days)")} value={terms} onChange={(e) => setTerms(e.target.value)} />
      <input className={`${ctl} w-[140px]`} aria-label={tr("perfume.acct.note", "Note")} placeholder={tr("perfume.acct.note", "Note")} value={note} onChange={(e) => setNote(e.target.value)} />
      <Button type="button" className="h-[28px] px-2 text-xs" onClick={() => go("approved")} data-testid={`perfume-app-approve-${app.id}`}>{tr("perfume.acct.approve", "Approve")}</Button>
      <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={() => go("rejected")} data-testid={`perfume-app-reject-${app.id}`}>{tr("perfume.acct.reject", "Reject")}</Button>
    </div>
  );
}
