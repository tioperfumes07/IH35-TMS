/**
 * RECLASSIFY TRANSACTIONS — QBO Tools → Reclassify clone (owner click-through, spec §24/24b/24c/24d).
 * LEFT: chart of accounts with the period activity per account (click = working set).
 * RIGHT: From/To · Type · Class · search → Find → GL LINES grid (date, type, num, name, memo, account,
 * class, net amount) · select-all per page · live "N lines selected: $sum" · [Reclassify] → modal:
 * change account / class / vendor (each optional) + reason → Apply → one RECLASSIFICATION JE per
 * document, audit each, results per document, Undo per batch.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { DatePicker } from "../../components/forms/DatePicker";
import { SelectCombobox } from "../../components/Combobox";
import { ReferenceSelect, type ReferenceOption } from "../../components/parity/ReferenceSelect";
import { coaAccountReferenceOption } from "../../components/parity/referenceOptionLabels";
import { Button } from "../../components/Button";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { formatDateQboList } from "../../lib/formatDate";
import { formatCurrencyFromCents } from "../lists/accounting/coa-list-utils";
import { useShowAccountNumbers } from "../../lib/useShowAccountNumbers";
import { formatAccountDisplayLabel } from "../../lib/show-account-numbers";
import { listClassesForJe, listCoaAccountsForJe } from "../../api/accounting";
import { listCustomers, listVendors } from "../../api/mdata";
import { FuelStopLocationPicker } from "../../components/locations/FuelStopLocationPicker";
import {
  applyReclassify, findReclassifyLines, getReclassifyAccountTree, listReclassifyBatches, undoReclassifyBatch,
  type ReclassifyBatchResult, type ReclassifyLine, type ReclassifyTreeAccount,
} from "../../api/reclassify";
import { docTarget, notReclassifiable } from "../../lib/reclassifyDrill";
import { searchQboMasterData } from "../../api/qbo-mdata";
import { EntityPicker } from "../../components/EntityPicker";

const PAGE = 100;
const SOURCE_TYPES = ["expense", "bill", "invoice", "bill_payment", "customer_payment", "deposit", "driver_settlement", "fuel_transaction", "journal_entry"] as const;

function firstOfPrevMonth() { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); }
function today() { return new Date().toISOString().slice(0, 10); }

type SortKey = "date" | "type" | "num" | "name" | "memo" | "account" | "item" | "load" | "class" | "debit" | "credit" | "amount" | "balance";
type Side = "profit_and_loss" | "balance_sheet" | "statistical";
type TreeRow = { a: ReclassifyTreeAccount; depth: number; rollupCents: number; hasChildren: boolean };
/** Parent -> children, depth-first, each parent's OWN balance kept separate from its rolled-up total (QBO). */
function buildTree(accounts: ReclassifyTreeAccount[], side: Side, includeInactive: boolean, filter: string): TreeRow[] {
  const visible = accounts.filter((a) => a.side === side && (includeInactive || a.is_active));
  const byId = new Map(visible.map((a) => [a.account_id, a]));
  const kids = new Map<string | null, ReclassifyTreeAccount[]>();
  for (const a of visible) {
    const parent = a.parent_account_id && byId.has(a.parent_account_id) ? a.parent_account_id : null;
    kids.set(parent, [...(kids.get(parent) ?? []), a]);
  }
  const order = (xs: ReclassifyTreeAccount[]) => xs.sort((x, y) => (x.account_number ?? "~").localeCompare(y.account_number ?? "~") || x.account_name.localeCompare(y.account_name));
  const rollup = (a: ReclassifyTreeAccount): number => a.closing_balance_cents + (kids.get(a.account_id) ?? []).reduce((s, c) => s + rollup(c), 0);
  const out: TreeRow[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const a of order(kids.get(parent) ?? [])) {
      out.push({ a, depth, rollupCents: rollup(a), hasChildren: (kids.get(a.account_id) ?? []).length > 0 });
      walk(a.account_id, depth + 1);
    }
  };
  walk(null, 0);
  const f = filter.trim().toLowerCase();
  return f ? out.filter((r) => `${r.a.account_number ?? ""} ${r.a.account_name}`.toLowerCase().includes(f)) : out;
}

export function ReclassifyTransactionsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  // Owner ruling (Round 83): account numbers hidden by default, shown only when the toggle is on.
  const [showAccountNumbers, setShowAccountNumbers] = useShowAccountNumbers();

  const [fromDate, setFromDate] = useState(firstOfPrevMonth());
  const [toDate, setToDate] = useState(today());
  const [accountId, setAccountId] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState<{ from: string; to: string; accountId: string | null; sourceType: string; classId: string; search: string; itemId?: string; loadId?: string } | null>(null);
  // ROUND 368.1 — statement side, inactive toggle, sort, by-item / by-load selectors.
  const [side, setSide] = useState<Side>("profit_and_loss");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [itemId, setItemId] = useState("");
  const [loadId, setLoadId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [gotoPageDraft, setGotoPageDraft] = useState("1");
  const [selected, setSelected] = useState<Map<string, ReclassifyLine>>(new Map());
  const [modalOpen, setModalOpen] = useState(false);
  const [toAccount, setToAccount] = useState("");
  const [toClass, setToClass] = useState("");
  const [toLocation, setToLocation] = useState<string | null>(null);
  const [toEntityKind, setToEntityKind] = useState<"vendor" | "customer">("vendor");
  const [toVendor, setToVendor] = useState("");
  const [reason, setReason] = useState("");
  const [lastResult, setLastResult] = useState<ReclassifyBatchResult | null>(null);
  const [accountFilter, setAccountFilter] = useState("");
  const [undoTarget, setUndoTarget] = useState<string | null>(null);
  const [undoReason, setUndoReason] = useState("");

  const accountsQ = useQuery({ queryKey: ["reclassify-accounts", companyId, fromDate, toDate], queryFn: () => getReclassifyAccountTree(companyId, fromDate, toDate), enabled: !!companyId });
  const itemsQ = useQuery({ queryKey: ["reclassify-items", companyId], queryFn: () => searchQboMasterData("item", companyId, { q: "" }), enabled: !!companyId });
  const coaQ = useQuery({ queryKey: ["reclassify-coa", companyId], queryFn: () => listCoaAccountsForJe(companyId), enabled: !!companyId });
  const classesQ = useQuery({ queryKey: ["reclassify-classes"], queryFn: () => listClassesForJe() });
  const vendorsQ = useQuery({ queryKey: ["reclassify-vendors", companyId], queryFn: () => listVendors({ operating_company_id: companyId, limit: 1000 }), enabled: modalOpen && !!companyId && toEntityKind === "vendor" });
  const customersQ = useQuery({ queryKey: ["reclassify-customers", companyId], queryFn: () => listCustomers({ operating_company_id: companyId, limit: 1000 }), enabled: modalOpen && !!companyId && toEntityKind === "customer" });
  const batchesQ = useQuery({ queryKey: ["reclassify-batches", companyId], queryFn: () => listReclassifyBatches(companyId), enabled: !!companyId });

  const linesQ = useQuery({
    queryKey: ["reclassify-lines", companyId, applied, offset, sort],
    queryFn: () => findReclassifyLines(companyId, {
      from_date: applied!.from, to_date: applied!.to, account_ids: applied!.accountId ? [applied!.accountId] : undefined,
      source_types: applied!.sourceType ? [applied!.sourceType] : undefined, class_id: applied!.classId || undefined, search: applied!.search || undefined,
      item_ids: applied!.itemId ? [applied!.itemId] : undefined, load_ids: applied!.loadId ? [applied!.loadId] : undefined,
      sort_key: sort.key, sort_dir: sort.dir, limit: PAGE, offset,
    }),
    enabled: !!companyId && !!applied,
  });

  const applyMut = useMutation({
    mutationFn: () => applyReclassify({
      operating_company_id: companyId, posting_ids: Array.from(selected.keys()), reason,
      to_account_id: toAccount || null, to_class_id: toClass || null, to_location_id: toLocation || null,
      to_entity_uuid: toVendor || null, to_entity_type: toVendor ? toEntityKind : null,
      filter_snapshot: applied ?? {},
    }),
    onSuccess: (res) => {
      setLastResult(res); setModalOpen(false); setSelected(new Map()); setToAccount(""); setToClass(""); setToLocation(null); setToVendor(""); setToEntityKind("vendor"); setReason("");
      void qc.invalidateQueries({ queryKey: ["reclassify-lines"] }); void qc.invalidateQueries({ queryKey: ["reclassify-accounts"] }); void qc.invalidateQueries({ queryKey: ["reclassify-batches"] });
    },
  });
  const undoMut = useMutation({
    mutationFn: (p: { batchId: string; reason: string }) => undoReclassifyBatch(companyId, p.batchId, p.reason),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["reclassify-lines"] }); void qc.invalidateQueries({ queryKey: ["reclassify-accounts"] }); void qc.invalidateQueries({ queryKey: ["reclassify-batches"] }); },
  });

  const itemRefOptions = useMemo<ReferenceOption[]>(() => (itemsQ.data?.results ?? []).map((i) => ({ value: i.id, label: i.active ? i.display_name : `${i.display_name} (inactive)` })), [itemsQ.data]);
  const accountRefOptions = useMemo<ReferenceOption[]>(() => (coaQ.data?.accounts ?? []).map((a) => coaAccountReferenceOption({ id: a.id, account_name: a.account_name, account_type: a.account_type ?? null, account_number: a.account_number })), [coaQ.data]);
  const vendorRefOptions = useMemo<ReferenceOption[]>(() => (vendorsQ.data?.vendors ?? []).map((v) => ({ value: v.id, label: v.name })), [vendorsQ.data]);
  const customerRefOptions = useMemo<ReferenceOption[]>(() => (customersQ.data?.customers ?? []).map((c) => ({ value: c.id, label: c.name?.trim() || c.id })), [customersQ.data]);
  // LAW 363.8 — the WHOLE chart, 0.00 included, on the chosen statement side; never filtered by activity.
  const tree = useMemo(() => buildTree(accountsQ.data?.accounts ?? [], side, includeInactive, accountFilter), [accountsQ.data, side, includeInactive, accountFilter]);
  const sideCounts = useMemo(() => {
    const all = (accountsQ.data?.accounts ?? []).filter((a) => includeInactive || a.is_active);
    return { profit_and_loss: all.filter((a) => a.side === "profit_and_loss").length, balance_sheet: all.filter((a) => a.side === "balance_sheet").length, statistical: all.filter((a) => a.side === "statistical").length };
  }, [accountsQ.data, includeInactive]);
  // Sized from the longest account name in catalogs.accounts (measured, not a picked number) + the balance column.
  const paneWidthCh = Math.max(32, (accountsQ.data?.longest_account_name_chars ?? 40) + 20);

  const lines = linesQ.data?.lines ?? [];
  const selectableLines = lines.filter((l) => !notReclassifiable(l));
  const pageAllSelected = selectableLines.length > 0 && selectableLines.every((l) => selected.has(l.posting_id));
  const selectedSum = Array.from(selected.values()).reduce((s, l) => s + l.net_amount_cents, 0);
  const activeAccount: ReclassifyTreeAccount | undefined = accountsQ.data?.accounts?.find((a) => a.account_id === applied?.accountId);

  const runFind = (overrideAccountId?: string | null) => {
    const acct = overrideAccountId === undefined ? accountId : overrideAccountId;
    setApplied({ from: fromDate, to: toDate, accountId: acct, sourceType, classId, search, itemId: itemId || undefined, loadId: loadId ?? undefined });
    setOffset(0); setGotoPageDraft("1"); setSelected(new Map());
  };
  // ROUND 370 — clicking an account LOADS its transactions (it used to only highlight it; the list never ran).
  const openAccount = (id: string | null) => { setAccountId(id); runFind(id); };
  const toggleSort = (key: SortKey) => { setSort((cur) => (cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "desc" : "asc" })); setOffset(0); setGotoPageDraft("1"); };
  const sortMark = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "");
  const toggle = (l: ReclassifyLine) => { if (notReclassifiable(l)) return; setSelected((prev) => { const n = new Map(prev); if (n.has(l.posting_id)) n.delete(l.posting_id); else n.set(l.posting_id, l); return n; }); };
  const togglePage = () => setSelected((prev) => { const n = new Map(prev); if (pageAllSelected) selectableLines.forEach((l) => n.delete(l.posting_id)); else selectableLines.forEach((l) => n.set(l.posting_id, l)); return n; });

  const chips: Array<{ label: string; clear: () => void }> = [];
  if (applied?.itemId) chips.push({ label: `Item: ${itemsQ.data?.results?.find((i) => i.id === applied.itemId)?.display_name ?? "selected"}`, clear: () => { setItemId(""); setApplied({ ...applied, itemId: undefined }); } });
  if (applied?.loadId) chips.push({ label: "Load: selected", clear: () => { setLoadId(null); setApplied({ ...applied, loadId: undefined }); } });
  if (applied?.accountId) chips.push({ label: `Account: ${activeAccount ? `${activeAccount.account_number ?? ""} ${activeAccount.account_name}`.trim() : "selected"}`, clear: () => { setAccountId(null); setApplied({ ...applied, accountId: null }); setSelected(new Map()); } });
  if (applied?.sourceType) chips.push({ label: `Type: ${applied.sourceType}`, clear: () => { setSourceType(""); setApplied({ ...applied, sourceType: "" }); } });
  if (applied?.classId) chips.push({ label: `Class: ${classesQ.data?.classes?.find((c) => c.id === applied.classId)?.class_name ?? applied.classId}`, clear: () => { setClassId(""); setApplied({ ...applied, classId: "" }); } });
  if (applied?.search) chips.push({ label: `Search: ${applied.search}`, clear: () => { setSearch(""); setApplied({ ...applied, search: "" }); } });

  return (
    <AccountingSubNavWrapper title="Reclassify transactions" subtitle="Change the account, class or vendor on many GL lines at once. Every document is re-posted through a linked RECLASSIFICATION journal entry; undo per batch.">
      <div className="flex min-h-[70vh] gap-3" data-testid="reclassify-page" data-b5-reclassify="1">
        {/* LEFT PANE — THE WHOLE CHART OF ACCOUNTS (LAW 363.8): every account, 0.00 included, balances derived from the GL. */}
        <aside className="shrink-0 overflow-y-auto rounded border border-gray-200 bg-white" style={{ width: `${paneWidthCh}ch` }} data-testid="reclassify-account-tree" data-b5-period-balances="1" data-r368-whole-chart="1">
          <div className="border-b border-gray-200 p-2">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-600">Accounts · balances from the ledger</div>
            <div className="mt-2 inline-flex rounded border border-gray-300 text-xs" role="tablist" aria-label="Statement" data-testid="reclassify-side">
              {([["profit_and_loss", "Profit & Loss"], ["balance_sheet", "Balance Sheet"], ["statistical", "Statistical"]] as const).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={side === k} onClick={() => setSide(k)} className={`px-2 py-1 ${side === k ? "bg-slate-100 font-semibold" : ""}`} data-testid={`reclassify-side-${k}`}>
                  {label} ({sideCounts[k]})
                </button>
              ))}
            </div>
            {/* BANK-F91048 — ORDERS §B-5 left pane PERIOD BALANCES (From/To); same state as right filters. */}
            <div className="mt-2 grid grid-cols-2 gap-1" data-b5-period-from-to="1" data-testid="reclassify-period-from-to">
              <label className="flex flex-col gap-0.5 text-xs font-semibold text-slate-600">
                From
                <DatePicker value={fromDate} onChange={setFromDate} className="h-8" data-testid="reclassify-period-from" />
              </label>
              <label className="flex flex-col gap-0.5 text-xs font-semibold text-slate-600">
                To
                <DatePicker value={toDate} onChange={setToDate} className="h-8" data-testid="reclassify-period-to" />
              </label>
            </div>
            <input value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} placeholder="Filter accounts" className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-xs" data-testid="reclassify-account-filter" />
            <label className="mt-1 flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={showAccountNumbers} onChange={(e) => setShowAccountNumbers(e.target.checked)} /> Show account numbers</label>
            <label className="mt-1 flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} data-testid="reclassify-include-inactive" /> Include inactive accounts</label>
            <div className="mt-1 flex justify-between text-xs font-semibold uppercase text-gray-600"><span>Account</span><span>Balance {formatDateQboList(toDate)}</span></div>
          </div>
          {accountsQ.isLoading ? <div className="p-2 text-xs text-slate-600">Loading…</div> : null}
          {accountsQ.error ? <div className="p-2"><ListErrorState {...formatQueryErrorDetail(accountsQ.error)} onRetry={() => void accountsQ.refetch()} /></div> : null}
          <ul className="text-xs">
            <li>
              <button type="button" onClick={() => openAccount(null)} className={`flex w-full items-center justify-between px-2 py-1 text-left hover:bg-slate-50 ${accountId === null ? "bg-slate-100 font-semibold" : ""}`}>
                <span>All accounts</span>
              </button>
            </li>
            {!accountsQ.isLoading && !accountsQ.error && tree.length === 0 ? (
              <li className="p-2 text-slate-600" data-testid="reclassify-tree-empty">No {side === "profit_and_loss" ? "Profit & Loss" : side === "balance_sheet" ? "Balance Sheet" : "statistical"} accounts{accountFilter ? " match the filter" : ""}.</li>
            ) : null}
            {tree.map(({ a, depth, rollupCents, hasChildren }) => (
              <li key={a.account_id}>
                <button type="button" onClick={() => openAccount(a.account_id)} title={`${a.account_type ?? ""}${a.detail_type_name ? ` · ${a.detail_type_name}` : ""}${a.is_active ? "" : " · inactive"} — opening ${formatCurrencyFromCents(a.opening_cents)}, period ${formatCurrencyFromCents(a.period_activity_cents)}`} className={`flex w-full items-center justify-between gap-2 py-1 pr-2 text-left hover:bg-slate-50 ${accountId === a.account_id ? "bg-slate-100 font-semibold" : ""}`} style={{ paddingLeft: `${0.5 + depth * 1}rem` }} data-testid={`reclassify-account-${a.account_id}`}>
                  {/* showAccountNumbers gate — formatAccountDisplayLabel hides the number unless the toggle is on */}
                  <span className="min-w-0 whitespace-normal break-words">
                    {formatAccountDisplayLabel({ account_name: a.account_name, account_number: a.account_number }, { showNumber: showAccountNumbers })}
                    {a.is_active ? null : <span className="ml-1 rounded bg-slate-200 px-1 text-xs">inactive</span>}
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    {formatCurrencyFromCents(a.closing_balance_cents)}
                    {hasChildren ? <span className="block text-xs text-slate-600" title="This account plus its sub-accounts">Total {formatCurrencyFromCents(rollupCents)}</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* RIGHT PANE */}
        <section className="min-w-0 flex-1">
          <div className="flex flex-wrap items-end gap-2 rounded border border-gray-200 bg-white p-2" data-testid="reclassify-filters">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">From<DatePicker value={fromDate} onChange={setFromDate} className="h-9" /></label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">To<DatePicker value={toDate} onChange={setToDate} className="h-9" /></label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Type
              <SelectCombobox value={sourceType} onChange={(e) => setSourceType(e.target.value)} data-testid="reclassify-type">
                <option value="">All</option>
                {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </SelectCombobox>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Class
              <SelectCombobox value={classId} onChange={(e) => setClassId(e.target.value)} data-testid="reclassify-class">
                <option value="">All</option>
                {(classesQ.data?.classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}
              </SelectCombobox>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Memo / description
              <input value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 rounded border border-gray-300 px-2 text-xs" placeholder="e.g. Dreamline" data-testid="reclassify-search" />
            </label>
            <label className="flex min-w-[12rem] flex-col gap-1 text-xs font-semibold text-slate-600" data-testid="reclassify-item">Item
              <ReferenceSelect value={itemId || null} onChange={(next) => setItemId(next ?? "")} options={itemRefOptions} createKind="item" operatingCompanyId={companyId} placeholder="All items" loading={itemsQ.isLoading} onOptionCreated={() => void itemsQ.refetch()} />
            </label>
            <label className="flex min-w-[12rem] flex-col gap-1 text-xs font-semibold text-slate-600">Load
              <EntityPicker kind="load" operatingCompanyId={companyId} value={loadId} onChange={(v) => setLoadId(v)} allowCreate={false} allowClear ariaLabel="Load" />
            </label>
            <Button type="button" onClick={() => runFind()} data-testid="reclassify-find">Find transactions</Button>
          </div>

          {chips.length ? (
            <div className="mt-2 flex flex-wrap gap-1" data-testid="reclassify-chips">
              {chips.map((c) => (
                <span key={c.label} className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs">
                  {c.label}<button type="button" onClick={c.clear} aria-label={`Remove ${c.label}`} className="font-bold">×</button>
                </span>
              ))}
            </div>
          ) : null}

          {!applied ? (
            <div className="mt-3 rounded border border-dashed border-gray-300 p-6 text-center text-xs text-slate-600" data-testid="reclassify-empty">
              Click any account on the left to open every transaction behind its balance — or set filters and Find. Then select lines and reclassify the account, class or vendor at once.
            </div>
          ) : (
            <>
              <div className="mt-2 flex items-center justify-between rounded border border-gray-200 bg-white px-2 py-1 text-xs" data-testid="reclassify-selection-bar" data-b5-selection-bar="1">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={pageAllSelected} onChange={togglePage} aria-label="Select all on this page" />
                  <Button type="button" size="sm" disabled={selected.size === 0} onClick={() => setModalOpen(true)} data-testid="reclassify-open-modal">Reclassify</Button>
                  <span className="font-semibold" data-testid="reclassify-selection-count">{selected.size} transaction line{selected.size === 1 ? "" : "s"} selected: {formatCurrencyFromCents(selectedSum)}</span>
                </div>
                <span className="text-slate-600">{linesQ.data ? `${linesQ.data.total_lines} line(s) · ${linesQ.data.reclassifiable_lines} reclassifiable · net ${formatCurrencyFromCents(linesQ.data.total_net_amount_cents)}` : ""}</span>
              </div>
              {/* ROUND 370.3 — the listed rows ARE the balance; if they ever disagree the screen says so instead of showing both. */}
              {linesQ.data && activeAccount && !applied.sourceType && !applied.classId && !applied.search && !applied.itemId && !applied.loadId && applied.from === fromDate && applied.to === toDate ? (
                linesQ.data.closing_balance_cents === activeAccount.closing_balance_cents && linesQ.data.total_net_amount_cents === activeAccount.period_activity_cents ? (
                  <div className="mt-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-slate-600" data-testid="reclassify-balance-check" data-r370-agree="1">
                    Opening {formatCurrencyFromCents(linesQ.data.opening_cents)} + {linesQ.data.total_lines} listed line(s) {formatCurrencyFromCents(linesQ.data.total_net_amount_cents)} = balance {formatCurrencyFromCents(linesQ.data.closing_balance_cents)} — matches the account tree.
                  </div>
                ) : (
                  <div className="mt-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700" role="alert" data-testid="reclassify-balance-check" data-r370-agree="0">
                    These lines do not add up to the account balance: listed {formatCurrencyFromCents(linesQ.data.closing_balance_cents)}, tree {formatCurrencyFromCents(activeAccount.closing_balance_cents)}. Do not rely on either number until this is fixed.
                  </div>
                )
              ) : null}
              {linesQ.error ? <ListErrorState {...formatQueryErrorDetail(linesQ.error)} onRetry={() => void linesQ.refetch()} /> : null}
              <div className="mt-1 overflow-x-auto rounded border border-gray-200 bg-white">
                <table className="w-full text-xs" data-testid="reclassify-grid" data-b5-account-no-col="1">
                  <thead className="bg-slate-50 text-center uppercase tracking-wide text-gray-600">
                    <tr>
                      <th className="p-2 w-6"></th>
                      <th className="p-2 text-center" aria-sort={sort.key === "date" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}><button type="button" className="font-bold uppercase" onClick={() => toggleSort("date")} data-testid="reclassify-sort-date">Date{sortMark("date")}</button></th>
                      <th className="p-2 text-center" aria-sort={sort.key === "type" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}><button type="button" className="font-bold uppercase" onClick={() => toggleSort("type")} data-testid="reclassify-sort-type">Type{sortMark("type")}</button></th>
                      <th className="p-2 text-center" aria-sort={sort.key === "num" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}><button type="button" className="font-bold uppercase" onClick={() => toggleSort("num")} data-testid="reclassify-sort-num">Num{sortMark("num")}</button></th>
                      <th className="p-2 text-center" aria-sort={sort.key === "name" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}><button type="button" className="font-bold uppercase" onClick={() => toggleSort("name")} data-testid="reclassify-sort-name">Name{sortMark("name")}</button></th>
                      <th className="p-2 text-center" aria-sort={sort.key === "item" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}><button type="button" className="font-bold uppercase" onClick={() => toggleSort("item")} data-testid="reclassify-sort-item">Item{sortMark("item")}</button></th>
                      <th className="p-2 text-center" aria-sort={sort.key === "memo" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}><button type="button" className="font-bold uppercase" onClick={() => toggleSort("memo")} data-testid="reclassify-sort-memo">Memo / description{sortMark("memo")}</button></th>
                      <th className="p-2 text-center" data-testid="reclassify-col-account-no">Account no.</th>
                      <th className="p-2 text-center" aria-sort={sort.key === "account" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}><button type="button" className="font-bold uppercase" onClick={() => toggleSort("account")} data-testid="reclassify-sort-account">Account{sortMark("account")}</button></th>
                      <th className="p-2 text-center" aria-sort={sort.key === "load" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}><button type="button" className="font-bold uppercase" onClick={() => toggleSort("load")} data-testid="reclassify-sort-load">Load{sortMark("load")}</button></th>
                      <th className="p-2 text-center" aria-sort={sort.key === "class" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}><button type="button" className="font-bold uppercase" onClick={() => toggleSort("class")} data-testid="reclassify-sort-class">Class{sortMark("class")}</button></th>
                      <th className="p-2 text-center" aria-sort={sort.key === "debit" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}><button type="button" className="font-bold uppercase" onClick={() => toggleSort("debit")} data-testid="reclassify-sort-debit">Debit{sortMark("debit")}</button></th>
                      <th className="p-2 text-center" aria-sort={sort.key === "credit" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}><button type="button" className="font-bold uppercase" onClick={() => toggleSort("credit")} data-testid="reclassify-sort-credit">Credit{sortMark("credit")}</button></th>
                      <th className="p-2 text-center" aria-sort={sort.key === "amount" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}><button type="button" className="font-bold uppercase" onClick={() => toggleSort("amount")} data-testid="reclassify-sort-amount">Net amount{sortMark("amount")}</button></th>
                      <th className="p-2 text-center" aria-sort={sort.key === "balance" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}><button type="button" className="font-bold uppercase" onClick={() => toggleSort("balance")} data-testid="reclassify-sort-balance">Balance{sortMark("balance")}</button></th>
                    </tr>
                  </thead>
                  <tbody>
                    {linesQ.isLoading ? <tr><td colSpan={15} className="p-3 text-slate-600">Finding…</td></tr> : null}
                    {/* LAW 368.3 — "could not read" and "nothing here" are different sentences. */}
                    {linesQ.error ? <tr><td colSpan={15} className="p-3 font-semibold text-red-700" data-testid="reclassify-could-not-read">Could not read the transactions for this selection — the list below is not empty, it failed to load.</td></tr> : null}
                    {!linesQ.isLoading && !linesQ.error && lines.length === 0 ? <tr><td colSpan={15} className="p-3 text-slate-600" data-testid="reclassify-genuinely-empty">No transactions in this period{applied?.accountId ? " for this account" : ""} (from {formatDateQboList(applied!.from)} to {formatDateQboList(applied!.to)}).</td></tr> : null}
                    {lines.map((l) => {
                      const why = notReclassifiable(l);
                      const doc = docTarget(l);
                      return (
                      <tr key={l.posting_id} className={`border-t border-gray-100 ${selected.has(l.posting_id) ? "bg-slate-100" : ""} ${why ? "text-slate-600" : ""}`} data-testid={`reclassify-line-${l.posting_id}`} title={why ?? undefined}>
                        <td className="p-2"><input type="checkbox" checked={selected.has(l.posting_id)} onChange={() => toggle(l)} disabled={!!why} aria-label={why ? `Not reclassifiable: ${why}` : "Select line"} /></td>
                        <td className="p-2 whitespace-nowrap"><EntityLink kind={doc.kind} id={doc.id} label={formatDateQboList(l.entry_date)} /></td>
                        <td className="p-2">{(l.source_transaction_type ?? "journal entry").replace(/_/g, " ")}{l.already_reclassified_batch_id ? <span className="ml-1 rounded bg-slate-200 px-1 text-xs" title={`Reclassified in batch ${l.already_reclassified_batch_id}`}>reclassified</span> : null}{l.is_reversed ? <span className="ml-1 rounded bg-slate-200 px-1 text-xs">reversed</span> : null}{l.is_reversal ? <span className="ml-1 rounded bg-slate-200 px-1 text-xs">reversal</span> : null}</td>
                        <td className="p-2"><EntityLink kind={doc.kind} id={doc.id} label={l.document_number ?? (doc.kind === "journal_entry" ? "Journal entry" : (l.source_transaction_type ?? "").replace(/_/g, " "))} /></td>
                        <td className="p-2">{l.entity_uuid && (l.entity_type === "vendor" || l.entity_type === "customer" || l.entity_type === "driver" || l.entity_type === "unit") ? <EntityLink kind={l.entity_type} id={l.entity_uuid} label={l.entity_name ?? "—"} /> : l.entity_name ?? "—"}</td>
                        <td className="p-2">{l.item_id ? <EntityLink kind="catalog_item" id={l.item_id} label={l.item_name ?? "Item"} /> : "—"}</td>
                        <td className="p-2 max-w-[22rem] truncate" title={l.description ?? ""}>{l.description ?? "—"}</td>
                        {/* BANK-F91042 — ORDERS §B-5 ACCOUNT NO. column; value gated by Show account numbers (house law). */}
                        <td className="p-2 whitespace-nowrap tabular-nums" data-b5-account-no="1">{showAccountNumbers ? ((l.account_number ?? "").trim() || "—") : "—"}</td>
                        <td className="p-2"><EntityLink kind="account" id={l.account_id} label={formatAccountDisplayLabel({ account_name: l.account_name, account_number: l.account_number }, { showNumber: false })} /></td>
                        <td className="p-2">{l.load_id ? <EntityLink kind="load" id={l.load_id} label={l.load_number ?? "Load"} /> : "—"}</td>
                        <td className="p-2">{l.class_name ?? "—"}</td>
                        <td className="p-2 text-right tabular-nums">{l.debit_cents ? <EntityLink kind={doc.kind} id={doc.id} label={formatCurrencyFromCents(l.debit_cents)} /> : ""}</td>
                        <td className="p-2 text-right tabular-nums">{l.credit_cents ? <EntityLink kind={doc.kind} id={doc.id} label={formatCurrencyFromCents(l.credit_cents)} /> : ""}</td>
                        <td className="p-2 text-right tabular-nums"><EntityLink kind={doc.kind} id={doc.id} label={formatCurrencyFromCents(l.net_amount_cents)} /></td>
                        <td className="p-2 text-right tabular-nums">{applied?.accountId ? formatCurrencyFromCents(l.running_balance_cents) : "—"}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600" data-b5-goto-page="1" data-testid="reclassify-pager">
                <span>{linesQ.data ? `${Math.min(offset + 1, linesQ.data.total_lines)}–${Math.min(offset + PAGE, linesQ.data.total_lines)} of ${linesQ.data.total_lines}` : ""}</span>
                <span className="flex flex-wrap items-center gap-1">
                  <Button type="button" size="sm" variant="tertiary" disabled={offset === 0} onClick={() => { const next = Math.max(0, offset - PAGE); setOffset(next); setGotoPageDraft(String(Math.floor(next / PAGE) + 1)); }}>Previous</Button>
                  <label className="inline-flex items-center gap-1 font-semibold text-slate-600">
                    Go to page
                    <input
                      type="text"
                      inputMode="numeric"
                      className="h-7 w-12 rounded-sm border border-[#E5E7EB] px-1 text-center text-xs tabular-nums"
                      value={gotoPageDraft}
                      onChange={(e) => setGotoPageDraft(e.target.value.replace(/[^\d]/g, ""))}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" || !linesQ.data) return;
                        const totalPages = Math.max(1, Math.ceil(linesQ.data.total_lines / PAGE));
                        const page = Math.min(totalPages, Math.max(1, Number(gotoPageDraft) || 1));
                        setGotoPageDraft(String(page));
                        setOffset((page - 1) * PAGE);
                      }}
                      aria-label="Go to page"
                      data-testid="reclassify-goto-page"
                    />
                    of {linesQ.data ? Math.max(1, Math.ceil(linesQ.data.total_lines / PAGE)) : "—"}
                  </label>
                  <Button type="button" size="sm" variant="tertiary" disabled={!linesQ.data || offset + PAGE >= linesQ.data.total_lines} onClick={() => { const next = offset + PAGE; setOffset(next); setGotoPageDraft(String(Math.floor(next / PAGE) + 1)); }}>Next</Button>
                </span>
              </div>
            </>
          )}

          {lastResult ? (
            <div className="mt-3 rounded border border-slate-200 bg-slate-100 p-2 text-xs" data-testid="reclassify-result">
              <div className="font-semibold">Batch {lastResult.batch_id.slice(0, 8)}: {lastResult.lines_applied} line(s) reclassified ({formatCurrencyFromCents(lastResult.amount_cents_moved)} moved), {lastResult.lines_refused} refused.</div>
              <ul className="mt-1 space-y-0.5">
                {lastResult.documents.map((d, i) => (
                  <li key={i}>
                    {d.document_number ?? d.source_transaction_id ?? "line"} ({d.source_transaction_type ?? "journal entry"}): {d.refusal_reason ? <span className="text-red-700">refused — {d.refusal_reason}</span> : <>{d.lines_applied} line(s) → JE <EntityLink kind="journal_entry" id={d.reclass_journal_entry_id} label={d.reclass_journal_entry_id?.slice(0, 8) ?? ""} />{d.document_updated ? " · document updated" : <span className="text-slate-700 font-semibold"> · document NOT updated: {d.document_update_note}</span>}</>}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-3 rounded border border-gray-200 bg-white" data-testid="reclassify-batches">
            <div className="border-b border-gray-200 px-2 py-1 text-xs font-bold uppercase tracking-wide text-gray-600">Reclassify batches</div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left"><tr><th className="p-2">When</th><th className="p-2">By</th><th className="p-2">Change</th><th className="p-2">Reason</th><th className="p-2 text-right">Lines</th><th className="p-2 text-right">Moved</th><th className="p-2">Status</th><th className="p-2"></th></tr></thead>
              <tbody>
                {(batchesQ.data?.batches ?? []).map((b) => (
                  <tr key={b.id} className="border-t border-gray-100">
                    <td className="p-2 whitespace-nowrap">{formatDateQboList(b.created_at)}</td>
                    <td className="p-2">{b.created_by_email ?? "—"}</td>
                    <td className="p-2">{[b.to_account_name ? `→ ${formatAccountDisplayLabel({ account_name: b.to_account_name, account_number: b.to_account_number }, { showNumber: showAccountNumbers })}` : null, b.to_class_name ? `class → ${b.to_class_name}` : null, b.to_location_name ? `location → ${b.to_location_name}` : null, b.to_entity_uuid ? `${b.to_entity_type} → ${b.to_entity_uuid.slice(0, 8)}` : null].filter(Boolean).join(" · ")}</td>
                    <td className="p-2 max-w-[18rem] truncate" title={b.reason}>{b.reason}</td>
                    <td className="p-2 text-right tabular-nums">{b.lines_applied}/{b.lines_requested}{b.lines_refused ? ` (${b.lines_refused} refused)` : ""}</td>
                    <td className="p-2 text-right tabular-nums">{formatCurrencyFromCents(b.amount_cents_moved)}</td>
                    <td className="p-2">{b.status}{b.undone_at ? ` ${formatDateQboList(b.undone_at)}` : ""}</td>
                    <td className="p-2">
                      {b.status === "applied" && b.lines_applied > 0 ? (
                        undoTarget === b.id ? (
                          <span className="flex items-center gap-1">
                            <input value={undoReason} onChange={(e) => setUndoReason(e.target.value)} placeholder="Undo reason" className="h-7 w-40 rounded border border-gray-300 px-1 text-xs" data-testid={`reclassify-undo-reason-${b.id}`} />
                            <Button type="button" size="sm" loading={undoMut.isPending} disabled={undoReason.trim().length < 3} onClick={() => undoMut.mutate({ batchId: b.id, reason: undoReason.trim() }, { onSuccess: () => { setUndoTarget(null); setUndoReason(""); } })} data-testid={`reclassify-undo-confirm-${b.id}`}>Confirm undo</Button>
                            <Button type="button" size="sm" variant="tertiary" onClick={() => { setUndoTarget(null); setUndoReason(""); }}>Cancel</Button>
                          </span>
                        ) : (
                          <Button type="button" size="sm" variant="tertiary" onClick={() => setUndoTarget(b.id)} data-testid={`reclassify-undo-${b.id}`}>Undo</Button>
                        )
                      ) : null}
                    </td>
                  </tr>
                ))}
                {batchesQ.data && batchesQ.data.batches.length === 0 ? <tr><td colSpan={8} className="p-2 text-slate-600">No batches yet.</td></tr> : null}
              </tbody>
            </table>
            {undoMut.error ? <div className="p-2"><ListErrorState {...formatQueryErrorDetail(undoMut.error)} onRetry={() => undoMut.reset()} /></div> : null}
          </div>
        </section>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" role="dialog" aria-modal="true" data-testid="reclassify-modal" data-b5-reclassify-modal="1">
          <div className="w-[32rem] rounded border border-gray-300 bg-white p-4 shadow-lg">
            <h2 className="text-xs font-bold uppercase tracking-wide">Reclassify {selected.size} transaction line{selected.size === 1 ? "" : "s"} · {formatCurrencyFromCents(selectedSum)}</h2>
            <p className="mt-1 text-xs text-slate-600">You can now reclassify the vendor/customer name from this page. Leave a field blank to keep it unchanged. Each document gets its own linked RECLASSIFICATION journal entry; a bill's vendor is the A/P subledger and is not changed here.</p>
            <div className="mt-3 flex flex-col gap-1 text-xs font-semibold text-slate-600">Change account to
              {/* ReferenceSelect createKind="account" — canonical picker, showAccountNumbers gate via coaAccountReferenceOption */}
              <ReferenceSelect value={toAccount || null} onChange={(next) => setToAccount(next ?? "")} options={accountRefOptions} createKind="account" operatingCompanyId={companyId} placeholder="Select…" loading={coaQ.isLoading} onOptionCreated={() => void coaQ.refetch()} />
            </div>
            {/* BANK-F91056 — ORDERS §B-5 Change class named for Chrome / guard (parity with location + vendor). */}
            <label className="mt-2 flex flex-col gap-1 text-xs font-semibold text-slate-600" data-b5-change-class="1">Change class to
              <SelectCombobox value={toClass} onChange={(e) => setToClass(e.target.value)} data-testid="reclassify-to-class">
                <option value="">Select…</option>
                {(classesQ.data?.classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}
              </SelectCombobox>
            </label>
            <label className="mt-2 flex flex-col gap-1 text-xs font-semibold text-slate-600" data-b5-change-location="1">
              Change location to
              <div data-testid="reclassify-to-location">
                <FuelStopLocationPicker
                  operatingCompanyId={companyId}
                  value={toLocation}
                  onChange={(id) => setToLocation(id)}
                  placeholder="Select…"
                  fuelStopOnly={false}
                />
              </div>
            </label>
            <div className="mt-2 flex flex-col gap-1 text-xs font-semibold text-slate-600" data-b5-change-vendor-customer="1">
              Change vendor/customer to
              <div className="flex gap-2">
                <SelectCombobox
                  value={toEntityKind}
                  onChange={(e) => {
                    setToEntityKind(e.target.value as "vendor" | "customer");
                    setToVendor("");
                  }}
                  data-testid="reclassify-to-entity-kind"
                >
                  <option value="vendor">Vendor</option>
                  <option value="customer">Customer</option>
                </SelectCombobox>
                <div className="min-w-0 flex-1">
                  {toEntityKind === "vendor" ? (
                    <ReferenceSelect value={toVendor || null} onChange={(next) => setToVendor(next ?? "")} options={vendorRefOptions} createKind="vendor" operatingCompanyId={companyId} placeholder="Select…" loading={vendorsQ.isLoading} onOptionCreated={() => void vendorsQ.refetch()} />
                  ) : (
                    <ReferenceSelect value={toVendor || null} onChange={(next) => setToVendor(next ?? "")} options={customerRefOptions} createKind="customer" operatingCompanyId={companyId} placeholder="Select…" loading={customersQ.isLoading} onOptionCreated={() => void customersQ.refetch()} />
                  )}
                </div>
              </div>
            </div>
            <label className="mt-2 flex flex-col gap-1 text-xs font-semibold text-slate-600">Reason (required, audited on every document)
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 rounded border border-gray-300 px-2 text-xs" placeholder="e.g. Zelle to Dreamline belongs on Relay/Dreamline payables" data-testid="reclassify-reason" />
            </label>
            {applyMut.error ? <div className="mt-2"><ListErrorState {...formatQueryErrorDetail(applyMut.error)} onRetry={() => applyMut.reset()} /></div> : null}
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="tertiary" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="button" loading={applyMut.isPending} disabled={reason.trim().length < 3 || (!toAccount && !toClass && !toLocation && !toVendor)} onClick={() => applyMut.mutate()} data-testid="reclassify-apply">Apply</Button>
            </div>
          </div>
        </div>
      ) : null}
    </AccountingSubNavWrapper>
  );
}
