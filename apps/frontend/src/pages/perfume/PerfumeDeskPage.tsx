/**
 * PERFUME-DESK — TIO Perfumes price desk. Owner-only, hidden (no menu entry; reached from the company
 * selector's "Other businesses → TIO Perfumes" or /perfume). Isolated: reads/writes perfume.* only.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { SelectCombobox } from "../../components/Combobox";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  downloadPerfumeExcel, getPerfumeAccess, getPerfumeGrid, getPerfumeReview, getPerfumeRules, listPerfumeLists, listPerfumeVendors, putPerfumeRules,
  type PerfumeFacetKey, type PerfumeGridRow, type PerfumeGridView, type PerfumeRules,
} from "../../api/perfume";
import logoUrl from "./tio-perfumes-logo.png";
import { PerfumeListsPanel } from "./PerfumeListsPanel";
import { PerfumeReviewPanel } from "./PerfumeReviewPanel";
import { tr } from "./perfumeI18n";

type Tab = PerfumeGridView | "lists" | "review" | "rules";
const TABS: Array<[Tab, string]> = [
  ["buy", "Buy · compare vendors"], ["sell", "Sell to stores"], ["wholesale", "Wholesale"], ["all", "All items"],
  ["lists", "Price lists & import"], ["review", "Review"], ["rules", "Rules"],
];

export const money = (c: unknown) => (c == null || c === "" ? "—" : `${Number(c) < 0 ? "−" : ""}$${(Math.abs(Number(c)) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (v: unknown) => (v == null || v === "" ? "—" : `${Number(v).toFixed(1)}%`);

function TioLogo() {
  return (
    <span
      role="img"
      aria-label={tr("perfume.desk.1", "TIO Perfumes")}
      className="inline-block h-[44px] w-[67px] shrink-0 text-[#4B5563]"
      style={{ backgroundColor: "currentColor", WebkitMaskImage: `url(${logoUrl})`, maskImage: `url(${logoUrl})`, WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat" }}
    />
  );
}

export default function PerfumeDeskPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find(([k]) => k === params.get("tab"))?.[0] ?? "buy") as Tab;
  const access = useQuery({ queryKey: ["perfume", "access"], queryFn: getPerfumeAccess, staleTime: 300_000 });
  const allowed = access.data?.allowed === true;
  const review = useQuery({ queryKey: ["perfume", "review-count"], queryFn: () => getPerfumeReview(0, 1), enabled: allowed });
  if (!allowed) {
    return (
      <div className="p-3" data-testid="perfume-desk-locked">
        <div className="text-xs text-gray-700">
          {access.isLoading ? "Checking access…" : access.isError ? `Could not check access: ${(access.error as Error).message}` : "The TIO Perfumes price desk is not open for this login."}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3 p-3" data-testid="perfume-desk">
      <div className="flex flex-wrap items-center gap-3">
        <TioLogo />
        <div className="min-w-0">
          <h1 className="text-page-title font-semibold text-[#1F2A44]">{tr("perfume.desk.2", "TIO Perfumes · Price desk")}</h1>
          <div className="text-xs text-gray-500">{tr("perfume.desk.3", "ScentsX LLC dba TIO Perfumes · owner only · separate from every carrier · never posts to accounting")}</div>
        </div>
      </div>
      <nav className="flex flex-wrap gap-1" aria-label={tr("perfume.desk.4", "Price desk sections")}>
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setParams({ tab: k })}
            aria-current={tab === k ? "page" : undefined}
            className={`h-[34px] rounded-sm border px-3 text-xs font-semibold ${tab === k ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-300 bg-[var(--surface-unselected)] text-gray-700 hover:bg-[var(--surface-hover)]"}`}
          >
            {label}{k === "review" && review.data?.total ? ` (${review.data.total.toLocaleString()})` : ""}
          </button>
        ))}
      </nav>
      {tab === "lists" ? <PerfumeListsPanel /> : tab === "review" ? <PerfumeReviewPanel /> : tab === "rules" ? <RulesPanel /> : <GridPanel view={tab} />}
    </div>
  );
}

/* ---------------- grid ---------------- */

const VIEW_HELP: Record<PerfumeGridView, string> = {
  buy: "Every item your vendors offer, side by side. The cheapest after cushion and freight wins and becomes your cost. Margin and markup are against the lowest Laredo list price.",
  sell: "Items a Laredo store lists. The store's own cost is backed out of its list price at its %, closed to your rounding — that is the most it can pay you.",
  wholesale: "Your price to customers at the margin you type (My margin %) over your landed cost, closed to your rounding.",
  all: "The whole item database: every bottle, every UPC it carries, every vendor price.",
};
const PAGE = 200;
const PAGE_SIZES = [50, 100, 200, 300, 500, 1000];

/** Columns a view opens with; every other column is one tick away in the ⚙ gear. */
function defaultVisible(view: PerfumeGridView, key: string): boolean {
  const item = ["code", "upc", "brand", "name", "size_ml", "conc", "gender", "flags"].includes(key);
  if (view === "all") return item || ["upc_count", "n_vendors", "best_vendor", "landed_likely", "low_sell"].includes(key);
  if (view === "buy") return item || /^v:.*:price$/.test(key) || ["best_vendor", "saves_next", "landed_likely", "low_sell", "profit", "margin", "markup", "target_price_margin", "target_max_cost"].includes(key);
  if (view === "sell") return item || /^s:.*:price$/.test(key) || ["landed_likely", "store_cost_margin", "store_cost_markup", "offer_store", "offer_profit", "offer_margin", "offer_markup"].includes(key);
  return item || /^target_/.test(key) || ["landed_likely", "low_sell"].includes(key);
}

const FACETS: Array<{ key: PerfumeFacetKey; label: string; all: string }> = [
  { key: "category", label: "Type", all: "All types" },
  { key: "gender", label: "Gender", all: "All genders" },
  { key: "brand", label: "Brand", all: "All brands" },
  { key: "size", label: "Size ml", all: "All sizes" },
  { key: "vendor", label: "Vendor", all: "All vendors" },
];
const NO_PICKS: Record<PerfumeFacetKey, string[]> = { category: [], gender: [], brand: [], size: [], vendor: [] };

const GENDER_WORD: Record<string, string> = { W: "Women", M: "Men", U: "Unisex", "—": "Not stated" };

function GridPanel({ view }: { view: PerfumeGridView }) {
  const { pushToast } = useToast();
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "brand", dir: "asc" });
  const [q, setQ] = useState("");
  const [picks, setPicks] = useState<Record<PerfumeFacetKey, string[]>>(NO_PICKS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE);
  // The margin the owner wants to see prices at — typed here, applied on Enter or leaving the box.
  const [target, setTarget] = useState<number | null>(null);
  const [targetDraft, setTargetDraft] = useState("");
  const applyTarget = () => {
    const t = targetDraft.trim() === "" ? null : Number(targetDraft);
    if (t != null && !(Number.isFinite(t) && t >= 0 && t <= 95)) { pushToast(tr("perfume.desk.target.bad", "Margin must be between 0 and 95%."), "error"); return; }
    if (t !== target) { setTarget(t); setPage(1); }
  };
  const query = useQuery({
    queryKey: ["perfume", "grid", view, sort.key, sort.dir, q, picks, target, page, pageSize],
    queryFn: () => getPerfumeGrid({ view, sort: sort.key, dir: sort.dir, q, ...picks, target_pct: target, offset: (page - 1) * pageSize, limit: pageSize }),
    placeholderData: (prev) => prev,
  });
  const cols = query.data?.cols ?? [];
  const columns: Array<ParityColumn<PerfumeGridRow>> = useMemo(
    () => cols.map((c) => ({
      key: c.key,
      label: c.label,
      sortable: true,
      defaultHidden: !defaultVisible(view, c.key),
      kind: c.kind === "money" || c.kind === "pct" || c.kind === "int" ? ("number" as const) : undefined,
      cellClass: c.kind === "text" ? undefined : "text-right tabular-nums",
      sortValue: (r: PerfumeGridRow) => r[c.key] ?? null,
      exportValue: (r: PerfumeGridRow) => r[c.key] ?? null,
      render: (r: PerfumeGridRow) => {
        const v = r[c.key];
        if (c.kind === "money") return money(v);
        if (c.kind === "pct") return <span className={v == null ? "" : Number(v) < 0 ? "text-red-700" : Number(v) >= 20 ? "text-slate-700 font-semibold" : ""}>{pct(v)}</span>;
        if (c.key === "best_vendor" && r.tied) return <span title={tr("perfume.desk.5", "Tied lowest price")} className="rounded-sm bg-slate-100 px-1">{String(v)}</span>;
        if (c.key === "upc" && Number(r.upc_count) > 1) return <span title={String(r.upcs ?? "")}>{String(v)} <span className="text-gray-500">+{Number(r.upc_count) - 1}</span></span>;
        return v == null || v === "" ? "—" : String(v);
      },
    })),
    [cols, view],
  );
  const columnGroups = useMemo(() => {
    const groups: Array<{ label: string; keys: string[] }> = [];
    for (const c of cols) {
      const g = groups.find((x) => x.label === c.group);
      if (g) g.keys.push(c.key); else groups.push({ label: c.group, keys: [c.key] });
    }
    return groups;
  }, [cols]);
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <section className="space-y-2" aria-label={`${view} view`}>
      <div className="text-xs text-gray-600">{VIEW_HELP[view]}</div>
      {/* TABLE_DATE_OMIT: price-grid rows are SKU×vendor cells; list date lives on the Lists tab, not the comparison grid. */}
      <ParityTable<PerfumeGridRow>
        columns={columns}
        rows={query.data?.rows ?? []}
        rowKey={(r) => String(r.id)}
        loading={query.isLoading}
        storageKey={`perfume-desk-${view}-v2`}
        columnGroups={columnGroups}
        sortKey={sort.key}
        sortDirection={sort.dir}
        sortMode="external"
        onSortChange={(key, dir) => { setSort({ key, dir }); setPage(1); }}
        page={1}
        pageSize={Math.max(1, query.data?.rows?.length ?? pageSize)}
        hidePager
        suppressToolbarSearch
        stickyHeader
        enableColumnReorder
        emptyText={q || Object.values(picks).some((p) => p.length > 0) ? "No items match the search and filters." : "No items yet — import a price list."}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder={tr("perfume.desk.6", "Search code, UPC, SKU, brand, name")}
              aria-label={tr("perfume.desk.7", "Search items")}
              className="h-[34px] w-[260px] max-w-full rounded-sm border border-gray-300 px-2 text-xs"
            />
            <label className="flex items-center gap-1 text-xs text-gray-700">
              {tr("perfume.desk.target.label", "My margin %")}
              <input
                type="number"
                step="0.5"
                min="0"
                max="95"
                inputMode="decimal"
                data-testid="perfume-target-pct"
                value={targetDraft}
                placeholder={query.data?.target_pct != null ? String(query.data.target_pct) : ""}
                onChange={(e) => setTargetDraft(e.target.value)}
                onBlur={applyTarget}
                onKeyDown={(e) => { if (e.key === "Enter") applyTarget(); }}
                aria-label={tr("perfume.desk.target.aria", "Margin percent for the My target columns")}
                className="h-[34px] w-[80px] rounded-sm border border-gray-300 px-2 text-xs tabular-nums"
              />
            </label>
            {FACETS.map((f) => (
              <MultiSelectDropdown
                key={f.key}
                label={f.label}
                allLabel={f.all}
                data-testid={`perfume-filter-${f.key}`}
                searchable={f.key === "brand" || f.key === "vendor" || f.key === "size"}
                options={(query.data?.facets?.[f.key] ?? []).map((o) => ({ value: o.value, label: `${f.key === "gender" ? GENDER_WORD[o.value] ?? o.value : o.value} (${o.count.toLocaleString()})` }))}
                selected={picks[f.key]}
                onChange={(next) => { setPicks((p) => ({ ...p, [f.key]: next })); setPage(1); }}
              />
            ))}
            {Object.values(picks).some((p) => p.length > 0) ? (
              <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => { setPicks(NO_PICKS); setPage(1); }}>
                {tr("perfume.desk.filters.clear", "Clear filters")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className="h-[34px] px-3 text-xs"
              onClick={() => {
                const visible = columns.filter((c) => !c.defaultHidden).map((c) => String(c.key));
                downloadPerfumeExcel({ view, sort: sort.key, dir: sort.dir, q, ...picks, target_pct: target }, visible).catch((e) => pushToast(String(e?.message ?? e), "error"));
              }}
            >
              {tr("perfume.desk.8", "Export to Excel")}
            </Button>
          </div>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
        <span>{total.toLocaleString()} {tr("perfume.desk.9", "items · page")} {page} {tr("perfume.desk.10", "of")} {pages}{query.data ? ` · measured ${new Date(query.data.measured_at).toLocaleTimeString()}` : ""}</span>
        <span className="flex items-center gap-1">
          <label className="flex items-center gap-1">
            {tr("perfume.desk.pagesize", "Rows per page")}
            <SelectCombobox
              value={String(pageSize)}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              aria-label={tr("perfume.desk.pagesize.aria", "Rows per page")}
              data-testid="perfume-page-size"
              className="h-[34px] w-[84px] text-xs"
            >
              {PAGE_SIZES.map((n) => <option key={n} value={String(n)}>{n}</option>)}
            </SelectCombobox>
          </label>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={page <= 1} onClick={() => setPage(1)}>{tr("perfume.desk.11", "First")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tr("perfume.desk.12", "Previous")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={page >= pages} onClick={() => setPage(page + 1)}>{tr("perfume.desk.13", "Next")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={page >= pages} onClick={() => setPage(pages)}>{tr("perfume.desk.14", "Last")}</Button>
        </span>
      </div>
    </section>
  );
}

/* ---------------- rules ---------------- */

const STEPS: Array<[PerfumeRules["round_step"], string]> = [["5", ".05"], ["10", ".10"], ["25", ".25"], ["50", ".50"], ["100", "1.00"], ["75", "ends in .75"]];
const DIRS: Array<[PerfumeRules["round_dir"], string]> = [["up", "Up"], ["nearest", "Nearest"], ["down", "Down"]];

function RulesPanel() {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const rules = useQuery({ queryKey: ["perfume", "rules"], queryFn: getPerfumeRules });
  const vendors = useQuery({ queryKey: ["perfume", "vendors"], queryFn: listPerfumeVendors });
  const lists = useQuery({ queryKey: ["perfume", "lists"], queryFn: listPerfumeLists });
  const [draft, setDraft] = useState<Partial<PerfumeRules>>({});
  const r = { ...(rules.data ?? {}), ...draft } as PerfumeRules;
  if (!rules.data) return <div className="text-xs text-gray-500">{tr("perfume.desk.15", "Loading rules…")}</div>;
  const dollars = (k: keyof PerfumeRules) => (
    <input type="number" step="0.05" min="0" aria-label={String(k)} className="h-[40px] w-[120px] rounded-sm border border-gray-300 px-2 text-xs tabular-nums"
      value={((r[k] as number) / 100).toFixed(2)} onChange={(e) => setDraft({ ...draft, [k]: Math.round(Number(e.target.value) * 100) })} />
  );
  const percent = (k: "vendor_earn_pct" | "store_earn_pct") => (
    <input type="number" step="0.5" min="0" max="99" aria-label={k} className="h-[40px] w-[104px] rounded-sm border border-gray-300 px-2 text-xs tabular-nums"
      value={r[k]} onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })} />
  );
  const save = async () => {
    try { await putPerfumeRules(draft); setDraft({}); await qc.invalidateQueries({ queryKey: ["perfume"] }); pushToast("Rules saved — every view recomputed", "success"); }
    catch (e) { pushToast(userFacingApiError(e, "Rules not saved"), "error"); }
  };
  const seg = <T extends string>(opts: Array<[T, string]>, value: T, set: (v: T) => void) => (
    <span className="inline-flex flex-wrap gap-1">{opts.map(([v, l]) => (
      <button key={v} type="button" onClick={() => set(v)} aria-pressed={value === v}
        className={`h-[34px] rounded-sm border px-2 text-xs ${value === v ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-300 bg-[var(--surface-unselected)]"}`}>{l}</button>
    ))}</span>
  );
  return (
    <section className="max-w-[960px] space-y-4 rounded-sm border border-gray-200 bg-white p-3" aria-label={tr("perfume.desk.16", "Rules")}>
      <div>
        <div className="text-section-header">{tr("perfume.desk.17", "Closed numbers")}</div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">{tr("perfume.desk.18", "Close to")} {seg(STEPS, r.round_step, (v) => setDraft({ ...draft, round_step: v }))} {tr("perfume.desk.19", "Direction")} {seg(DIRS, r.round_dir, (v) => setDraft({ ...draft, round_dir: v }))}</div>
      </div>
      <div>
        <div className="text-section-header">{tr("perfume.desk.20", "Vendor cushion (default — each vendor can override in Price lists)")}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">{tr("perfume.desk.21", "From")} {dollars("cushion_lo_cents")} {tr("perfume.desk.22", "to")} {dollars("cushion_hi_cents")}</div>
      </div>
      <div>
        <div className="text-section-header">{tr("perfume.desk.23", "Freight per piece (default)")}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">{tr("perfume.desk.24", "From")} {dollars("freight_lo_cents")} {tr("perfume.desk.25", "to")} {dollars("freight_hi_cents")}</div>
      </div>
      <div>
        <div className="text-section-header">{tr("perfume.desk.26", "What they earn")}</div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">{tr("perfume.desk.27", "Vendors")} {percent("vendor_earn_pct")}{tr("perfume.desk.28", "% · Laredo stores")} {percent("store_earn_pct")}{tr("perfume.desk.29", "% — every view shows both the margin and the markup reading")}</div>
      </div>
      <div className="flex gap-2">
        <Button type="button" className="h-[34px] px-3 text-xs" disabled={!Object.keys(draft).length} onClick={() => void save()}>{tr("perfume.desk.30", "Save")}</Button>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!Object.keys(draft).length} onClick={() => setDraft({})}>{tr("perfume.desk.31", "Cancel")}</Button>
      </div>
      <div className="text-xs text-gray-600">
        {vendors.data?.vendors?.length ?? 0} {tr("perfume.desk.32", "vendors ·")} {lists.data?.lists?.length ?? 0} {tr("perfume.desk.33", "price lists on file. My cost = vendor price − low cushion + high freight (the safe number); best case = vendor price − high cushion + low freight. Margin = profit ÷ price. Markup = profit ÷ cost.")}
      </div>
    </section>
  );
}
