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
import { MoneyInput } from "../../components/forms/MoneyInput";
import { Combobox, SelectCombobox } from "../../components/Combobox";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  downloadPerfumeExcel, getPerfumeAccess, getPerfumeGrid, getPerfumeReview, getPerfumeRules, listPerfumeLists, listPerfumeVendors, putPerfumeRules,
  type PerfumeFacetKey, type PerfumeGridRow, type PerfumeGridView, type PerfumeRules,
  canonicalizePerfumeBrands, rematchPerfumeReview, confirmPerfumeRow, searchPerfumeItems, searchPerfumeLines,
} from "../../api/perfume";
import logoUrl from "./tio-perfumes-logo.png";
import { PerfumeListsPanel } from "./PerfumeListsPanel";
import { PerfumeReviewPanel } from "./PerfumeReviewPanel";
import { tr } from "./perfumeI18n";

type Tab = PerfumeGridView | "lists" | "review" | "match" | "rules";
const TABS: Array<[Tab, string]> = [
  ["buy", "Purchase · compare vendors"], ["trade", "Trading · sell to my vendors"], ["wholesale", "Wholesale · vs competition"], ["comp", "Competition · their margin"], ["analysis", "List analysis"], ["all", "All items"],
  ["lists", "Price lists & import"], ["review", "Review"], ["match", "Match my list ↔ competitor"], ["rules", "Rules"],
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
  // Owner 2026-11-13: "each tab must have a button or selector so i can have it show only those items in my list and
  // all competitions and all vendors prices on only my items". One selector for the whole desk, in the URL, kept on
  // every tab switch.
  const mine = MINE_OPTIONS.find(([k]) => k === params.get("mine"))?.[0] ?? null;
  const go = (next: { tab?: Tab; mine?: MineChoice }) => {
    const t = next.tab ?? tab;
    const m = next.mine === undefined ? mine : next.mine;
    setParams(m ? { tab: t, mine: m } : { tab: t });
  };
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
            onClick={() => go({ tab: k })}
            aria-current={tab === k ? "page" : undefined}
            className={`h-[34px] rounded-sm border px-3 text-xs font-semibold ${tab === k ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-300 bg-[var(--surface-unselected)] text-gray-700 hover:bg-[var(--surface-hover)]"}`}
          >
            {label}{k === "review" && review.data?.total ? ` (${review.data.total.toLocaleString()})` : ""}
          </button>
        ))}
      </nav>
      {/* Owner 2026-11-12: "each tab should have its header so I can make sure I am in the correct one." */}
      <h2 className="border-b-2 border-[#1F2A44] pb-1 text-section-header font-bold uppercase tracking-wide text-[#4B5563]" data-testid="perfume-tab-header">
        {TABS.find(([k]) => k === tab)?.[1]}
      </h2>
      {tab === "lists" || tab === "rules" || tab === "match" || tab === "analysis" ? null : (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-gray-200 bg-white px-2 py-1.5" role="group" aria-label={tr("perfume.desk.mine.aria", "Show items")} data-testid="perfume-mine-filter">
          <span className="text-xs font-semibold text-[#1F2A44]">{tr("perfume.desk.mine.label", "Show")}</span>
          {(tab === "review" ? REVIEW_MINE_OPTIONS : MINE_OPTIONS).map(([k, l]) => (
            <button key={String(k)} type="button" aria-pressed={mine === k} data-testid={`perfume-mine-${k ?? "all"}`} onClick={() => go({ mine: k })}
              className={`h-[34px] rounded-sm border px-3 text-xs font-semibold ${mine === k ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-300 bg-[var(--surface-unselected)] text-gray-700 hover:bg-[var(--surface-hover)]"}`}>
              {tr(`perfume.desk.mine.${k ?? "all"}`, l)}
            </button>
          ))}
          <span className="text-xs text-gray-600">
            {tab === "review" ? (mine ? tr("perfume.desk.mine.help.review", "Only lines that can be an item on my offer list — confirm each one.") : tr("perfume.desk.mine.help.reviewOff", "Every line waiting for you.")) : mine ? tr("perfume.desk.mine.help.on", "Only items on this list — every supplier's and every competitor's price shown for them, on every tab.") : tr("perfume.desk.mine.help.off", "Every item this tab can price.")}
          </span>
        </div>
      )}
      {tab === "lists" ? <PerfumeListsPanel /> : tab === "match" ? <GridPanel view="analysis" mine={null} matchDesk /> : tab === "review" ? <PerfumeReviewPanel mine={mine ? "offer" : null} /> : tab === "rules" ? <RulesPanel /> : <GridPanel view={tab} mine={mine} />}
    </div>
  );
}

/* ---------------- grid ---------------- */

const VIEW_HELP: Record<PerfumeGridView, string> = {
  buy: "Buying from your suppliers: my last cost, purchase date, qty purchased, inventory and qty sold (from my inventory file — inventory from my list until it is uploaded), who is cheapest (Buy from), then each supplier's list price and its price less the cushion (Cushion).",
  trade: "Selling to your suppliers: your cost once, then for each supplier its list price, about what it earns on the item (list price − cushion − what it pays), and about the price you need to sell to it at ((list price − cushion) less Their earn %).",
  wholesale: "My offer price against each competitor's real price: their list price less the cushion ($0.25 at $10 and under, $0.50 over $10, $1.00 over $30). Over/under in $ and %, and the % to reduce my price (or the room to raise). Their description sits next to mine so every match can be checked.",
  comp: "Each competitor's margin if they buy from the cheapest supplier: that supplier's list price less the cushion ($0.25 at $10 and under, $0.50 over $10, $1.00 over $30 — change it in Rules) is their cost; their price less that is what they earn.",
  analysis: "My list analysed in my own format: ITEM · SALES (purchase date, qty, last cost, sold, inventory, margin, markup, offer, Esperanza, lowest sales price) · Purchases (min purchase price to match La Esperanza at Min margin — the My margin % box, 15 when empty — lowest vendor and price) · Analysis (under / over, % to raise or lower, new margin) · COMPETITOR (list price, cushion, sales price). Blank = that figure is not in any upload yet.",
  all: "The whole item database.",
};
type MineChoice = "offer" | "inventory" | "need" | null;
const MINE_OPTIONS: ReadonlyArray<readonly [MineChoice, string]> = [[null, "All items"], ["offer", "My offer list"], ["inventory", "My inventory"], ["need", "Need to buy"]];
const REVIEW_MINE_OPTIONS: ReadonlyArray<readonly [MineChoice, string]> = [[null, "All lines"], ["offer", "My offer list"]];
const PAGE = 200;
const PAGE_SIZES = [50, 100, 200, 300, 500, 1000];

/** Columns a view opens with; every other column is one tick away in the ⚙ gear. */
function defaultVisible(view: PerfumeGridView, key: string, mine: MineChoice = null): boolean {
  const item = ["brand", "name", "size_ml", "conc", "category"].includes(key);
  // Narrowed to my own list: on every tab, my list's figures plus EVERY supplier's list price and EVERY competitor's
  // price for those items (owner 2026-11-13), on top of the tab's own columns.
  // Owner 2026-11-14: no cost I never uploaded and no purchase quantities (no sales / movement data) by default.
  // List analysis: exactly the owner's format (a:* columns), nothing else.
  if (view === "analysis") return key.startsWith("a:");
  if (mine && view !== "comp" && (/^v:.*:price$/.test(key) || /^s:.*:price$/.test(key)
    || ["my_offer_desc", "my_offer_price", "my_qty", "best_vendor"].includes(key))) return true;
  // Purchase (owner 2026-11-12: "I am in purchase from vendors, I don't have costs, so there should be no costs"):
  // who is cheapest, then each supplier's list price and Cushion (list price less the cushion). No cost / price / profit columns.
  // Owner 2026-11-14: "in purchase compare vendors i need … my last cost, date, quantity purchased, current inventory,
  // qty sold … the last price i purchased is important because prices change weekly."
  if (view === "buy") return item || /^v:.*:(price|net)$/.test(key) || ["best_vendor", "my_last_cost", "my_purchase_date", "my_qty_purchased", "my_qty", "my_qty_sold"].includes(key);
  // Trading (owner 2026-11-12): my cost ONCE, then per supplier only their list price, what they earn, what I sell to them at.
  if (view === "trade") return item || /^t:.*:(list|earn|cost)$/.test(key) || ["landed_likely", "my_last_cost", "my_qty"].includes(key);
  // Owner 2026-11-14: "in competition their margin … the vendors prices should be after all the esperanza data
  // margins etc. i need to see their data next to mine" — mine, then the competitor (their line, list, cushion, sales
  // price, their cost, what they earn, margin), then every supplier's list price.
  if (view === "comp") return item || /^s:.*:(desc|price|cushion|real)$/.test(key) || /^c:.*:(earn|margin)$/.test(key) || /^v:.*:price$/.test(key)
    || ["my_offer_desc", "my_offer_price", "my_qty", "comp_low_vendor", "comp_low_list", "comp_cushion", "comp_cost"].includes(key);
  // Wholesale (owner 2026-11-14): my description + my offer price, then per competitor their description, list price,
  // cushion, real price, and me vs their real price ($, %, reduce / raise). No cost, margin or need-to-buy columns.
  if (view === "wholesale") return item || /^s:.*:(desc|price|cushion|real|diff|diff_pct|action)$/.test(key) || ["my_offer_desc", "my_offer_price"].includes(key);
  return item || ["upc", "my_qty", "my_last_cost", "my_offer_price", "landed_likely", "best_vendor", "low_sell"].includes(key);
}

const FACETS: Array<{ key: PerfumeFacetKey; label: string; all: string }> = [
  { key: "category", label: "Type", all: "All types" },
  { key: "gender", label: "Gender", all: "All genders" },
  { key: "brand", label: "Brand", all: "All brands" },
  { key: "size", label: "Size ml", all: "All sizes" },
  { key: "vendor", label: "Vendor", all: "All vendors" },
];
const NO_PICKS: Record<PerfumeFacetKey, string[]> = { category: [], gender: [], brand: [], size: [], vendor: [] };

/** List analysis columns no upload fills yet (purchase date, qty purchased, last cost, sold, and what needs a cost). */
const ANALYSIS_EMPTY = new Set(["a:purch_date", "a:qty", "a:last_cost", "a:sold", "a:margin", "a:markup", "a:new_margin"]);

/** Confirm a match right on the analysis row (owner 2026-11-14: "if from my list there are no matches or confirmed or
 *  still waiting for confirmation, then i should be able to confirm here"). Pick one of the proposed lines / items and
 *  Link — the same confirm the Review tab uses; nothing links without this click. */
/** List analysis · the match box (owner 2026-11-14: "in check the match, we are missing the box to search, suggestions
 *  etc, the correct matching engine"). The same engine as Review: the best suggestion is one click, the box starts on
 *  it, can be cleared, and searches any words in any order.
 *   - a line of mine with no item, or a competitor line → link THAT line to one of my items (items search);
 *   - a line of mine that has its item → link a COMPETITOR line to my item (competitor-lines search). */
function MatchCell({ row }: { row: PerfumeGridRow }) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const mode = row.link_mode === "line" ? "line" : "item";
  const linkRow = row.link_row == null ? null : String(row.link_row);
  const linkItem = row.link_item == null ? null : String(row.link_item);
  const cand = (Array.isArray(row.cand) ? row.cand : []) as Array<{ row_id: string; item_id: string; label: string; price_cents: number | null; why: string }>;
  const sugg = cand.map((x) => ({ value: mode === "line" ? x.row_id : x.item_id, label: x.label, sublabel: [x.price_cents != null ? money(x.price_cents) : "", x.why].filter(Boolean).join(" · ") }));
  const [pick, setPick] = useState<string | null>(row.matched === 1 ? null : sugg[0]?.value ?? null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const on = search.trim().length >= 2;
  const items = useQuery({ queryKey: ["perfume", "items", search], queryFn: () => searchPerfumeItems(search), enabled: on && mode === "item" });
  const lines = useQuery({ queryKey: ["perfume", "lines", search], queryFn: () => searchPerfumeLines(search), enabled: on && mode === "line" });
  const found = mode === "item"
    ? (items.data?.items ?? []).map((h) => ({ value: h.id, label: h.display_name, sublabel: h.upcs?.join(" ") ?? "" }))
    : (lines.data?.lines ?? []).map((h) => ({ value: h.row_id, label: `${h.description} · ${h.vendor}`, sublabel: [h.price_cents != null ? money(h.price_cents) : "", h.linked_to ? `now linked to ${h.linked_to}` : "not linked"].join(" · ") }));
  const options = [...sugg, ...found.filter((f) => !sugg.some((x) => x.value === f.value))];
  const go = async (target: string | null, createNew = false) => {
    setBusy(true);
    try {
      if (mode === "line") { if (!target || !linkItem) return; await confirmPerfumeRow(target, { item_id: linkItem }); }
      else { if (!linkRow) return; await confirmPerfumeRow(linkRow, createNew ? { create_new: true } : { item_id: target! }); }
      pushToast(tr("perfume.analysis.linked", "Linked."), "success");
      await qc.invalidateQueries({ queryKey: ["perfume"] });
    } catch (e) { pushToast(userFacingApiError(e, tr("perfume.analysis.linkfail", "Could not link")), "error"); }
    finally { setBusy(false); }
  };
  const best = row.matched === 1 ? null : sugg[0] ?? null;
  return (
    <span className="flex items-center gap-1" data-testid="perfume-analysis-matchbox">
      {best ? (
        <Button type="button" className="h-[28px] px-2 text-xs" disabled={busy} title={cand[0]?.why}
          onClick={() => void go(best.value)}>{tr("perfume.analysis.useSuggestion", "✓ Use suggestion")}</Button>
      ) : null}
      <span className="w-[260px]">
        <Combobox ariaLabel={mode === "line" ? "Competitor line" : "Item"} size="sm" value={pick} onChange={setPick} onSearch={setSearch} options={options} allowClear clearCommittedOnEdit
          placeholder={mode === "line" ? tr("perfume.analysis.searchLine", "Search their line, UPC or code") : tr("perfume.analysis.searchItem", "Search my item, UPC or code")} />
      </span>
      <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" disabled={busy || !pick} onClick={() => void go(pick)}>{tr("perfume.analysis.confirm", "Confirm")}</Button>
      {mode === "item" ? (
        <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" disabled={busy} onClick={() => void go(null, true)}>{tr("perfume.analysis.newItem", "New item")}</Button>
      ) : null}
    </span>
  );
}

const LOW_PAIR = new Set(["a:offer", "a:esp", "a:offer2", "a:esp2"]);
const GENDER_WORD: Record<string, string> = { W: "Women", M: "Men", U: "Unisex", "—": "Not stated" };

/** "Match my list ↔ competitor" (owner 2026-11-14 15:10: "in match my list competitor it is practically the same
 *  thing"): the List-analysis lines in the matching format only — the line, what the engine assigned, the
 *  suggestion in the same format with the confirm / search box, and what it is matched to now. */
const MATCH_DESK = /^a:(upc|sku|line_desc|as_.*|match|cand|sg_.*|m_.*|c_vendor|offer|esp)$/;

function GridPanel({ view, mine, matchDesk = false }: { view: PerfumeGridView; mine: MineChoice; matchDesk?: boolean }) {
  const { pushToast } = useToast();
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "brand", dir: "asc" });
  const [q, setQ] = useState("");
  const [picks, setPicks] = useState<Record<PerfumeFacetKey, string[]>>(NO_PICKS);
  const [page, setPage] = useState(1);
  // The desk-wide "Show" selector changed: back to page 1.
  const [mineSeen, setMineSeen] = useState(mine);
  if (mineSeen !== mine) { setMineSeen(mine); setPage(1); }
  const [pageSize, setPageSize] = useState(PAGE);
  // Owner 2026-11-14: "i need filter so i can select only the items from the competitions list" — on by default on
  // Competition (their margin means nothing for items they do not carry); one click on every other tab.
  const [carried, setCarried] = useState(view === "comp");
  // List analysis (owner 2026-11-14): whose list — mine (every line of my list) or theirs (every competitor line) — and
  // a side filter: all, matched (in common), not matched. Plus one button to hide the columns no upload fills yet.
  const [base, setBase] = useState<"mine" | "theirs">("mine");
  const [match, setMatch] = useState<"all" | "matched" | "unmatched">(matchDesk ? "unmatched" : "all");
  const [hideEmpty, setHideEmpty] = useState(true);
  const [viewSeen, setViewSeen] = useState(view);
  if (viewSeen !== view) { setViewSeen(view); setCarried(view === "comp"); setPage(1); }
  // The margin the owner wants to see prices at — typed here, applied on Enter or leaving the box.
  const [target, setTarget] = useState<number | null>(null);
  const [targetDraft, setTargetDraft] = useState("");
  // Trading: the % the owner believes his suppliers earn — their price less this is what he can offer them.
  const [earn, setEarn] = useState<number | null>(null);
  const [earnDraft, setEarnDraft] = useState("");
  const applyEarn = () => {
    const t = earnDraft.trim() === "" ? null : Number(earnDraft);
    if (t != null && !(Number.isFinite(t) && t >= 0 && t <= 95)) { pushToast(tr("perfume.desk.earn.bad", "Earn % must be between 0 and 95%."), "error"); return; }
    if (t !== earn) { setEarn(t); setPage(1); }
  };
  const applyTarget = () => {
    const t = targetDraft.trim() === "" ? null : Number(targetDraft);
    if (t != null && !(Number.isFinite(t) && t >= 0 && t <= 95)) { pushToast(tr("perfume.desk.target.bad", "Margin must be between 0 and 95%."), "error"); return; }
    if (t !== target) { setTarget(t); setPage(1); }
  };
  const query = useQuery({
    queryKey: ["perfume", "grid", view, sort.key, sort.dir, q, picks, target, earn, page, pageSize, mine, carried, base, match],
    queryFn: () => getPerfumeGrid({ view, sort: sort.key, dir: sort.dir, q, ...picks, target_pct: target, earn_pct: earn, mine, carried, base, match, offset: (page - 1) * pageSize, limit: pageSize }),
    placeholderData: (prev) => prev,
  });
  // Competition: my columns, then the competitor's, then every supplier's list price (owner 2026-11-14: "the vendors
  // prices should be after all the esperanza data margins etc."). Other tabs keep the server's order.
  const cols = useMemo(() => {
    const all = query.data?.cols ?? [];
    if (view !== "comp") return all;
    const rank = (k: string) => (k.startsWith("v:") ? 2 : k.startsWith("t:") || k.startsWith("a:") ? 3 : 1);
    return all.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c.key) - rank(b.c.key) || a.i - b.i).map((x) => x.c);
  }, [query.data?.cols, view]);
  // Owner 2026-11-12: "so I don't confuse between vendors have a line noting difference." A heavy left rule on the
  // first shown column of every group (Mine, each supplier, each competitor) — header and every row.
  const groupStart = useMemo(() => {
    const seen = new Set<string>();
    const starts = new Set<string>();
    for (const c of cols) {
      if (seen.has(c.group) || !defaultVisible(view, c.key, mine)) continue;
      seen.add(c.group);
      if (c.group !== "Item") starts.add(c.key);
    }
    return starts;
  }, [cols, view, mine]);
  const columns: Array<ParityColumn<PerfumeGridRow>> = useMemo(
    () => cols.map((c) => ({
      key: c.key,
      label: c.label,
      sortable: true,
      defaultHidden: matchDesk ? !MATCH_DESK.test(c.key) : !defaultVisible(view, c.key, mine) || (view === "analysis" && hideEmpty && ANALYSIS_EMPTY.has(c.key)),
      kind: c.kind === "money" || c.kind === "pct" || c.kind === "int" ? ("number" as const) : undefined,
      cellClass: [c.kind === "text" ? "" : "text-right tabular-nums", groupStart.has(c.key) ? "border-l-2 border-l-slate-500" : ""].filter(Boolean).join(" ") || undefined,
      className: groupStart.has(c.key) ? "border-l-2 border-l-slate-500" : undefined,
      sortValue: (r: PerfumeGridRow) => r[c.key] ?? null,
      ...(c.key === "a:cand" ? { minWidth: 600 } : {}),
      exportValue: (r: PerfumeGridRow) => (Array.isArray(r[c.key]) ? (r[c.key] as unknown as Array<{ label: string }>).map((x) => x.label).join("; ") : r[c.key] ?? null),
      render: (r: PerfumeGridRow) => {
        const v = r[c.key];
        // List analysis (owner 2026-11-14): the lower of my offer and their price gets its own shade, that box only;
        // "more expensive by" is negative and red.
        if (c.kind === "money" && LOW_PAIR.has(c.key) && v != null && r["a:offer"] != null && r["a:esp"] != null && Number(v) === Math.min(Number(r["a:offer"]), Number(r["a:esp"]))) {
          return <span data-testid="perfume-analysis-lowest" className="-mx-1 block rounded-sm bg-[#DCEFE3] px-1 font-semibold text-[#14532D]">{money(v)}</span>;
        }
        if (c.key === "a:over_by" && v != null && Number(v) < 0) return <span className="font-semibold text-red-700">{money(v)}</span>;
        if (c.kind === "money") return money(v);
        if (c.kind === "pct") return <span className={v == null ? "" : Number(v) < 0 ? "text-red-700" : Number(v) >= 20 ? "text-slate-700 font-semibold" : ""}>{pct(v)}</span>;
        if (c.key === "a:cand") return <MatchCell row={r} />;
        if (c.key === "a:match") return <span className={r.matched === 1 ? "text-[#1F8A4C] font-semibold" : "text-[#C76A0A] font-semibold"}>{String(v ?? "—")}</span>;
        if (c.key === "best_vendor" && r.tied) return <span title={tr("perfume.desk.5", "Tied lowest price")} className="rounded-sm bg-slate-100 px-1">{String(v)}</span>;
        if (c.key === "upc" && Number(r.upc_count) > 1) return <span title={String(r.upcs ?? "")}>{String(v)} <span className="text-gray-500">+{Number(r.upc_count) - 1}</span></span>;
        return v == null || v === "" ? "—" : String(v);
      },
    })),
    [cols, view, mine, groupStart, hideEmpty, matchDesk],
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
      {/* The table mounts only once the server has sent this view's columns: ParityTable reads the default
          hidden set at mount, so mounting with no columns showed EVERY column (owner 2026-11-12: Trading still
          showed every supplier's purchase columns). Keyed by view so each tab starts from its own defaults. */}
      <div className={view === "analysis" ? "grid grid-cols-[150px_minmax(0,1fr)] items-start gap-2" : ""}>
      {view === "analysis" ? (
        <aside className="space-y-3 rounded-sm border border-gray-200 bg-white p-2 text-xs" aria-label={tr("perfume.analysis.side", "Analysis filters")} data-testid="perfume-analysis-side">
          <fieldset className="space-y-1">
            <legend className="font-semibold text-[#1F2A44]">{tr("perfume.analysis.base", "Show list")}</legend>
            {([["mine", "My list"], ["theirs", "Their list"]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-1"><input type="radio" name="perfume-analysis-base" checked={base === k} onChange={() => { setBase(k); setPage(1); }} data-testid={`perfume-analysis-base-${k}`} />{tr(`perfume.analysis.base.${k}`, l)}</label>
            ))}
          </fieldset>
          <fieldset className="space-y-1">
            <legend className="font-semibold text-[#1F2A44]">{tr("perfume.analysis.match", "Rows")}</legend>
            {([["all", "All"], ["matched", "Matched (in common)"], ["unmatched", "Not matched"]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-1"><input type="radio" name="perfume-analysis-match" checked={match === k} onChange={() => { setMatch(k); setPage(1); }} data-testid={`perfume-analysis-match-${k}`} />{tr(`perfume.analysis.match.${k}`, l)}</label>
            ))}
          </fieldset>
          <button type="button" onClick={() => setHideEmpty(!hideEmpty)} aria-pressed={!hideEmpty} data-testid="perfume-analysis-empty-toggle"
            className="h-[30px] w-full rounded-sm border border-gray-300 bg-[var(--surface-unselected)] px-2 text-left font-semibold text-gray-700 hover:bg-[var(--surface-hover)]">
            {hideEmpty ? tr("perfume.analysis.showEmpty", "Show purchase / cost columns") : tr("perfume.analysis.hideEmpty", "Hide purchase / cost columns")}
          </button>
        </aside>
      ) : null}
      <div className="min-w-0">
      {cols.length === 0 ? (
        <div className="text-xs text-gray-500" data-testid="perfume-grid-loading">{query.isError ? "Couldn't load the grid" : "Loading…"}</div>
      ) : (
      <ParityTable<PerfumeGridRow>
        key={`${matchDesk ? "match-" : ""}${view}-${mine ?? "all"}-${view === "analysis" ? (hideEmpty ? "h" : "a") : ""}`}
        columns={columns}
        rows={query.data?.rows ?? []}
        rowKey={(r) => String(r.id)}
        loading={query.isLoading}
        wrapHeaders
        storageKey={`perfume-desk-${matchDesk ? "match-" : ""}${view}${mine ? "-mine" : ""}${view === "analysis" ? (hideEmpty ? "-h" : "-a") : ""}-v8`}
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
            <label className="flex items-center gap-1 text-xs text-gray-700" data-testid="perfume-carried">
              <input type="checkbox" checked={carried} onChange={(e) => { setCarried(e.target.checked); setPage(1); }} />
              {tr("perfume.desk.carried", "Only items on the competitor's list")}
            </label>
            {view === "trade" ? (
              <label className="flex items-center gap-1 text-xs text-gray-700">
                {tr("perfume.desk.earn.label", "Their earn %")}
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="95"
                  inputMode="decimal"
                  data-testid="perfume-earn-pct"
                  value={earnDraft}
                  placeholder={query.data?.earn_pct != null ? String(query.data.earn_pct) : ""}
                  onChange={(e) => setEarnDraft(e.target.value)}
                  onBlur={applyEarn}
                  onKeyDown={(e) => { if (e.key === "Enter") applyEarn(); }}
                  aria-label={tr("perfume.desk.earn.aria", "Percent your suppliers earn, for the Trading offer")}
                  className="h-[34px] w-[80px] rounded-sm border border-gray-300 px-2 text-xs tabular-nums"
                />
              </label>
            ) : null}
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
                downloadPerfumeExcel({ view, sort: sort.key, dir: sort.dir, q, ...picks, target_pct: target, earn_pct: earn, mine, carried, base, match }, visible).catch((e) => pushToast(String(e?.message ?? e), "error"));
              }}
            >
              {tr("perfume.desk.8", "Export to Excel")}
            </Button>
          </div>
        }
      />
      )}
      </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
        <span>{total.toLocaleString()} {view === "analysis" ? tr("perfume.desk.9b", "lines · page") : tr("perfume.desk.9", "items · page")} {page} {tr("perfume.desk.10", "of")} {pages}{query.data ? ` · measured ${new Date(query.data.measured_at).toLocaleTimeString()}` : ""}</span>
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

/* ---------------- match clean-up ---------------- */

/** Owner 2026-11-12 ("perfumes completely done"): one click merges brands spelled two ways, then re-runs Review. */
function MatchCleanup() {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      const c = await canonicalizePerfumeBrands();
      const r = await rematchPerfumeReview();
      const parts = Object.entries(r).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(" · ");
      setResult(`${c.checked.toLocaleString()} items checked · ${c.renamed} renamed · ${c.merged} merged · ${Object.keys(c.brands).length} brand spellings · Review: ${parts}`);
      await qc.invalidateQueries({ queryKey: ["perfume"] });
      pushToast("Brands cleaned and Review re-run", "success");
    } catch (e) { pushToast(userFacingApiError(e, "Clean-up did not run"), "error"); }
    finally { setBusy(false); }
  };
  return (
    <div data-testid="perfume-match-cleanup">
      <div className="text-section-header">{tr("perfume.desk.38", "Match clean-up")}</div>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
        <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy} onClick={() => void run()}>{busy ? tr("perfume.desk.40", "Running…") : tr("perfume.desk.39", "Merge brand spellings + re-run Review")}</Button>
        <span className="text-gray-600">{result ?? tr("perfume.desk.41", "One spelling per brand (CALVIN → CALVIN KLEIN, NARCISO R → NARCISO RODRIGUEZ …); the same bottle under two spellings becomes one item. Safe to run again.")}</span>
      </div>
    </div>
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
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">{tr("perfume.desk.27", "My suppliers earn")} {percent("vendor_earn_pct")}{tr("perfume.desk.29", "% on their price — the Trading tab offers them their price less this (change it there for one look, or here to keep it)")}</div>
      </div>
      <div>
        <div className="text-section-header">{tr("perfume.desk.34", "Competition margin — cushion by list price")}</div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs" data-testid="perfume-comp-tiers">
          {(r.competitor_cushion_tiers ?? []).map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1">{t.over_cents === 0 ? tr("perfume.desk.35", "Any price") : `${tr("perfume.desk.36", "Over")} ${money(t.over_cents)}`}:
              <MoneyInput className="w-[96px]" ariaLabel={`cushion tier ${i + 1}`} valueCents={t.cushion_cents}
                onChangeCents={(c) => setDraft({ ...draft, competitor_cushion_tiers: (r.competitor_cushion_tiers ?? []).map((x, j) => (j === i ? { ...x, cushion_cents: c ?? 0 } : x)) })} />
            </span>
          ))}
          <span className="text-gray-600">{tr("perfume.desk.37", "— the Competition tab takes the cheapest supplier's list price less this as each competitor's cost")}</span>
        </div>
      </div>
      <MatchCleanup />
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
