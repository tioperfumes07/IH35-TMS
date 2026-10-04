/**
 * RECLASSIFY TRANSACTIONS — QBO Tools → Reclassify clone (owner click-through, spec §24/24b/24c/24d).
 * LEFT: chart of accounts with the period activity per account (click = working set).
 * RIGHT: From/To · Type · Class · search → Find → GL LINES grid (date, type, num, name, memo, account,
 * class, net amount) · select-all per page · live "N lines selected: $sum" · [Reclassify] → modal:
 * change account / class / vendor (each optional) + reason → Apply → one RECLASSIFICATION JE per
 * document, audit each, results per document, Undo per batch.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../../auth/useAuth";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { EntityPicker } from "../../components/EntityPicker";
import { useAccountingItemsQuery } from "../../hooks/useAccountingItemsQuery";
import { naturalCentsForType } from "../../lib/naturalBalance";
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
  applyReclassify, findReclassifyLines, getReclassifyAccountTree, getReclassifyFacets, listReclassifyBatches, undoReclassifyBatch,
  type ReclassifyBatchResult, type ReclassifyFacet, type ReclassifyFacets, type ReclassifyLine, type ReclassifyTreeAccount,
} from "../../api/reclassify";
import { docTarget, notReclassifiable } from "../../lib/reclassifyDrill";

const PAGE = 100;

// The register's default window is fiscal year to date (Jan 1 -> today). An account's balance in the tree is everything
// posted through the To date, so a one-month window (the old last-month-to-today default) could never list what the
// balance counts — and USMCA's whole book (operating since 2026-08-07) sits inside the fiscal year.
function firstOfFiscalYear() { return `${new Date().getFullYear()}-01-01`; }
function today() { return new Date().toISOString().slice(0, 10); }

type SortKey = "date" | "type" | "num" | "name" | "memo" | "account" | "item" | "load" | "truck" | "driver" | "trailer" | "vendor" | "class" | "debit" | "credit" | "amount" | "balance";

/** ROUND 370 (owner) — every filter is a multi-select (MultiSelectDropdown, the app's account / status filter). */
type Filters = {
  accountIds: string[]; types: string[]; classIds: string[]; itemIds: string[]; loadIds: string[];
  truckIds: string[]; driverIds: string[]; trailerIds: string[]; vendorIds: string[]; search: string;
};
const NO_FILTERS: Filters = { accountIds: [], types: [], classIds: [], itemIds: [], loadIds: [], truckIds: [], driverIds: [], trailerIds: [], vendorIds: [], search: "" };

/** ROUND 370 (owner) — the register's columns. Optional ones are added from the Columns chooser; the choice is per viewer. */
type ColKey = "date" | "type" | "num" | "name" | "item" | "memo" | "account_no" | "account" | "load" | "truck" | "driver" | "trailer" | "vendor" | "class" | "debit" | "credit" | "amount" | "balance";
const COLUMNS: Array<{ key: ColKey; label: string; sort?: SortKey; optional?: boolean; right?: boolean; entityKind?: "load" }> = [
  { key: "date", label: "Date", sort: "date" },
  { key: "type", label: "Type", sort: "type" },
  { key: "num", label: "Num", sort: "num" },
  { key: "name", label: "Name", sort: "name" },
  { key: "item", label: "Item", sort: "item" },
  { key: "memo", label: "Memo / description", sort: "memo" },
  { key: "account_no", label: "Account no." },
  { key: "account", label: "Account", sort: "account" },
  { key: "load", label: "Load", sort: "load", entityKind: "load" }, // cell renders <EntityLink kind="load">
  { key: "truck", label: "Truck", sort: "truck", optional: true },
  { key: "driver", label: "Driver", sort: "driver", optional: true },
  { key: "trailer", label: "Trailer", sort: "trailer", optional: true },
  { key: "vendor", label: "Vendor", sort: "vendor", optional: true },
  { key: "class", label: "Class", sort: "class" },
  { key: "debit", label: "Debit", sort: "debit", right: true },
  { key: "credit", label: "Credit", sort: "credit", right: true },
  { key: "amount", label: "Net amount", sort: "amount", right: true },
  { key: "balance", label: "Balance", sort: "balance", right: true },
];
const COLS_STORAGE_KEY = "ih35.reclassify.columns.v1";
function readColumns(): ColKey[] {
  const fallback = COLUMNS.filter((c) => !c.optional).map((c) => c.key);
  try {
    const raw = window.localStorage.getItem(COLS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : null;
    const known = new Set(COLUMNS.map((c) => c.key));
    return parsed?.length ? parsed.filter((k): k is ColKey => known.has(k as ColKey)) : fallback;
  } catch {
    return fallback;
  }
}
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
  const { user } = useAuth();
  const isOwner = user?.role === "Owner";
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  // Owner ruling (Round 83): account numbers hidden by default, shown only when the toggle is on.
  const [showAccountNumbers, setShowAccountNumbers] = useShowAccountNumbers();

  const [fromDate, setFromDate] = useState(firstOfFiscalYear());
  const [toDate, setToDate] = useState(today());
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const setFilter = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((cur) => ({ ...cur, [k]: v }));
  // The register LOADS ON OPEN (every account, the default window): it used to start null, and the lines query only runs
  // once `applied` is set, so the page opened empty until a click or Find.
  const [applied, setApplied] = useState<({ from: string; to: string } & Filters) | null>(() => ({ from: firstOfFiscalYear(), to: today(), ...NO_FILTERS }));
  const [visibleCols, setVisibleCols] = useState<ColKey[]>(readColumns);
  const chooseColumns = (next: string[]) => {
    const keep = COLUMNS.filter((c) => next.includes(c.key)).map((c) => c.key);
    setVisibleCols(keep);
    try { window.localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(keep)); } catch { /* per-viewer convenience only */ }
  };
  const shownCols = COLUMNS.filter((c) => visibleCols.includes(c.key));
  // ROUND 368.1 — statement side, inactive toggle, sort, by-item / by-load selectors.
  const [side, setSide] = useState<Side>("profit_and_loss");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [offset, setOffset] = useState(0);
  const [gotoPageDraft, setGotoPageDraft] = useState("1");
  const [selected, setSelected] = useState<Map<string, ReclassifyLine>>(new Map());
  const [modalOpen, setModalOpen] = useState(false);
  const [toAccount, setToAccount] = useState("");
  const [toClass, setToClass] = useState("");
  const [toLocation, setToLocation] = useState<string | null>(null);
  const [toEntityKind, setToEntityKind] = useState<"vendor" | "customer">("vendor");
  const [toVendor, setToVendor] = useState("");
  // U24 (owner): reclassify by item and by load.
  const [toItem, setToItem] = useState("");
  const [toLoad, setToLoad] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const itemsTargetQ = useAccountingItemsQuery({ operatingCompanyId: companyId, kind: "all", search: itemSearch, enabled: modalOpen && !!companyId });
  const itemTargetOptions = useMemo<ReferenceOption[]>(() => (itemsTargetQ.data ?? []).map((row) => ({ value: row.id, label: row.name })), [itemsTargetQ.data]);
  const [reason, setReason] = useState("");
  const [overrideRefusals, setOverrideRefusals] = useState(false);
  const [lastResult, setLastResult] = useState<ReclassifyBatchResult | null>(null);
  const [accountFilter, setAccountFilter] = useState("");
  const [undoTarget, setUndoTarget] = useState<string | null>(null);
  const [undoReason, setUndoReason] = useState("");

  const accountsQ = useQuery({ queryKey: ["reclassify-accounts", companyId, fromDate, toDate], queryFn: () => getReclassifyAccountTree(companyId, fromDate, toDate), enabled: !!companyId });
  const facetsQ = useQuery({ queryKey: ["reclassify-facets", companyId, fromDate, toDate], queryFn: () => getReclassifyFacets(companyId, fromDate, toDate), enabled: !!companyId });
  const coaQ = useQuery({ queryKey: ["reclassify-coa", companyId], queryFn: () => listCoaAccountsForJe(companyId), enabled: !!companyId });
  const classesQ = useQuery({ queryKey: ["reclassify-classes"], queryFn: () => listClassesForJe() });
  const vendorsQ = useQuery({ queryKey: ["reclassify-vendors", companyId], queryFn: () => listVendors({ operating_company_id: companyId, limit: 1000 }), enabled: modalOpen && !!companyId && toEntityKind === "vendor" });
  const customersQ = useQuery({ queryKey: ["reclassify-customers", companyId], queryFn: () => listCustomers({ operating_company_id: companyId, limit: 1000 }), enabled: modalOpen && !!companyId && toEntityKind === "customer" });
  const batchesQ = useQuery({ queryKey: ["reclassify-batches", companyId], queryFn: () => listReclassifyBatches(companyId), enabled: !!companyId });

  const linesQ = useQuery({
    queryKey: ["reclassify-lines", companyId, applied, offset, sort],
    queryFn: () => findReclassifyLines(companyId, {
      from_date: applied!.from, to_date: applied!.to, account_ids: applied!.accountIds, source_types: applied!.types, class_ids: applied!.classIds,
      search: applied!.search || undefined, item_ids: applied!.itemIds, load_ids: applied!.loadIds,
      unit_ids: applied!.truckIds, driver_ids: applied!.driverIds, trailer_ids: applied!.trailerIds, vendor_ids: applied!.vendorIds,
      sort_key: sort.key, sort_dir: sort.dir, limit: PAGE, offset,
    }),
    enabled: !!companyId && !!applied,
  });

  const applyMut = useMutation({
    mutationFn: () => applyReclassify({
      operating_company_id: companyId, posting_ids: Array.from(selected.keys()), reason,
      to_account_id: toAccount || null, to_class_id: toClass || null, to_location_id: toLocation || null,
      to_entity_uuid: toVendor || null, to_entity_type: toVendor ? toEntityKind : null,
      to_item_id: toItem || null, to_load_id: toLoad || null,
      filter_snapshot: applied ?? {},
      override_refusals: isOwner && overrideRefusals ? true : undefined,
    }),
    onSuccess: (res) => {
      setLastResult(res); setModalOpen(false); setSelected(new Map()); setToAccount(""); setToClass(""); setToLocation(null); setToVendor(""); setToEntityKind("vendor"); setToItem(""); setToLoad(null); setReason(""); setOverrideRefusals(false);
      void qc.invalidateQueries({ queryKey: ["reclassify-lines"] }); void qc.invalidateQueries({ queryKey: ["reclassify-accounts"] }); void qc.invalidateQueries({ queryKey: ["reclassify-batches"] });
    },
  });
  const undoMut = useMutation({
    mutationFn: (p: { batchId: string; reason: string }) => undoReclassifyBatch(companyId, p.batchId, p.reason),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["reclassify-lines"] }); void qc.invalidateQueries({ queryKey: ["reclassify-accounts"] }); void qc.invalidateQueries({ queryKey: ["reclassify-batches"] }); },
  });

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
  const selectedSum = Array.from(selected.values()).reduce((s, l) => s + naturalCentsForType(l.net_amount_cents, l.account_type), 0);
  const oneAccountId = applied?.accountIds.length === 1 ? applied.accountIds[0] : null;
  const activeAccount: ReclassifyTreeAccount | undefined = accountsQ.data?.accounts?.find((a) => a.account_id === oneAccountId);
  // U27 — one account listed: its balances in that account's natural sign; several accounts: each line in its own.
  const acctNatural = (cents: number) => (activeAccount ? naturalCentsForType(cents, activeAccount.account_type) : cents);
  const onlyAccountFilter = !!applied && applied.types.length + applied.classIds.length + applied.itemIds.length + applied.loadIds.length + applied.truckIds.length + applied.driverIds.length + applied.trailerIds.length + applied.vendorIds.length === 0 && !applied.search;

  const runFind = (overrideAccountIds?: string[]) => {
    const next = overrideAccountIds === undefined ? f : { ...f, accountIds: overrideAccountIds };
    setApplied({ from: fromDate, to: toDate, ...next });
    setOffset(0); setGotoPageDraft("1"); setSelected(new Map());
  };
  // ROUND 370 — clicking an account LOADS its transactions (it used to only highlight it; the list never ran).
  const openAccount = (id: string | null) => { const ids = id ? [id] : []; setFilter("accountIds", ids); runFind(ids); };
  const facetOptions = (k: keyof ReclassifyFacets) => ((facetsQ.data as ReclassifyFacets | undefined)?.[k] ?? []).map((o: ReclassifyFacet) => ({ value: o.id, label: `${k === "types" ? o.label.replace(/_/g, " ") : o.label} (${o.n})` }));
  const accountOptions = useMemo(() => (accountsQ.data?.accounts ?? []).map((a) => ({ value: a.account_id, label: formatAccountDisplayLabel({ account_name: a.account_name, account_number: a.account_number }, { showNumber: showAccountNumbers }) })), [accountsQ.data, showAccountNumbers]);
  const toggleSort = (key: SortKey) => { setSort((cur) => (cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "desc" : "asc" })); setOffset(0); setGotoPageDraft("1"); };
  const sortMark = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "");
  const toggle = (l: ReclassifyLine) => { if (notReclassifiable(l)) return; setSelected((prev) => { const n = new Map(prev); if (n.has(l.posting_id)) n.delete(l.posting_id); else n.set(l.posting_id, l); return n; }); };
  const togglePage = () => setSelected((prev) => { const n = new Map(prev); if (pageAllSelected) selectableLines.forEach((l) => n.delete(l.posting_id)); else selectableLines.forEach((l) => n.set(l.posting_id, l)); return n; });

  const chips: Array<{ label: string; clear: () => void }> = [];
  const nameOf = (opts: Array<{ value: string; label: string }>, ids: string[]) => ids.map((id) => opts.find((o) => o.value === id)?.label.replace(/ \(\d+\)$/, "") ?? "selected").join(", ");
  const chipGroups: Array<[keyof Filters, string, Array<{ value: string; label: string }>]> = [
    ["accountIds", "Account", accountOptions], ["types", "Type", facetOptions("types")], ["classIds", "Class", facetOptions("classes")],
    ["itemIds", "Item", facetOptions("items")], ["loadIds", "Load", facetOptions("loads")], ["truckIds", "Truck", facetOptions("trucks")],
    ["driverIds", "Driver", facetOptions("drivers")], ["trailerIds", "Trailer", facetOptions("trailers")], ["vendorIds", "Vendor", facetOptions("vendors")],
  ];
  for (const [k, label, opts] of chipGroups) {
    const ids = (applied?.[k] ?? []) as string[];
    if (applied && ids.length) chips.push({ label: `${label}: ${nameOf(opts, ids)}`, clear: () => { setFilter(k, [] as never); setApplied({ ...applied, [k]: [] }); setSelected(new Map()); } });
  }
  if (applied?.search) chips.push({ label: `Search: ${applied.search}`, clear: () => { setFilter("search", ""); setApplied({ ...applied, search: "" }); } });
  const cell = (k: ColKey, l: ReclassifyLine, doc: ReturnType<typeof docTarget>): ReactNode => {
    switch (k) {
      case "date": return <EntityLink kind={doc.kind} id={doc.id} label={formatDateQboList(l.entry_date)} />;
      case "type": return <>{(l.source_transaction_type ?? "journal entry").replace(/_/g, " ")}{l.already_reclassified_batch_id ? <span className="ml-1 rounded bg-slate-200 px-1 text-xs" title={`Reclassified in batch ${l.already_reclassified_batch_id}`}>reclassified</span> : null}{l.is_reversed ? <span className="ml-1 rounded bg-slate-200 px-1 text-xs">reversed</span> : null}{l.is_reversal ? <span className="ml-1 rounded bg-slate-200 px-1 text-xs">reversal</span> : null}{l.document_purged ? <span className="ml-1 rounded bg-slate-200 px-1 text-xs" title="The document was reversed, voided and purged; its number is from the audit trail and the link opens its journal entry.">purged</span> : null}</>;
      case "num": return <EntityLink kind={doc.kind} id={doc.id} label={l.document_number ?? (doc.kind === "journal_entry" ? "Journal entry" : (l.source_transaction_type ?? "").replace(/_/g, " "))} />;
      case "name": return l.entity_uuid && (l.entity_type === "vendor" || l.entity_type === "customer" || l.entity_type === "driver" || l.entity_type === "unit") ? <EntityLink kind={l.entity_type} id={l.entity_uuid} label={l.entity_name ?? "—"} /> : l.entity_name ?? "—";
      case "item": return l.item_id ? <EntityLink kind="catalog_item" id={l.item_id} label={l.item_name ?? "Item"} /> : "—";
      case "memo": return l.description ?? "—";
      // BANK-F91042 — ORDERS §B-5 ACCOUNT NO. column; value gated by Show account numbers (house law).
      case "account_no": return showAccountNumbers ? ((l.account_number ?? "").trim() || "—") : "—";
      case "account": return <EntityLink kind="account" id={l.account_id} label={formatAccountDisplayLabel({ account_name: l.account_name, account_number: l.account_number }, { showNumber: false })} />;
      case "load": return l.load_id ? <EntityLink kind="load" id={l.load_id} label={l.load_number ?? "Load"} /> : "—";
      case "truck": return l.unit_id ? <EntityLink kind="unit" id={l.unit_id} label={l.unit_number ?? "Truck"} /> : "—";
      case "driver": return l.driver_id ? <EntityLink kind="driver" id={l.driver_id} label={l.driver_name ?? "Driver"} /> : "—";
      case "trailer": return l.trailer_id ? <EntityLink kind="trailer" id={l.trailer_id} label={l.trailer_number ?? "Trailer"} /> : "—";
      case "vendor": return l.vendor_id ? <EntityLink kind="vendor" id={l.vendor_id} label={l.vendor_name ?? "Vendor"} /> : "—";
      case "class": return l.class_name ?? "—";
      case "debit": return l.debit_cents ? <EntityLink kind={doc.kind} id={doc.id} label={formatCurrencyFromCents(l.debit_cents)} /> : "";
      case "credit": return l.credit_cents ? <EntityLink kind={doc.kind} id={doc.id} label={formatCurrencyFromCents(l.credit_cents)} /> : "";
      case "amount": return <EntityLink kind={doc.kind} id={doc.id} label={formatCurrencyFromCents(naturalCentsForType(l.net_amount_cents, l.account_type))} />;
      case "balance": return oneAccountId ? formatCurrencyFromCents(acctNatural(l.running_balance_cents)) : "—";
    }
  };

  return (
    <AccountingSubNavWrapper title="Reclassify transactions" subtitle="Change the account, class or vendor on many GL lines at once. Every document is re-posted through a linked RECLASSIFICATION journal entry; undo per batch.">
      <div className="flex min-h-[70vh] gap-3" data-testid="reclassify-page" data-b5-reclassify="1">
        {/* LEFT PANE — THE WHOLE CHART OF ACCOUNTS (LAW 363.8): every account, 0.00 included, balances derived from the GL. */}
        <aside className="shrink-0 overflow-y-auto rounded border border-gray-200 bg-white" style={{ width: `${paneWidthCh}ch` }} data-testid="reclassify-account-tree" data-b5-period-balances="1" data-r368-whole-chart="1">
          <div className="border-b border-gray-200 p-2">
            {/* BANK-F91430 — ORDERS §B-5 left pane PERIOD BALANCES label (ops verify-b5-reclassify-batch). */}
            <div className="text-xs font-bold uppercase tracking-wide text-gray-600">Accounts · period balances</div>
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
              <button type="button" onClick={() => openAccount(null)} className={`flex w-full items-center justify-between px-2 py-1 text-left hover:bg-slate-50 ${f.accountIds.length === 0 ? "bg-slate-100 font-semibold" : ""}`}>
                <span>All accounts</span>
              </button>
            </li>
            {!accountsQ.isLoading && !accountsQ.error && tree.length === 0 ? (
              <li className="p-2 text-slate-600" data-testid="reclassify-tree-empty">No {side === "profit_and_loss" ? "Profit & Loss" : side === "balance_sheet" ? "Balance Sheet" : "statistical"} accounts{accountFilter ? " match the filter" : ""}.</li>
            ) : null}
            {tree.map(({ a, depth, rollupCents, hasChildren }) => (
              <li key={a.account_id}>
                <button type="button" onClick={() => openAccount(a.account_id)} title={`${a.account_type ?? ""}${a.detail_type_name ? ` · ${a.detail_type_name}` : ""}${a.is_active ? "" : " · inactive"} — opening ${formatCurrencyFromCents(naturalCentsForType(a.opening_cents, a.account_type))}, period ${formatCurrencyFromCents(naturalCentsForType(a.period_activity_cents, a.account_type))}`} className={`flex w-full items-center justify-between gap-2 py-1 pr-2 text-left hover:bg-slate-50 ${f.accountIds.includes(a.account_id) ? "bg-slate-100 font-semibold" : ""}`} style={{ paddingLeft: `${0.5 + depth * 1}rem` }} data-testid={`reclassify-account-${a.account_id}`}>
                  {/* showAccountNumbers gate — formatAccountDisplayLabel hides the number unless the toggle is on */}
                  <span className="min-w-0 whitespace-normal break-words">
                    {formatAccountDisplayLabel({ account_name: a.account_name, account_number: a.account_number }, { showNumber: showAccountNumbers })}
                    {a.is_active ? null : <span className="ml-1 rounded bg-slate-200 px-1 text-xs">inactive</span>}
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    {formatCurrencyFromCents(naturalCentsForType(a.closing_balance_cents, a.account_type))}
                    {hasChildren ? <span className="block text-xs text-slate-600" title="This account plus its sub-accounts">Total {formatCurrencyFromCents(naturalCentsForType(rollupCents, a.account_type))}</span> : null}
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
            {/* ROUND 370 (owner) — every column that can be shown filters, multi-select, the same component as the account and status filters. */}
            <MultiSelectDropdown label="Account" options={accountOptions} selected={f.accountIds} onChange={(v) => setFilter("accountIds", v)} allLabel="All accounts" searchable data-testid="reclassify-filter-account" />
            <MultiSelectDropdown label="Type" options={facetOptions("types")} selected={f.types} onChange={(v) => setFilter("types", v)} allLabel="All types" data-testid="reclassify-filter-type" />
            <MultiSelectDropdown label="Class" options={facetOptions("classes")} selected={f.classIds} onChange={(v) => setFilter("classIds", v)} allLabel="All classes" searchable data-testid="reclassify-filter-class" />
            <MultiSelectDropdown label="Item" options={facetOptions("items")} selected={f.itemIds} onChange={(v) => setFilter("itemIds", v)} allLabel="All items" searchable data-testid="reclassify-filter-item" />
            <MultiSelectDropdown label="Load" options={facetOptions("loads")} selected={f.loadIds} onChange={(v) => setFilter("loadIds", v)} allLabel="All loads" searchable data-testid="reclassify-filter-load" />
            <MultiSelectDropdown label="Truck" options={facetOptions("trucks")} selected={f.truckIds} onChange={(v) => setFilter("truckIds", v)} allLabel="All trucks" searchable data-testid="reclassify-filter-truck" />
            <MultiSelectDropdown label="Driver" options={facetOptions("drivers")} selected={f.driverIds} onChange={(v) => setFilter("driverIds", v)} allLabel="All drivers" searchable data-testid="reclassify-filter-driver" />
            <MultiSelectDropdown label="Trailer" options={facetOptions("trailers")} selected={f.trailerIds} onChange={(v) => setFilter("trailerIds", v)} allLabel="All trailers" searchable data-testid="reclassify-filter-trailer" />
            <MultiSelectDropdown label="Vendor" options={facetOptions("vendors")} selected={f.vendorIds} onChange={(v) => setFilter("vendorIds", v)} allLabel="All vendors" searchable data-testid="reclassify-filter-vendor" />
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Memo / description
              <input value={f.search} onChange={(e) => setFilter("search", e.target.value)} className="h-9 rounded border border-gray-300 px-2 text-xs" placeholder="e.g. Dreamline" data-testid="reclassify-search" />
            </label>
            <MultiSelectDropdown label="Columns" options={COLUMNS.map((c) => ({ value: c.key, label: c.optional ? `${c.label} (added)` : c.label }))} selected={visibleCols} onChange={chooseColumns} allLabel="All columns" data-testid="reclassify-columns" />
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
                <span className="text-slate-600">{linesQ.data ? `${linesQ.data.total_lines} line(s) · ${linesQ.data.reclassifiable_lines} reclassifiable · net ${formatCurrencyFromCents(acctNatural(linesQ.data.total_net_amount_cents))}` : ""}</span>
              </div>
              {/* ROUND 370.3 — the listed rows ARE the balance; if they ever disagree the screen says so instead of showing both. */}
              {linesQ.data && activeAccount && onlyAccountFilter && applied.from === fromDate && applied.to === toDate ? (
                linesQ.data.closing_balance_cents === activeAccount.closing_balance_cents && linesQ.data.total_net_amount_cents === activeAccount.period_activity_cents ? (
                  <div className="mt-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-slate-600" data-testid="reclassify-balance-check" data-r370-agree="1">
                    Opening {formatCurrencyFromCents(acctNatural(linesQ.data.opening_cents))} + {linesQ.data.total_lines} listed line(s) {formatCurrencyFromCents(acctNatural(linesQ.data.total_net_amount_cents))} = balance {formatCurrencyFromCents(acctNatural(linesQ.data.closing_balance_cents))} — matches the account tree.
                  </div>
                ) : (
                  <div className="mt-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700" role="alert" data-testid="reclassify-balance-check" data-r370-agree="0">
                    These lines do not add up to the account balance: listed {formatCurrencyFromCents(acctNatural(linesQ.data.closing_balance_cents))}, tree {formatCurrencyFromCents(acctNatural(activeAccount.closing_balance_cents))}. Do not rely on either number until this is fixed.
                  </div>
                )
              ) : null}
              {linesQ.error ? <ListErrorState {...formatQueryErrorDetail(linesQ.error)} onRetry={() => void linesQ.refetch()} /> : null}
              <div className="mt-1 overflow-x-auto rounded border border-gray-200 bg-white">
                <table className="w-full text-xs" data-testid="reclassify-grid" data-b5-account-no-col="1">
                  <thead className="bg-slate-50 text-center uppercase tracking-wide text-gray-600">
                    <tr>
                      <th className="p-2 w-6"></th>
                      {shownCols.map((c) =>
                        c.key === "account_no" ? (
                          <th key={c.key} className="p-2 text-center" data-testid="reclassify-col-account-no">{c.label}</th>
                        ) : c.sort ? (
                          <th key={c.key} className="p-2 text-center" aria-sort={sort.key === c.sort ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                            <button type="button" className="font-bold uppercase" onClick={() => toggleSort(c.sort!)} data-testid={`reclassify-sort-${c.sort}`}>{c.label}{sortMark(c.sort)}</button>
                          </th>
                        ) : (
                          <th key={c.key} className="p-2 text-center" data-testid={`reclassify-col-${c.key.replace("_", "-")}`}>{c.label}</th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {linesQ.isLoading ? <tr><td colSpan={shownCols.length + 1} className="p-3 text-slate-600">Finding…</td></tr> : null}
                    {/* LAW 368.3 — "could not read" and "nothing here" are different sentences. */}
                    {linesQ.error ? <tr><td colSpan={shownCols.length + 1} className="p-3 font-semibold text-red-700" data-testid="reclassify-could-not-read">Could not read the transactions for this selection — the list below is not empty, it failed to load.</td></tr> : null}
                    {!linesQ.isLoading && !linesQ.error && lines.length === 0 ? <tr><td colSpan={shownCols.length + 1} className="p-3 text-slate-600" data-testid="reclassify-genuinely-empty">No transactions in this period{oneAccountId ? " for this account" : ""} (from {formatDateQboList(applied!.from)} to {formatDateQboList(applied!.to)}).</td></tr> : null}
                    {lines.map((l) => {
                      const why = notReclassifiable(l);
                      const doc = docTarget(l);
                      return (
                      <tr key={l.posting_id} className={`border-t border-gray-100 ${selected.has(l.posting_id) ? "bg-slate-100" : ""} ${why ? "text-slate-600" : ""}`} data-testid={`reclassify-line-${l.posting_id}`} title={why ?? undefined}>
                        <td className="p-2"><input type="checkbox" checked={selected.has(l.posting_id)} onChange={() => toggle(l)} disabled={!!why} aria-label={why ? `Not reclassifiable: ${why}` : "Select line"} /></td>
                        {shownCols.map((c) =>
                          c.key === "account_no" ? (
                            <td key={c.key} className="p-2 whitespace-nowrap" data-b5-account-no="1">{cell(c.key, l, doc)}</td>
                          ) : (
                            <td key={c.key} className={`p-2${c.right ? " text-right tabular-nums" : ""}${c.key === "date" ? " whitespace-nowrap" : ""}${c.key === "memo" ? " max-w-[22rem] truncate" : ""}`} title={c.key === "memo" ? l.description ?? "" : undefined}>{cell(c.key, l, doc)}</td>
                          ),
                        )}
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
                    <td className="p-2">{b.status}{b.undone_at ? ` ${formatDateQboList(b.undone_at)}` : ""}{b.override_refusals ? <span className="ml-1 font-semibold text-slate-700" data-testid={`reclassify-batch-override-${b.id}`}>· owner override</span> : null}</td>
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
            {/* U24 (owner): by item — the account follows the item's own expense account unless one is chosen above. */}
            <label className="mt-2 flex flex-col gap-1 text-xs font-semibold text-slate-600" data-testid="reclassify-to-item">Change item to
              <ReferenceSelect value={toItem || null} onChange={(next) => setToItem(next ?? "")} options={itemTargetOptions} createKind="item" operatingCompanyId={companyId} placeholder="Select…" loading={itemsTargetQ.isLoading} onSearch={setItemSearch} />
            </label>
            {/* U24 (owner): by load — the line moves to the load; the reclass entry's legs carry the old and the new load. */}
            <label className="mt-2 flex flex-col gap-1 text-xs font-semibold text-slate-600" data-testid="reclassify-to-load">Change load to
              <EntityPicker kind="load" operatingCompanyId={companyId} value={toLoad} onChange={(v) => setToLoad(v)} allowCreate={false} allowClear ariaLabel="Change load to" />
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
            {isOwner ? (
              <label className="mt-2 flex items-start gap-2 text-xs text-slate-700" data-testid="reclassify-owner-override">
                <input type="checkbox" checked={overrideRefusals} onChange={(e) => setOverrideRefusals(e.target.checked)} className="mt-0.5" />
                <span><span className="font-semibold">Owner override</span> — also move lines normally refused (A/R, A/P, inventory, payroll, subledger control accounts). Bank and cash lines are never moved here. Each overridden line is recorded with the refusal it bypassed and audited.</span>
              </label>
            ) : null}
            {applyMut.error ? <div className="mt-2"><ListErrorState {...formatQueryErrorDetail(applyMut.error)} onRetry={() => applyMut.reset()} /></div> : null}
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="tertiary" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="button" loading={applyMut.isPending} disabled={reason.trim().length < 3 || (!toAccount && !toClass && !toLocation && !toVendor && !toItem && !toLoad)} onClick={() => applyMut.mutate()} data-testid="reclassify-apply">Apply</Button>
            </div>
          </div>
        </div>
      ) : null}
    </AccountingSubNavWrapper>
  );
}
