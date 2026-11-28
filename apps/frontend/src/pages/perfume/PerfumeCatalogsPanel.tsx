/**
 * PERFUME-CATALOGS — the type lists of TIO Perfumes (owner 2026-11-26 17:38 CT: "where is the lists or catalogs for types
 * etc for all that … for the who types, for the perfumes, sexes etc"). One box per list: vendor types, customer types,
 * categories, business types, lead source kinds, perfume product types, genders — each value with how many contacts use
 * it. Add, rename (the contacts carrying it move with it) or archive. The Excel download offers these as drop-downs.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  addPerfumeCatalogValue, archivePerfumeCatalogValue, listPerfumeCatalogs, mergePerfumeCatalogValue, renamePerfumeCatalogValue,
  type PerfumeCatalogKind, type PerfumeCatalogs,
} from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { downloadXlsx } from "../../components/parity/useParityServerView";
import { PerfumeHistoryTable } from "./PerfumeHistoryTable";
import { PerfumeCatalogCleanup } from "./PerfumeCatalogCleanup";
import { perfumeHistoryOf } from "../../api/perfume";

const ctl = "h-[30px] rounded-sm border border-[#C6D1DC] bg-white px-2 text-xs";
const NOTES: Partial<Record<PerfumeCatalogKind, string>> = {
  source_kind: "Where each lead came from. Set by the app from the origin (email, leaked list, phone, each research source) — add a kind, archive one.",
  product_type: "Written out on every perfume list — never letter codes. The number is how many items carry it; a rename moves those items.",
  olfactory_family: "Scent families — what an item family can be (floral, woody, amber …). The number is how many item families carry it; a rename moves them.",
  item_category: "Item categories — what the item creator, the item editor and the bulk bar offer. The number is how many items carry it; a rename moves those items.",
};

/** Owner 2026-11-27 16:54 CT: "you need to have header for each type and not confuse … separate all the types and categories … not mix".
 *  One section per thing the list describes; each list is its own catalog. */
const GROUPS: Array<{ key: string; title: string; note: string; kinds: string[] }> = [
  { key: "contacts", title: "Contacts & leads", note: "Every company and lead: its relationship to us, its industry, its business type, where it came from, and review tags (notes to check).", kinds: ["category", "industry", "segment", "source_kind", "review_tag"] },
  { key: "customers", title: "Customers", note: "The kind of customer (on companies with role customer or both).", kinds: ["customer_type"] },
  { key: "vendors", title: "Vendors", note: "The kind of vendor (on companies with role vendor or both).", kinds: ["vendor_type"] },
  { key: "items", title: "Items", note: "Product type is the kind only (Regular, Tester, Set, Mini …); the gender is its own list.", kinds: ["product_type", "gender", "item_category", "olfactory_family", "origin_country"] },
];

export function PerfumeCatalogsPanel() {
  const cats = useQuery({ queryKey: ["perfume", "catalogs"], queryFn: listPerfumeCatalogs });
  const exportAll = () => void downloadXlsx("TIO catalogs.xlsx", ["List", "Value", "Contacts / items using it"],
    (cats.data?.kinds ?? []).flatMap((k) => k.values.map((v) => [k.label, v.value, v.contacts])));
  if (cats.isError) return <ListErrorState title={tr("perfume.cat.error", "Couldn't load the catalogs")} status={0} message={(cats.error as Error)?.message} onRetry={() => void cats.refetch()} />;
  return (
    <div className="space-y-2" data-testid="perfume-catalogs-panel">
    <div className="flex justify-end gap-2">
      <PerfumeCatalogCleanup onDone={() => void cats.refetch()} />
      <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={exportAll} disabled={!cats.data} data-testid="perfume-catalogs-export">
        {tr("perfume.cat.export", "Export all lists (Excel)")}</Button>
    </div>
    {cats.isLoading ? <div className="text-xs text-gray-500">{tr("perfume.cat.loading", "Loading…")}</div> : null}
    {GROUPS.map((g) => {
      const kinds = (cats.data?.kinds ?? []).filter((k) => g.kinds.includes(k.kind));
      if (!kinds.length) return null;
      return (
        <section key={g.key} className="space-y-2" aria-label={g.title} data-testid={`perfume-catalog-group-${g.key}`}>
          <div className="text-page-title">{tr(`perfume.cat.group_${g.key}`, g.title)}</div>
          <div className="text-xs text-[#64748B]">{tr(`perfume.cat.group_${g.key}_note`, g.note)}</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {kinds.map((k) => <CatalogBox key={k.kind} cat={k} onChanged={() => void cats.refetch()} />)}
          </div>
        </section>
      );
    })}
    </div>
  );
}

function CatalogBox({ cat, onChanged }: { cat: PerfumeCatalogs["kinds"][number]; onChanged: () => void }) {
  const { pushToast } = useToast();
  const [add, setAdd] = useState("");
  const [edit, setEdit] = useState<{ id: string; value: string } | null>(null);
  const [histOf, setHistOf] = useState<string | null>(null);
  const [mergeOf, setMergeOf] = useState<{ id: string; value: string; n: number } | null>(null);
  const [mergeInto, setMergeInto] = useState("");
  const history = useQuery({ queryKey: ["perfume", "catalog", histOf, "history"], queryFn: () => perfumeHistoryOf("catalogs", histOf!), enabled: Boolean(histOf) });
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); onChanged(); pushToast(ok, "success"); } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
  };
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={cat.label} data-testid={`perfume-catalog-${cat.kind}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-card-title">{tr(`perfume.cat.${cat.kind}`, cat.label)}</div>
        <span className="text-xs text-[#64748B]">{cat.values.length} {tr("perfume.cat.values", "values")}</span>
      </div>
      {NOTES[cat.kind] ? <div className="text-xs text-[#64748B]">{tr(`perfume.cat.note_${cat.kind}`, NOTES[cat.kind]!)}</div> : null}
      <ul className="max-h-[320px] divide-y divide-[#EEF2F6] overflow-y-auto">
        {cat.values.map((v) => (
          <li key={v.id} className="flex items-center gap-2 py-1 text-xs">
            {edit?.id === v.id ? (
              <>
                <input className={`${ctl} min-w-0 flex-1`} value={edit.value} aria-label={`Rename ${v.value}`} onChange={(e) => setEdit({ id: v.id, value: e.target.value })} />
                <Button type="button" className="h-[28px] px-2 text-xs" disabled={!edit.value.trim()}
                  onClick={() => void run(async () => { const r = await renamePerfumeCatalogValue(v.id, edit.value.trim()); setEdit(null); return r; }, `${v.value} → ${edit.value.trim()}`)}>
                  {tr("perfume.cat.save", "Save")}</Button>
                <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={() => setEdit(null)}>{tr("perfume.cat.cancel", "Cancel")}</Button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate font-semibold text-[#1F2A44]">{v.value}</span>
                <span className="tabular-nums text-[#64748B]" title={cat.used_by === "families" ? tr("perfume.cat.used_families", "Item families with this value") : cat.used_by === "items" ? tr("perfume.cat.used_items", "Items with this value") : tr("perfume.cat.used", "Contacts with this value")}>{v.contacts.toLocaleString()}</span>
                {cat.kind !== "source_kind" ? (
                  <button type="button" className="text-xs text-[#14314F] underline" onClick={() => setEdit({ id: v.id, value: v.value })}>{tr("perfume.cat.rename", "Rename")}</button>
                ) : null}
                {cat.kind !== "source_kind" && cat.values.length > 1 ? (
                  <button type="button" className="text-xs text-[#14314F] underline" data-testid={`perfume-catalog-merge-${v.id}`}
                    onClick={() => { setMergeOf({ id: v.id, value: v.value, n: v.contacts }); setMergeInto(""); }}>{tr("perfume.cat.merge", "Merge into…")}</button>
                ) : null}
                <button type="button" className="text-xs text-[#64748B] underline" onClick={() => setHistOf(histOf === v.id ? null : v.id)}>{tr("perfume.cat.history", "History")}</button>
                <button type="button" className="text-xs text-[#64748B] underline" data-testid={`perfume-catalog-archive-${v.id}`}
                  onClick={() => void run(() => archivePerfumeCatalogValue(v.id), `${v.value} archived`)}>{tr("perfume.cat.archive", "Archive")}</button>
              </>
            )}
          </li>
        ))}
      </ul>
      {mergeOf ? (
        <Modal open onClose={() => setMergeOf(null)} title={`${tr("perfume.cat.merge_title", "Merge")} "${mergeOf.value}"`} size="sm" data-testid="perfume-catalog-merge-modal">
          <div className="space-y-3 text-xs">
            <p>{`${mergeOf.n.toLocaleString("en-US")} ${cat.used_by === "items" ? "items" : cat.used_by === "families" ? "item families" : "contacts"} ${tr("perfume.cat.merge_help", "move to the value you pick, each with a history row. The merged value is archived, never deleted.")}`}</p>
            <label className="block">{tr("perfume.cat.merge_into", "Merge into")}
              <select className={`${ctl} block w-full`} value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} data-testid="perfume-catalog-merge-into">
                <option value="">{tr("perfume.cat.pick", "Pick a value…")}</option>
                {cat.values.filter((x) => x.id !== mergeOf.id).map((x) => <option key={x.id} value={x.id}>{`${x.value} (${x.contacts.toLocaleString("en-US")})`}</option>)}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => setMergeOf(null)}>{tr("perfume.cat.cancel", "Cancel")}</Button>
              <Button type="button" className="h-[34px] px-3 text-xs" disabled={!mergeInto} data-testid="perfume-catalog-merge-confirm"
                onClick={() => void run(async () => { const r = await mergePerfumeCatalogValue(mergeOf.id, mergeInto); setMergeOf(null); return r; }, `${mergeOf.value} merged`)}>
                {tr("perfume.cat.merge_confirm", "Confirm — merge")}</Button>
            </div>
          </div>
        </Modal>
      ) : null}
      {histOf ? <PerfumeHistoryTable events={history.data?.events ?? []} loading={history.isLoading} storageKey="perfume-catalog-history-v1" exportName="TIO catalog value history" /> : null}
      <div className="flex gap-2">
        <input className={`${ctl} min-w-0 flex-1`} placeholder={tr("perfume.cat.add_ph", "Add a value")} value={add} onChange={(e) => setAdd(e.target.value)}
          data-testid={`perfume-catalog-add-${cat.kind}`} />
        <Button type="button" className="h-[30px] px-3 text-xs" disabled={!add.trim()}
          onClick={() => void run(async () => { const r = await addPerfumeCatalogValue({ kind: cat.kind, value: add.trim() }); setAdd(""); return r; }, `${add.trim()} added`)}>
          {tr("perfume.cat.add", "Add")}</Button>
      </div>
    </section>
  );
}
