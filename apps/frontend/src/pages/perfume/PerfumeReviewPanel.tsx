/** PERFUME-DESK — lines that did not link on their own. The owner confirms once; the desk remembers it. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Combobox } from "../../components/Combobox";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { ParityTable } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { bulkPerfumeReview, confirmPerfumeRow, getPerfumeReview, type PerfumeBulkAction, listPerfumeLists, searchPerfumeItems, type PerfumeReviewRow, type PerfumeReviewFacet, type PerfumeSuggestBucket } from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { itemSaysMore } from "./perfumeMatchText";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityLink } from "../../components/shared/EntityLink";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type LineFilterKey = "gender" | "kind" | "conc" | "category" | "brand";
type LineFilters = Record<LineFilterKey, string[]>;
const NO_LINE_FILTERS: LineFilters = { gender: [], kind: [], conc: [], category: [], brand: [] };
const GENDER_NAMES: Record<string, string> = { M: "Men", W: "Women", U: "Unisex", none: "Gender not stated" };
const KIND_NAMES: Record<string, string> = { NONE: "Regular bottle", TESTER: "Tester", SET: "Set / gift", MINI: "Mini", REFILL: "Refill", BODY: "Body / cosmetics", VARIOUS: "Various" };
/** Built at render so the labels follow the desk language. */
const SUGGEST_CHOICES: Array<{ value: PerfumeSuggestBucket; key: string; label: string }> = [
  { value: "any", key: "perfume.review.suggestAny", label: "Has a suggestion" },
  { value: "95", key: "perfume.review.suggest95", label: "Best 95% alike and up" },
  { value: "90", key: "perfume.review.suggest90", label: "Best 90% alike and up" },
  { value: "80", key: "perfume.review.suggest80", label: "Best 80% alike and up" },
  { value: "70", key: "perfume.review.suggest70", label: "Best 70% alike and up" },
  { value: "none", key: "perfume.review.suggestNone", label: "No suggestion" },
];

const lineFilterDefs = (): Array<{ key: LineFilterKey; label: string; allLabel: string; name: (v: string) => string }> => [
  { key: "gender", label: tr("perfume.review.f.gender", "Gender"), allLabel: tr("perfume.review.f.genderAll", "Men · Women · Unisex"), name: (v) => GENDER_NAMES[v] ?? v },
  { key: "kind", label: tr("perfume.review.f.kind", "Set / tester"), allLabel: tr("perfume.review.f.kindAll", "Every kind"), name: (v) => KIND_NAMES[v] ?? v.charAt(0) + v.slice(1).toLowerCase() },
  { key: "conc", label: tr("perfume.review.f.conc", "Type"), allLabel: tr("perfume.review.f.concAll", "Every type"), name: (v) => (v === "none" ? "Type not stated" : v) },
  { key: "category", label: tr("perfume.review.f.category", "Category"), allLabel: tr("perfume.review.f.categoryAll", "Every category"), name: (v) => v },
  { key: "brand", label: tr("perfume.review.f.brand", "Brand"), allLabel: tr("perfume.review.f.brandAll", "Every brand"), name: (v) => (v === "none" ? "Brand not read" : v) },
];
/** The choices are the values found on the waiting lines, each with how many lines it shows; a picked choice stays listed. */
function facetOptions(found: PerfumeReviewFacet[] | undefined, picked: string[], name: (v: string) => string) {
  const list = [...(found ?? [])];
  for (const v of picked) if (!list.some((f) => f.value === v)) list.push({ value: v, count: 0 });
  return list.map((f) => ({ value: f.value, label: `${name(f.value)} (${f.count.toLocaleString()})` }));
}

export function PerfumeReviewPanel({ mine = null }: { mine?: "offer" | null } = {}) {
  const [page, setPage] = useState(1);
  // Owner 2026-11-12: "where do I review the Esperanza items?" — review one vendor's list at a time.
  const [listIds, setListIds] = useState<string[]>([]);
  const lists = useQuery({ queryKey: ["perfume", "lists"], queryFn: listPerfumeLists });
  const listOptions = (lists.data?.lists ?? []).filter((l) => l.is_current)
    .map((l) => ({ value: l.id, label: `${l.vendor_name} · ${String(l.list_date).slice(0, 10)}`, sublabel: l.file_name }));
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  // Owner 2026-11-15 19:24 CT: "the selector or filter for only those that have suggestions … 70 and up". Reads each line's
  // OWN suggestions (best % alike), on the server, so the count and the pages are exact.
  const [suggest, setSuggest] = useState<PerfumeSuggestBucket | null>(null);
  const [PAGE, setPageSize] = useState(100);
  // Owner 2026-11-15: "i need to filter by men or women, or by gender or by type, or set or tester or those with
  // suggestions". Each filter is the engine's reading of the vendor line; the server applies them and pages after.
  const [lf, setLf] = useState<LineFilters>(NO_LINE_FILTERS);
  const reset = () => { setPage(1); setSelected([]); };
  // Owner 2026-11-13: "just show all the items from my list and i'll confirm each. in review but only for my list."
  const [mineSeen, setMineSeen] = useState(mine);
  if (mineSeen !== mine) { setMineSeen(mine); setPage(1); setSelected([]); }
  const q = useQuery({ queryKey: ["perfume", "review", page, listIds, text, suggest, PAGE, mine, lf],
    queryFn: () => getPerfumeReview((page - 1) * PAGE, PAGE, { listIds, q: text, suggest, mine, ...lf }), placeholderData: (p) => p });
  const facets = q.data?.facets;
  const lineFilterCount = Object.values(lf).filter((v) => v.length).length + (suggest ? 1 : 0);
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  // Owner 2026-11-12: "in all the tabs differentiate between vendors the lines" — a heavy rule above the first
  // line of each vendor on the page.
  const vendorStarts = new Set<string>();
  (q.data?.rows ?? []).forEach((r, i, all) => { if (i > 0 && all[i - 1].vendor_name !== r.vendor_name) vendorStarts.add(r.id); });
  if (q.isError) {
    return <ListErrorState title={tr("perfume.review.loadError", "Couldn't load the review lines")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />;
  }
  return (
    <section className="space-y-2" aria-label={tr("perfume.review.1", "Review")}>
      <div className="flex flex-wrap items-end gap-2">
        <MultiSelectDropdown
          label={tr("perfume.review.listFilter", "Vendor list")}
          allLabel={tr("perfume.review.allLists", "All vendors")}
          data-testid="perfume-review-list-filter"
          options={listOptions.map((o) => ({ value: o.value, label: o.label }))}
          selected={listIds}
          onChange={(next) => { setListIds(next); reset(); }}
        />
        <label className="w-[260px] max-w-full text-xs text-gray-700">
          {tr("perfume.review.searchLabel", "Words in their line, UPC or code")}
          <input type="search" className="mt-0.5 h-[34px] w-full rounded border border-gray-300 px-2 text-xs" value={text}
            data-testid="perfume-review-search" placeholder={tr("perfume.review.searchPh", "e.g. ARMAF CLUB")}
            onChange={(e) => { setText(e.target.value); reset(); }} />
        </label>
        <label className="w-[230px] max-w-full text-xs text-gray-700">
          {tr("perfume.review.suggestLabel", "Suggestions")}
          <Combobox ariaLabel={tr("perfume.review.suggestLabel", "Suggestions")} allowClear value={suggest} placeholder={tr("perfume.review.statusAll", "All lines")}
            dataTestId="perfume-review-filter-suggest"
            onChange={(v) => { setSuggest((v as PerfumeSuggestBucket | null) || null); reset(); }}
            options={SUGGEST_CHOICES.map((c) => {
              const n = facets?.suggest?.find((f) => f.value === c.value)?.count;
              return { value: c.value, label: `${tr(c.key, c.label)}${n != null ? ` (${n.toLocaleString()})` : ""}` };
            })} />
        </label>
        {lineFilterDefs().map((f) => (
          <MultiSelectDropdown
            key={f.key}
            label={f.label}
            allLabel={f.allLabel}
            data-testid={`perfume-review-filter-${f.key}`}
            options={facetOptions(facets?.[f.key], lf[f.key], f.name)}
            selected={lf[f.key]}
            onChange={(next) => { setLf((p) => ({ ...p, [f.key]: next })); reset(); }}
          />
        ))}
        {lineFilterCount > 0 ? (
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" data-testid="perfume-review-clear-filters"
            onClick={() => { setLf(NO_LINE_FILTERS); setSuggest(null); reset(); }}>
            {tr("perfume.review.clearFilters", "Clear filters")} ({lineFilterCount})
          </Button>
        ) : null}
        <label className="w-[120px] text-xs text-gray-700">
          {tr("perfume.review.perPage", "Rows per page")}
          <Combobox ariaLabel={tr("perfume.review.perPage", "Rows per page")} value={String(PAGE)}
            onChange={(v) => { setPageSize(Number(v) || 100); reset(); }}
            options={["100", "300", "500"].map((x) => ({ value: x, label: x }))} />
        </label>
      </div>
      <BulkBar selected={selected} onDone={() => setSelected([])} rows={q.data?.rows ?? []} onSelect={setSelected} />
      <div className="text-xs text-gray-600">
        {mine ? <strong className="mr-1 text-[#1F2A44]">{tr("perfume.review.mine", "Only lines that can be an item on my offer list, grouped by my item.")}</strong> : null}
        {total.toLocaleString()} {tr("perfume.review.2", "lines need you. A line links to an item only when you confirm it — then every future list from that vendor with the same spelling or SKU links by itself. Nothing here counts in any price until confirmed.")}
      </div>
      {/* TABLE_DATE_OMIT: review queue is unresolved import lines waiting for owner confirm — no per-row event date. */}
      <ParityTable<PerfumeReviewRow>
        rows={q.data?.rows ?? []}
        rowKey={(r) => r.id}
        rowClassName={(r) => (vendorStarts.has(r.id) ? "border-t-2 border-t-slate-500" : "")}
        loading={q.isLoading}
        key={mine ?? "all"}
        storageKey={mine ? "perfume-desk-review-mine-v1" : "perfume-desk-review-v3"}
          exportFilename="TIO review"
          exportExcel
        selectable
        selectedKeys={selected}
        onSelectionChange={setSelected}
        hidePager
        page={1}
        pageSize={Math.max(1, q.data?.rows?.length ?? PAGE)}
        emptyText="Nothing to review."
        columns={[
          // Owner 2026-11-14: "why is my item twice? … if it's the same data then only one." One column: my own wording;
          // the item it is filed under shows under it only when it says something my wording does not (that is how
          // "AZZ WTD EDT SP100ML REFILL" filed as "AZZARO · WANTED · 100 ml · EDT" stands out).
          ...(mine ? [{ key: "for_my_desc", label: "My item", sortable: true, allowWrap: true, minWidth: 260,
            render: (r: PerfumeReviewRow) => {
              const differs = r.for_my_item && r.for_my_desc ? itemSaysMore(r.for_my_desc, r.for_my_item) : null;
              return (
                <span className="block">
                  <strong>{r.for_my_desc ?? r.for_my_item ?? "—"}</strong>
                  {differs ? <span className="block text-xs text-[#9A3412]" data-testid="perfume-review-filed-as">{tr("perfume.review.filedAs", "filed as")}: {r.for_my_item} — {tr("perfume.review.differs", "differs")}: {differs}</span> : null}
                </span>
              );
            } }] : []),
          { key: "vendor_name", label: "Vendor", sortable: true, render: (r) => <EntityLink kind="perfume_vendor" id={r.vendor_id} label={r.vendor_name} data-testid="perfume-review-vendor-link" /> },
          // Owner 2026-11-27 06:47 CT "Find a solution you do it" + 2026-10-25 "columns can be added or removed in the gear filter":
          // every column shows by default (additive-only law); hide any of them in the gear menu.
          { key: "row_no", label: "Row", sortable: true, kind: "number" },
          { key: "upc", label: "UPC", sortable: true },
          { key: "sku", label: "Vendor code", sortable: true },
          { key: "brand_name", label: "Brand", sortable: true, render: (r) => r.brand_name ?? "—" },
          { key: "model", label: "Model", sortable: true, allowWrap: true, minWidth: 180, render: (r) => r.model ?? "—" },
          { key: "size_ml", label: "Size ml", sortable: true, kind: "number", render: (r) => (r.size_ml == null ? "—" : String(r.size_ml)) },
          { key: "conc", label: "Type", sortable: true, render: (r) => r.conc || "—" },
          { key: "gender", label: "Gender", sortable: true, render: (r) => r.gender || "—" },
          { key: "category", label: "Category", sortable: true, render: (r) => r.category || "—" },
          { key: "flags", label: "Tester / set", sortable: true, render: (r) => r.flags || "—" },
          { key: "country", label: "Country", sortable: true, render: (r) => r.country ?? "—" },
          { key: "case_pack", label: "Case pack", sortable: true, kind: "number", render: (r) => (r.case_pack == null ? "—" : String(r.case_pack)) },
          { key: "description", label: "Their line", sortable: true, allowWrap: true, minWidth: 220 },
          { key: "price_cents", label: "Price", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.price_cents) },
          // Owner 2026-11-12: "the percentage in likeness should be in its own column."
          { key: "suggestions", label: "Best suggestion", allowWrap: true, minWidth: 260, sortValue: (r) => r.suggestions[0]?.display_name ?? "",
            render: (r) => (r.suggestions[0] ? r.suggestions[0].display_name : <span className="text-gray-500">{tr("perfume.review.4", "No close item")}</span>) },
          { key: "alike", label: "% alike", kind: "number", sortable: true, sortValue: (r) => r.suggestions[0]?.score ?? 0, cellClass: "text-right tabular-nums",
            render: (r) => (r.suggestions[0] ? `${Math.round(r.suggestions[0].score * 100)}%` : "—") },
          { key: "differs", label: "Differs by", allowWrap: true, minWidth: 160, render: (r) => r.suggestions[0]?.why || "—" },
        ]}
        rowActions={(r) => <ConfirmControls row={r} />}
        rowActionsWidth={420}
      />
      <div className="flex items-center justify-end gap-1 text-xs text-gray-600">
        <span className="mr-2">{tr("perfume.review.5", "page")} {page} {tr("perfume.review.6", "of")} {pages}</span>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={page <= 1} onClick={() => { setPage(page - 1); setSelected([]); }}>{tr("perfume.review.7", "Previous")}</Button>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={page >= pages} onClick={() => { setPage(page + 1); setSelected([]); }}>{tr("perfume.review.8", "Next")}</Button>
      </div>
    </section>
  );
}

/** Owner 2026-11-12: "we need to have multiple selector to change gender or assign …" — one action over the ticked lines. */
/** Owner 2026-11-12: "select multiple items so we can choose 100–200 at a time and click confirm or use suggestion at
 * once, because one by one takes very long." Picking is one click (whole page, or every line at/above a likeness). */
/**
 * Owner 2026-11-15 16:44 CT: "make it faster, when i click on a suggestion or i select multiple and confirm … it takes a
 * very long time." Measured live 22:33Z: the confirm itself answers in 57 ms; the click then WAITED for every perfume
 * view to reload (Review 5.7 s). Now the lines the owner just settled leave the list at once and the toast shows at
 * once; the views reload in the background (the server stays the authority — the reload replaces this at once).
 */
function dropReviewLines(qc: ReturnType<typeof useQueryClient>, ids: string[]) {
  const gone = new Set(ids);
  qc.setQueriesData<{ rows: PerfumeReviewRow[]; total: number } | undefined>({ queryKey: ["perfume", "review"] }, (d) => {
    if (!d || !Array.isArray(d.rows)) return d;
    const rows = d.rows.filter((r) => !gone.has(r.id));
    return { ...d, rows, total: Math.max(0, d.total - (d.rows.length - rows.length)) };
  });
  void qc.invalidateQueries({ queryKey: ["perfume"] });
}

function BulkBar({ selected, onDone, rows, onSelect }: { selected: string[]; onDone: () => void; rows: PerfumeReviewRow[]; onSelect: (ids: string[]) => void }) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [item, setItem] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Every ticked line one gender (Men or Women): the search offers only that gender's bottles (and unisex).
  const gs = new Set(rows.filter((r) => selected.includes(r.id)).map((r) => r.gender || ""));
  const selG = gs.size === 1 && (gs.has("M") || gs.has("W")) ? [...gs][0] : null;
  const hits = useQuery({ queryKey: ["perfume", "items", search, selG], queryFn: () => searchPerfumeItems(search, selG), enabled: search.trim().length >= 2 });
  const options = (hits.data?.items ?? []).map((h) => ({ value: h.id, label: h.display_name, sublabel: h.upcs?.join(" ") ?? "" }));
  const n = selected.length;
  const run = async (b: PerfumeBulkAction, what: string) => {
    setBusy(true);
    try {
      const r = await bulkPerfumeReview(b);
      // A gender change keeps the lines in Review (they re-read); every other action settles them.
      if (b.action === "set_gender") void qc.invalidateQueries({ queryKey: ["perfume"] });
      else dropReviewLines(qc, b.row_ids.filter((id) => !r.skipped.some((x) => x.row_id === id)));
      const parts = [`${what}: ${r.rows} line${r.rows === 1 ? "" : "s"}`];
      if (r.linked) parts.push(`${r.linked} linked`);
      if (r.now_matched) parts.push(`${r.now_matched} now matched by the engine`);
      if (r.items_created) parts.push(`${r.items_created} new items`);
      if (r.skipped.length) parts.push(`${r.skipped.length} skipped (${[...new Set(r.skipped.map((x) => x.reason))].join(", ")})`);
      pushToast(parts.join(" · "), "success");
      onDone();
    } catch (e) { pushToast(userFacingApiError(e, `${what} failed`), "error"); } finally { setBusy(false); }
  };
  const withSuggestion = rows.filter((r) => r.suggestions[0]);
  const atLeast = (pct: number) => withSuggestion.filter((r) => r.suggestions[0].score * 100 >= pct).map((r) => r.id);
  const pick = (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="perfume-review-bulk-pick">
      <span className="text-gray-600">{tr("perfume.review.pick", "Select:")}</span>
      <Button type="button" variant="secondary" className="h-[30px] px-2 text-xs" disabled={!rows.length} onClick={() => onSelect(rows.map((r) => r.id))}>
        {tr("perfume.review.pickPage", "All on this page")} ({rows.length})
      </Button>
      {[95, 90, 80, 70].map((pct) => (
        <Button key={pct} type="button" variant="secondary" className="h-[30px] px-2 text-xs" disabled={!atLeast(pct).length} onClick={() => onSelect(atLeast(pct))}>
          ≥ {pct}% {tr("perfume.review.pickAlike", "alike")} ({atLeast(pct).length})
        </Button>
      ))}
      <span className="text-gray-500">{tr("perfume.review.pickHint", "Sort by % alike and show 300–500 rows per page to work a whole list at once.")}</span>
    </div>
  );
  if (!n) return <div className="space-y-1">{pick}<div className="text-xs text-gray-500">{tr("perfume.review.bulkHint", "Tick lines (or use Select) to change their gender, use the suggestion, link them to one item, or create them as new items — all at once.")}</div></div>;
  return (
    <div className="space-y-1">
    {pick}
    <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-gray-50 p-2 text-xs" data-testid="perfume-review-bulk-bar">
      <span className="font-semibold">{n} {tr("perfume.review.bulkSelected", "selected")}</span>
      <span className="text-gray-500">{tr("perfume.review.bulkGender", "Gender:")}</span>
      {(["W", "M", "U"] as const).map((g) => (
        <Button key={g} type="button" variant="secondary" className="h-[30px] px-2 text-xs" disabled={busy}
          onClick={() => void run({ action: "set_gender", row_ids: selected, gender: g }, g === "W" ? "Women" : g === "M" ? "Men" : "Unisex")}>
          {g === "W" ? tr("perfume.review.women", "Women") : g === "M" ? tr("perfume.review.men", "Men") : tr("perfume.review.unisex", "Unisex")}
        </Button>
      ))}
      <Button type="button" className="h-[30px] px-2 text-xs" disabled={busy} onClick={() => void run({ action: "confirm_best", row_ids: selected }, "Confirmed best suggestion")}>
        ✓ {tr("perfume.review.bulkConfirm", "Use suggestion for all selected")} ({n})
      </Button>
      <span className="w-[240px]">
        <Combobox ariaLabel="Link selected to item" size="sm" allowClear clearCommittedOnEdit value={item} onChange={setItem} onSearch={setSearch} options={options} placeholder={tr("perfume.review.bulkSearch", "Search one item for all")} />
      </span>
      <Button type="button" variant="secondary" className="h-[30px] px-2 text-xs" disabled={busy || !item}
        onClick={() => item && void run({ action: "link_item", row_ids: selected, item_id: item }, "Linked to item")}>
        {tr("perfume.review.bulkLink", "Link all to this item")}
      </Button>
      <Button type="button" variant="secondary" className="h-[30px] px-2 text-xs" disabled={busy} onClick={() => void run({ action: "create_new", row_ids: selected }, "New items")}>
        {tr("perfume.review.bulkNew", "Create as new items")}
      </Button>
      <Button type="button" variant="secondary" className="h-[30px] px-2 text-xs" disabled={busy} onClick={onDone}>{tr("perfume.review.bulkClear", "Clear")}</Button>
    </div>
    </div>
  );
}

function ConfirmControls({ row }: { row: PerfumeReviewRow }) {
  // Owner 2026-11-12: "if I want to select the recommendation it does not let me confirm, I must type in the box
  // again … I selected an item and then I want to delete and it won't let me … make this child easy."
  // The best suggestion is one click; the box starts on it, can be cleared, and searches any words in any order.
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const best = row.suggestions[0] ?? null;
  const [pick, setPick] = useState<string | null>(best?.item_id ?? null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  // The line's gender: the search never offers the other gender's bottles (owner 2026-11-14 17:22).
  const g = row.gender === "M" || row.gender === "W" ? row.gender : null;
  const hits = useQuery({ queryKey: ["perfume", "items", search, g], queryFn: () => searchPerfumeItems(search, g), enabled: search.trim().length >= 2 });
  const options = [
    ...row.suggestions.map((s) => ({ value: s.item_id, label: s.display_name, sublabel: [`${Math.round(s.score * 100)}% alike`, s.why].filter(Boolean).join(" · ") })),
    ...(hits.data?.items ?? []).filter((h) => !row.suggestions.some((s) => s.item_id === h.id)).map((h) => ({ value: h.id, label: h.display_name, sublabel: h.upcs?.join(" ") ?? "" })),
  ];
  const go = async (target: { item_id: string } | { create_new: true }) => {
    setBusy(true);
    try {
      const r = await confirmPerfumeRow(row.id, target);
      dropReviewLines(qc, [row.id]);
      pushToast(`Linked ${r.rows_linked} line${r.rows_linked === 1 ? "" : "s"}`, "success");
    } catch (e) { pushToast(userFacingApiError(e, "Not linked"), "error"); } finally { setBusy(false); }
  };
  return (
    <span className="flex items-center gap-1">
      {best ? (
        <Button type="button" className="h-[34px] px-2 text-xs" disabled={busy} data-testid="perfume-review-use-suggestion"
          onClick={() => void go({ item_id: best.item_id })}>{tr("perfume.review.useSuggestion", "✓ Use suggestion")}</Button>
      ) : null}
      <span className="w-[240px]">
        <Combobox ariaLabel="Item" size="sm" value={pick} onChange={setPick} onSearch={setSearch} options={options}
          allowClear clearCommittedOnEdit placeholder={tr("perfume.review.9", "Or search another item")} />
      </span>
      <Button type="button" variant="secondary" className="h-[34px] px-2 text-xs" disabled={busy || !pick}
        onClick={() => pick && void go({ item_id: pick })}>{tr("perfume.review.10", "Confirm")}</Button>
      <Button type="button" variant="secondary" className="h-[34px] px-2 text-xs" disabled={busy} onClick={() => void go({ create_new: true })}>{tr("perfume.review.11", "New item")}</Button>
    </span>
  );
}
