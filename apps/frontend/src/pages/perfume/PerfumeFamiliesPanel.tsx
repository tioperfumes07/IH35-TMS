/**
 * PERFUME item families + replenishment — owner 2026-11-27 08:10 CT "We must also have locations, families … make this more efficient and
 * professional … all must be fully wired linked".
 *  - Families: one fragrance line, the parent over its sizes / testers / sets (NetSuite matrix parent). List with roll-ups (items, units
 *    on hand, stock value), a family page with every item (each opens its item profile), edit, archive, history. Items join a family
 *    from the item editor, the item creator or the bulk bar (FamilySelect).
 *  - Sites block on the item profile: on hand, bin, min, max and usual reorder quantity at every own site.
 *  - Reorder: every item at or below its min (counting open POs) with the quantity to buy and the cheapest supplier; checked rows become
 *    purchase orders through the PO engine.
 */
import { useEffect, useState, type ReactNode } from "react";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { DatePicker } from "../../components/forms/DatePicker";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  archivePerfumeFamily, createPerfumeFamily, getPerfumeFamily, getPerfumeItemSites, getPerfumeReorder, listPerfumeCatalogs, listPerfumeFamilies,
  makePerfumeReorderPos, setPerfumeItemReorder, updatePerfumeFamily, addPerfumeCatalogValue,
  type PerfumeFamilyInput, type PerfumeFamilyProfile, type PerfumeFamilyRow, type PerfumeItemSite, type PerfumeReorderRow,
} from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { ctl, DASH, DocLink, money, useOpenDoc } from "./perfumeDocParts";

const GENDER: Record<string, string> = { M: "Men", W: "Women", U: "Unisex" };
const NEW = "__new__";
const fail = (push: (m: string, k: "error") => void, what = "Not saved") => (e: unknown) => push(userFacingApiError(e, what), "error");

function useScentFamilies() {
  const q = useQuery({ queryKey: ["perfume", "catalogs"], queryFn: listPerfumeCatalogs, staleTime: 60_000 });
  return (q.data?.kinds.find((k) => k.kind === "olfactory_family")?.values ?? []).map((v) => v.value);
}

/* ------------------------------------------------------------------ family form (create + edit) */

function FamilyForm({ initial, onSaved, onCancel }: { initial?: PerfumeFamilyProfile["family"]; onSaved: (id: string) => void; onCancel?: () => void }) {
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const scents = useScentFamilies();
  const [v, setV] = useState({ name: initial?.name ?? "", brand: initial?.brand ?? "", olfactory_family: initial?.olfactory_family ?? "", gender: initial?.gender ?? "",
    launch_year: initial?.launch_year ? String(initial.launch_year) : "", notes: initial?.notes ?? "" });
  const [newScent, setNewScent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const body = (): PerfumeFamilyInput => ({ name: v.name.trim(), brand: v.brand.trim() || null, olfactory_family: v.olfactory_family || null, gender: v.gender || null,
    launch_year: v.launch_year ? Number(v.launch_year) : null, notes: v.notes.trim() || null });
  const save = async () => {
    if (!v.name.trim()) return;
    setBusy(true);
    try {
      if (initial) { await updatePerfumeFamily(initial.id, body()); onSaved(initial.id); pushToast("Family saved", "success"); }
      else { const r = await createPerfumeFamily(body()); onSaved(r.id); pushToast("Family created", "success"); }
      void qc.invalidateQueries({ queryKey: ["perfume", "families"] });
    } catch (e) { fail(pushToast)(e); } finally { setBusy(false); }
  };
  const addScent = async () => {
    const t = (newScent ?? "").trim(); if (!t) return;
    try { await addPerfumeCatalogValue({ kind: "olfactory_family", value: t }); } catch (e) { if (!/already/i.test(userFacingApiError(e, ""))) { fail(pushToast, "Not added")(e); return; } }
    await qc.invalidateQueries({ queryKey: ["perfume", "catalogs"] });
    setV({ ...v, olfactory_family: t }); setNewScent(null);
  };
  const row = (label: string, field: ReactNode) => (
    <div className="grid grid-cols-[150px_1fr] items-center gap-2 border-b border-[#EEF2F6] py-1"><span className="text-[#475569]">{label}</span><span>{field}</span></div>
  );
  return (
    <section className="max-w-[640px] rounded-[3px] border border-[#C6D1DC] bg-[#F8FAFC] p-3 text-xs" data-testid="perfume-family-form">
      <div className="mb-2 font-semibold text-[#1F2A44]">{initial ? tr("perfume.fam.edit", "Edit family") : tr("perfume.fam.new", "New family")}</div>
      {row(`${tr("perfume.fam.name", "Family name")} *`, <input className={`${ctl} w-full`} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} data-testid="perfume-family-name" />)}
      {row(tr("perfume.fam.brand", "Brand"), <input className={`${ctl} w-full`} value={v.brand} onChange={(e) => setV({ ...v, brand: e.target.value })} data-testid="perfume-family-brand" />)}
      {row(tr("perfume.fam.scent", "Scent family"), newScent != null ? (
        <span className="flex gap-1">
          <input autoFocus className={`${ctl} w-[180px]`} aria-label="New scent family" value={newScent} onChange={(e) => setNewScent(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addScent(); }} />
          <Button type="button" className="h-[30px] px-2 text-xs" disabled={!newScent.trim()} onClick={() => void addScent()}>{tr("perfume.cat.add", "Add")}</Button>
          <button type="button" className="underline" onClick={() => setNewScent(null)}>{tr("perfume.cat.cancel", "Cancel")}</button>
        </span>
      ) : (
        <select className={`${ctl} w-full`} value={v.olfactory_family} data-testid="perfume-family-scent"
          onChange={(e) => (e.target.value === NEW ? setNewScent("") : setV({ ...v, olfactory_family: e.target.value }))}>
          <option value="">{DASH}</option>
          {[...new Set([...scents, ...(v.olfactory_family ? [v.olfactory_family] : [])])].map((x) => <option key={x} value={x}>{x}</option>)}
          <option value={NEW}>{tr("perfume.cat.add_new", "+ Add new…")}</option>
        </select>
      ))}
      {row(tr("perfume.fam.gender", "Gender"), (
        <select className={`${ctl} w-[160px]`} value={v.gender} onChange={(e) => setV({ ...v, gender: e.target.value })} data-testid="perfume-family-gender">
          <option value="">{DASH}</option>{Object.entries(GENDER).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>))}
      {row(tr("perfume.fam.year", "Launch year"), <input type="number" min={1900} max={2100} className={`${ctl} w-[120px] text-right`} value={v.launch_year} onChange={(e) => setV({ ...v, launch_year: e.target.value })} />)}
      {row(tr("perfume.fam.notes", "Notes"), <textarea className={`${ctl} h-14 w-full py-1`} maxLength={2000} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />)}
      <div className="mt-2 flex justify-end gap-2">
        {onCancel ? <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onCancel}>{tr("perfume.cat.cancel", "Cancel")}</Button> : null}
        <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !v.name.trim()} onClick={() => void save()} data-testid="perfume-family-save">{initial ? tr("perfume.fam.save", "Save") : tr("perfume.fam.create", "Create family")}</Button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ families tab */

export function PerfumeFamiliesPanel() {
  const { openId, open } = useOpenDoc();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [fBrand, setFBrand] = useState<string[]>([]);
  const [fScent, setFScent] = useState<string[]>([]);
  const [fGender, setFGender] = useState<string[]>([]);
  const list = useQuery({ queryKey: ["perfume", "families", q], queryFn: () => listPerfumeFamilies(q) });
  if (list.isError) return <ListErrorState title={tr("perfume.fam.error", "Couldn't load the families")} status={0} message={(list.error as Error)?.message} onRetry={() => void list.refetch()} />;
  const all = list.data?.rows ?? [];
  // Owner 2026-11-27 17:28 CT: "SCENT FAMILY … SHOULD BE MULTIMPLE SELECTOR. BRAND SHOULD BE FILTER COMBOBOX".
  const facet = (get: (r: PerfumeFamilyRow) => string) => [...all.reduce((m, r) => m.set(get(r), (m.get(get(r)) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => a[0].localeCompare(b[0])).map(([v, n]) => ({ value: v, label: `${v || "Not set"} (${n.toLocaleString("en-US")})` }));
  const rows = all.filter((r) => (!fBrand.length || fBrand.includes(r.brand ?? "")) && (!fScent.length || fScent.includes(r.olfactory_family ?? ""))
    && (!fGender.length || fGender.includes(r.gender ?? "")));
  return (
    <div className="space-y-3" data-testid="perfume-families-panel">
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-4">
        <KpiCard label={tr("perfume.fam.kpi_families", "Families")} number={rows.length.toLocaleString("en-US")} disabled />
        <KpiCard label={tr("perfume.fam.kpi_items", "Items in families")} number={rows.reduce((t, r) => t + r.items, 0).toLocaleString("en-US")} disabled />
        <KpiCard label={tr("perfume.fam.kpi_units", "Units on hand")} number={rows.reduce((t, r) => t + r.on_hand, 0).toLocaleString("en-US")} disabled />
        <KpiCard label={tr("perfume.fam.kpi_value", "Stock value (avg cost)")} number={money(rows.reduce((t, r) => t + r.stock_value_cents, 0))} disabled />
      </div>
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Button type="button" className="h-[34px] px-3 text-xs" onClick={() => setCreating((x) => !x)} data-testid="perfume-families-new">{creating ? tr("perfume.fam.cancel_new", "Cancel new family") : tr("perfume.fam.new", "New family")}</Button>
          <input type="search" className={`${ctl} w-full max-w-[360px]`} placeholder={tr("perfume.fam.search", "Find a family — name or brand")} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a family" />
          <MultiSelectDropdown label={tr("perfume.fam.f_brand", "Brand")} allLabel="All brands" searchable options={facet((r) => r.brand ?? "")} selected={fBrand} onChange={setFBrand} data-testid="perfume-families-filter-brand" />
          <MultiSelectDropdown label={tr("perfume.fam.f_scent", "Scent family")} allLabel="All scent families" searchable options={facet((r) => r.olfactory_family ?? "")} selected={fScent} onChange={setFScent} data-testid="perfume-families-filter-scent" />
          <MultiSelectDropdown label={tr("perfume.fam.f_gender", "Gender")} allLabel="All genders" options={facet((r) => r.gender ?? "").map((o) => ({ ...o, label: o.label.replace(/^(M|W|U) /, (m) => `${GENDER[m.trim()] ?? m.trim()} `) }))} selected={fGender} onChange={setFGender} data-testid="perfume-families-filter-gender" />
        </div>
        {creating ? <FamilyForm onSaved={(id) => { setCreating(false); open("families", id); }} onCancel={() => setCreating(false)} /> : null}
        <ParityTable<PerfumeFamilyRow> selectable rows={rows} rowKey={(r) => r.id} loading={list.isLoading} storageKey="perfume-families-v1" exportFilename="TIO item families" exportExcel
          emptyText="No families yet — create one, then put items in it from the item editor or the bulk bar." onRowClick={(r) => open("families", r.id)}
          columns={[
            { className: "text-left", key: "name", label: "Family", sortable: true, render: (r) => <span className="font-semibold">{r.name}</span> },
            { className: "text-left", key: "brand", label: "Brand", sortable: true, render: (r) => r.brand ?? DASH, exportValue: (r) => r.brand ?? "" },
            { className: "text-left", key: "olfactory_family", label: "Scent family", sortable: true, render: (r) => r.olfactory_family ?? DASH, exportValue: (r) => r.olfactory_family ?? "" },
            { className: "text-left", key: "gender", label: "Gender", sortable: true, render: (r) => GENDER[r.gender ?? ""] ?? DASH, exportValue: (r) => GENDER[r.gender ?? ""] ?? "" },
            { key: "launch_year", label: "Launch year", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.launch_year ? String(r.launch_year) : DASH), exportValue: (r) => r.launch_year ?? "" },
            { key: "items", label: "Items", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => r.items.toLocaleString("en-US") },
            { key: "on_hand", label: "On hand", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => r.on_hand.toLocaleString("en-US") },
            { key: "stock_value_cents", label: "Stock value", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.stock_value_cents), exportValue: (r) => r.stock_value_cents / 100 },
          ]} />
      </section>
      {openId ? <FamilyProfile id={openId} /> : null}
    </div>
  );
}

function FamilyProfile({ id }: { id: string }) {
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const { open } = useOpenDoc();
  const [editing, setEditing] = useState(false);
  const p = useQuery({ queryKey: ["perfume", "family", id], queryFn: () => getPerfumeFamily(id) });
  if (p.isError) return <ListErrorState title={tr("perfume.fam.one_error", "Couldn't load the family")} status={0} message={(p.error as Error)?.message} onRetry={() => void p.refetch()} />;
  if (!p.data) return null;
  const f = p.data.family;
  const archive = () => void archivePerfumeFamily(id).then(() => { pushToast("Family archived", "success"); void qc.invalidateQueries({ queryKey: ["perfume", "families"] }); open("families", ""); }).catch(fail(pushToast, "Not archived"));
  return (
    <section className="space-y-3 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-family-profile" aria-label={f.name}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-card-title">{[f.brand, f.name].filter(Boolean).join(" · ")}{f.olfactory_family ? ` · ${f.olfactory_family}` : ""}{f.gender ? ` · ${GENDER[f.gender]}` : ""}{f.launch_year ? ` · ${f.launch_year}` : ""}</div>
        {f.archived_at ? <span className="text-xs text-[#B91C1C]">{tr("perfume.fam.archived", "Archived")}</span> : (
          <span className="flex gap-2">
            <Button type="button" variant="secondary" className="h-[30px] px-2 text-xs" onClick={() => setEditing((x) => !x)} data-testid="perfume-family-edit">{editing ? tr("perfume.cat.cancel", "Cancel") : tr("perfume.fam.edit_btn", "Edit")}</Button>
            <Button type="button" variant="secondary" className="h-[30px] px-2 text-xs" disabled={p.data.items.length > 0} title={p.data.items.length ? "Move its items out first" : undefined} onClick={archive}>{tr("perfume.fam.archive", "Archive")}</Button>
          </span>
        )}
      </div>
      {f.notes ? <div className="text-xs text-[#475569]">{f.notes}</div> : null}
      {editing ? <FamilyForm initial={f} onSaved={() => { setEditing(false); void p.refetch(); }} onCancel={() => setEditing(false)} /> : null}
      <ParityTable<PerfumeFamilyProfile["items"][number]> selectable cardTitle title={tr("perfume.fam.items", "Items in this family")} rows={p.data.items} rowKey={(r) => r.id} storageKey="perfume-family-items-v1"
        exportFilename={`TIO family ${f.name}`} exportExcel emptyText="No items yet — open an item and pick this family, or use the bulk bar on Item file."
        columns={[
          { className: "text-left", key: "display_name", label: "Item", render: (r) => <DocLink tab="items" id={r.id}>{r.display_name}</DocLink>, exportValue: (r) => r.display_name },
          { className: "text-left", key: "tio_code", sortable: true, label: "TIO code", render: (r) => r.tio_code ?? DASH, exportValue: (r) => r.tio_code ?? "" },
          { key: "size_ml", sortable: true, label: "Size ml", kind: "number", cellClass: "text-right tabular-nums", render: (r) => (r.size_ml == null ? DASH : String(r.size_ml)), exportValue: (r) => r.size_ml ?? "" },
          { className: "text-left", key: "conc", sortable: true, label: "EDT / EDP / Parfum", render: (r) => r.conc || DASH, exportValue: (r) => r.conc ?? "" },
          { className: "text-left", key: "product_type", sortable: true, label: "Product type", render: (r) => r.product_type ?? DASH, exportValue: (r) => r.product_type ?? "" },
          { className: "text-left", key: "upcs", sortable: true, label: "UPCs", render: (r) => (r.upcs.length ? r.upcs.join(", ") : DASH), exportValue: (r) => r.upcs.join(", ") },
          { key: "on_hand", sortable: true, label: "On hand", kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.on_hand.toLocaleString("en-US") },
          { key: "avg_cost_cents", sortable: true, label: "Avg cost", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.avg_cost_cents), exportValue: (r) => (r.avg_cost_cents == null ? "" : Number(r.avg_cost_cents) / 100) },
        ]} />
      <ParityTable<PerfumeFamilyProfile["events"][number]> selectable cardTitle title={tr("perfume.fam.history", "History")} rows={p.data.events} rowKey={(e) => e.id} storageKey="perfume-family-history-v1"
        exportFilename={`TIO family ${f.name} history`} exportExcel emptyText="No history."
        columns={[
          { key: "created_at", label: "When", cellClass: "text-right tabular-nums", render: (e) => new Date(e.created_at).toLocaleString("en-US", { timeZone: "America/Chicago" }) },
          { className: "text-left", key: "kind", sortable: true, label: "What", render: (e) => e.kind.replace("_", " ") },
          { className: "text-left", key: "detail", sortable: true, label: "Detail", render: (e) => (e.detail.item ? String(e.detail.item) : JSON.stringify(e.detail)), exportValue: (e) => JSON.stringify(e.detail) },
          { className: "text-left", key: "by_email", sortable: true, label: "By", render: (e) => e.by_email ?? DASH },
        ]} />
    </section>
  );
}

/* ------------------------------------------------------------------ family picker (item editor / creator / bulk bar) */

/** Pick the item's family; "+ New family…" creates one (with the item's brand) and selects it. */
export function FamilySelect({ value, onChange, brand, head, className, testId }: {
  value: string; onChange: (id: string) => void; brand?: string | null; head?: ReactNode; className?: string; testId?: string;
}) {
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const fams = useQuery({ queryKey: ["perfume", "families", ""], queryFn: () => listPerfumeFamilies(""), staleTime: 30_000 });
  const [adding, setAdding] = useState<string | null>(null);
  const add = async () => {
    const name = (adding ?? "").trim(); if (!name) return;
    try {
      const r = await createPerfumeFamily({ name, brand: brand?.trim() || null });
      await qc.invalidateQueries({ queryKey: ["perfume", "families"] });
      pushToast(`Family "${name}" created`, "success"); onChange(r.id); setAdding(null);
    } catch (e) { fail(pushToast, "Not created")(e); }
  };
  if (adding != null) return (
    <span className="flex items-center gap-1">
      <input autoFocus className={`${ctl} w-[180px]`} aria-label="New family name" placeholder="New family name" value={adding} onChange={(e) => setAdding(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void add(); if (e.key === "Escape") setAdding(null); }} data-testid={testId ? `${testId}-new` : undefined} />
      <Button type="button" className="h-[30px] px-2 text-xs" disabled={!adding.trim()} onClick={() => void add()}>{tr("perfume.cat.add", "Add")}</Button>
      <button type="button" className="underline" onClick={() => setAdding(null)}>{tr("perfume.cat.cancel", "Cancel")}</button>
    </span>
  );
  return (
    <select className={className ?? `${ctl} block`} aria-label="Family" value={value} data-testid={testId} onChange={(e) => (e.target.value === NEW ? setAdding("") : onChange(e.target.value))}>
      {head ?? <option value="">{DASH}</option>}
      {(fams.data?.rows ?? []).map((f) => <option key={f.id} value={f.id}>{[f.brand, f.name].filter(Boolean).join(" · ")}</option>)}
      <option value={NEW}>{tr("perfume.fam.add_new", "+ New family…")}</option>
    </select>
  );
}

/* ------------------------------------------------------------------ the item's sites (item profile) */

export function ItemSitesBlock({ itemId }: { itemId: string }) {
  const { pushToast } = useToast();
  const sites = useQuery({ queryKey: ["perfume", "item-sites", itemId], queryFn: () => getPerfumeItemSites(itemId) });
  const [edit, setEdit] = useState<Record<string, { bin: string; min: string; max: string; reorder: string }>>({});
  useEffect(() => { setEdit({}); }, [itemId]);
  if (sites.isError) return <ListErrorState title={tr("perfume.sites.error", "Couldn't load the item's sites")} status={0} message={(sites.error as Error)?.message} onRetry={() => void sites.refetch()} />;
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const save = (s: PerfumeItemSite) => {
    const e = edit[s.location_code]; if (!e) return;
    void setPerfumeItemReorder({ item_id: itemId, location_code: s.location_code, min_qty: num(e.min), max_qty: num(e.max), bin: e.bin.trim() || null, reorder_qty: num(e.reorder) })
      .then(() => { pushToast(`${s.location_name}: saved`, "success"); setEdit((x) => { const n = { ...x }; delete n[s.location_code]; return n; }); void sites.refetch(); })
      .catch(fail(pushToast));
  };
  const cell = (s: PerfumeItemSite, k: "bin" | "min" | "max" | "reorder", cur: string, w: string) => {
    const e = edit[s.location_code] ?? { bin: s.bin ?? "", min: s.min_qty == null ? "" : String(s.min_qty), max: s.max_qty == null ? "" : String(s.max_qty), reorder: s.reorder_qty == null ? "" : String(s.reorder_qty) };
    return <input className={`${ctl} ${w} ${k === "bin" ? "" : "text-right"}`} aria-label={`${s.location_name} ${k}`} inputMode={k === "bin" ? undefined : "numeric"} value={edit[s.location_code] ? e[k] : cur}
      onChange={(ev) => setEdit({ ...edit, [s.location_code]: { ...e, [k]: ev.target.value } })} />;
  };
  return (
    <ParityTable<PerfumeItemSite> selectable cardTitle title={tr("perfume.sites.title", "Sites — on hand, bin, min / max and usual reorder quantity")} rows={sites.data ?? []} rowKey={(s) => s.location_code}
      loading={sites.isLoading} storageKey="perfume-item-sites-v1" exportFilename="TIO item sites" exportExcel emptyText="No own sites on the desk."
      columns={[
        { className: "text-left", key: "location_name", sortable: true, label: "Site", render: (s) => s.location_name },
        { key: "on_hand", sortable: true, label: "On hand", kind: "number", cellClass: "text-right tabular-nums", render: (s) => s.on_hand.toLocaleString("en-US") },
        { key: "avg_cost_cents", sortable: true, label: "Avg cost", kind: "number", cellClass: "text-right tabular-nums", render: (s) => money(s.avg_cost_cents), exportValue: (s) => (s.avg_cost_cents == null ? "" : Number(s.avg_cost_cents) / 100) },
        { className: "text-left", key: "bin", sortable: true, label: "Bin", render: (s) => cell(s, "bin", s.bin ?? "", "w-[90px]"), exportValue: (s) => s.bin ?? "" },
        { key: "min_qty", sortable: true, label: "Min", kind: "number", render: (s) => cell(s, "min", s.min_qty == null ? "" : String(s.min_qty), "w-[70px]"), exportValue: (s) => s.min_qty ?? "" },
        { key: "max_qty", sortable: true, label: "Max", kind: "number", render: (s) => cell(s, "max", s.max_qty == null ? "" : String(s.max_qty), "w-[70px]"), exportValue: (s) => s.max_qty ?? "" },
        { key: "reorder_qty", sortable: true, label: "Reorder qty", kind: "number", render: (s) => cell(s, "reorder", s.reorder_qty == null ? "" : String(s.reorder_qty), "w-[80px]"), exportValue: (s) => s.reorder_qty ?? "" },
        { key: "save", label: "", render: (s) => (edit[s.location_code] ? <Button type="button" className="h-[28px] px-2 text-xs" onClick={() => save(s)}>{tr("perfume.sites.save", "Save")}</Button> : null) },
      ]} />
  );
}

/* ------------------------------------------------------------------ reorder tab */

export function PerfumeReorderPanel() {
  const { pushToast } = useToast();
  const [site, setSite] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [expected, setExpected] = useState("");
  const [busy, setBusy] = useState(false);
  const rep = useQuery({ queryKey: ["perfume", "reorder", site], queryFn: () => getPerfumeReorder(site || undefined) });
  useEffect(() => { setPicked([]); }, [site]);
  if (rep.isError) return <ListErrorState title={tr("perfume.reorder.error", "Couldn't load the reorder report")} status={0} message={(rep.error as Error)?.message} onRetry={() => void rep.refetch()} />;
  const rows = rep.data?.rows ?? [];
  const sites = [...new Map(rows.map((r) => [r.location_code, r.location_name])).entries()];
  const key = (r: PerfumeReorderRow) => `${r.location_code}|${r.item_id}`;
  const make = async () => {
    const chosen = rows.filter((r) => picked.includes(key(r)));
    const bySite = new Map<string, string[]>();
    for (const r of chosen) bySite.set(r.location_code, [...(bySite.get(r.location_code) ?? []), r.item_id]);
    setBusy(true);
    try {
      const made: string[] = []; const skipped: string[] = [];
      for (const [loc, ids] of bySite) {
        const r = await makePerfumeReorderPos({ location_code: loc, item_ids: ids, expected_by: expected || null });
        made.push(...r.purchase_orders.map((p) => `${p.number} (${p.lines} line${p.lines === 1 ? "" : "s"})`));
        skipped.push(...r.skipped.map((s) => `${s.display_name || s.item_id}: ${s.reason}`));
      }
      pushToast(made.length ? `Purchase orders made: ${made.join(", ")}${skipped.length ? ` — not bought: ${skipped.join("; ")}` : ""}` : `Nothing bought — ${skipped.join("; ")}`, made.length ? "success" : "error");
      setPicked([]); void rep.refetch();
    } catch (e) { fail(pushToast, "Purchase orders not made")(e); } finally { setBusy(false); }
  };
  const total = rows.filter((r) => picked.includes(key(r))).reduce((t, r) => t + (r.line_cost_cents ?? 0), 0);
  return (
    <div className="space-y-3" data-testid="perfume-reorder-panel">
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-4">
        <KpiCard label={tr("perfume.reorder.kpi_short", "Items to reorder")} number={rows.length.toLocaleString("en-US")} disabled />
        <KpiCard label={tr("perfume.reorder.kpi_units", "Units to buy")} number={rows.reduce((t, r) => t + r.to_buy, 0).toLocaleString("en-US")} disabled />
        <KpiCard label={tr("perfume.reorder.kpi_cost", "Cost at best price")} number={money(rows.reduce((t, r) => t + (r.line_cost_cents ?? 0), 0))} disabled />
        <KpiCard label={tr("perfume.reorder.kpi_nosupplier", "No supplier carries it")} number={rows.filter((r) => !r.vendor_id).length.toLocaleString("en-US")} disabled />
      </div>
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3">
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label>{tr("perfume.reorder.site", "Site")}
            <select className={`${ctl} block`} value={site} onChange={(e) => setSite(e.target.value)} data-testid="perfume-reorder-site">
              <option value="">{tr("perfume.reorder.all_sites", "All own sites")}</option>{sites.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
          </label>
          <label>{tr("perfume.reorder.expected", "Expected by")} <DatePicker aria-label="Expected by" value={expected} onChange={setExpected} /></label>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !picked.length} onClick={() => void make()} data-testid="perfume-reorder-make">
            {picked.length ? `${tr("perfume.reorder.make", "Make purchase orders")} (${picked.length} · ${money(total)})` : tr("perfume.reorder.make", "Make purchase orders")}</Button>
          <span className="text-[#64748B]">{tr("perfume.reorder.hint", "Set min / max / reorder qty per site on each item's profile. On order = open purchase orders to that site.")}</span>
        </div>
        <ParityTable<PerfumeReorderRow> rows={rows} rowKey={key} loading={rep.isLoading} storageKey="perfume-reorder-v1" exportFilename="TIO reorder report" exportExcel
          selectable selectedKeys={picked} onSelectionChange={setPicked} emptyText="Nothing at or below its minimum."
          columns={[
            { className: "text-left", key: "display_name", label: "Item", render: (r) => <DocLink tab="items" id={r.item_id}>{r.display_name}</DocLink>, exportValue: (r) => r.display_name },
            { className: "text-left", key: "location_name", sortable: true, label: "Site", render: (r) => r.location_name },
            { className: "text-left", key: "bin", sortable: true, label: "Bin", render: (r) => r.bin ?? DASH, exportValue: (r) => r.bin ?? "" },
            { key: "on_hand", sortable: true, label: "On hand", kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.on_hand.toLocaleString("en-US") },
            { key: "on_order", sortable: true, label: "On order", kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.on_order.toLocaleString("en-US") },
            { key: "min_qty", sortable: true, label: "Min", kind: "number", cellClass: "text-right tabular-nums", render: (r) => String(r.min_qty) },
            { key: "max_qty", sortable: true, label: "Max", kind: "number", cellClass: "text-right tabular-nums", render: (r) => (r.max_qty == null ? DASH : String(r.max_qty)), exportValue: (r) => r.max_qty ?? "" },
            { key: "to_buy", sortable: true, label: "To buy", kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (r) => r.to_buy.toLocaleString("en-US") },
            { className: "text-left", key: "vendor", label: "Cheapest supplier", render: (r) => (r.vendor_id ? <DocLink tab="suppliers" id={r.vendor_id}>{r.vendor ?? ""}</DocLink> : <span className="text-[#B91C1C]">None on the desk</span>), exportValue: (r) => r.vendor ?? "" },
            { key: "unit_cost_cents", sortable: true, label: "Unit cost", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.unit_cost_cents), exportValue: (r) => (r.unit_cost_cents == null ? "" : r.unit_cost_cents / 100) },
            { key: "line_cost_cents", sortable: true, label: "Line cost", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.line_cost_cents), exportValue: (r) => (r.line_cost_cents == null ? "" : r.line_cost_cents / 100) },
          ]} />
      </section>
    </div>
  );
}
