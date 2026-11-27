/**
 * PERFUME-CATALOGS — the type lists of TIO Perfumes (owner 2026-11-26 17:38 CT: "where is the lists or catalogs for types
 * etc for all that … for the who types, for the perfumes, sexes etc"). One box per list: vendor types, customer types,
 * categories, business types, lead source kinds, perfume product types, genders — each value with how many contacts use
 * it. Add, rename (the contacts carrying it move with it) or archive. The Excel download offers these as drop-downs.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  addPerfumeCatalogValue, archivePerfumeCatalogValue, listPerfumeCatalogs, renamePerfumeCatalogValue,
  type PerfumeCatalogKind, type PerfumeCatalogs,
} from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { downloadXlsx } from "../../components/parity/useParityServerView";
import { PerfumeHistoryTable } from "./PerfumeHistoryTable";
import { perfumeHistoryOf } from "../../api/perfume";

const ctl = "h-[30px] rounded-sm border border-[#C6D1DC] bg-white px-2 text-xs";
const NOTES: Partial<Record<PerfumeCatalogKind, string>> = {
  source_kind: "Where each lead came from. Set by the app from the origin (email, leaked list, phone, each research source) — add a kind, archive one.",
  product_type: "Written out on every perfume list — never letter codes.",
};

export function PerfumeCatalogsPanel() {
  const cats = useQuery({ queryKey: ["perfume", "catalogs"], queryFn: listPerfumeCatalogs });
  const exportAll = () => void downloadXlsx("TIO catalogs.xlsx", ["List", "Value", "Contacts using it"],
    (cats.data?.kinds ?? []).flatMap((k) => k.values.map((v) => [k.label, v.value, v.contacts])));
  if (cats.isError) return <ListErrorState title={tr("perfume.cat.error", "Couldn't load the catalogs")} status={0} message={(cats.error as Error)?.message} onRetry={() => void cats.refetch()} />;
  return (
    <div className="space-y-2" data-testid="perfume-catalogs-panel">
    <div className="flex justify-end">
      <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={exportAll} disabled={!cats.data} data-testid="perfume-catalogs-export">
        {tr("perfume.cat.export", "Export all lists (Excel)")}</Button>
    </div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {(cats.data?.kinds ?? []).map((k) => <CatalogBox key={k.kind} cat={k} onChanged={() => void cats.refetch()} />)}
      {cats.isLoading ? <div className="text-xs text-gray-500">{tr("perfume.cat.loading", "Loading…")}</div> : null}
    </div>
    </div>
  );
}

function CatalogBox({ cat, onChanged }: { cat: PerfumeCatalogs["kinds"][number]; onChanged: () => void }) {
  const { pushToast } = useToast();
  const [add, setAdd] = useState("");
  const [edit, setEdit] = useState<{ id: string; value: string } | null>(null);
  const [histOf, setHistOf] = useState<string | null>(null);
  const history = useQuery({ queryKey: ["perfume", "catalog", histOf, "history"], queryFn: () => perfumeHistoryOf("catalogs", histOf!), enabled: Boolean(histOf) });
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); onChanged(); pushToast(ok, "success"); } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
  };
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={cat.label} data-testid={`perfume-catalog-${cat.kind}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-section-header">{tr(`perfume.cat.${cat.kind}`, cat.label)}</div>
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
                <span className="tabular-nums text-[#64748B]" title={tr("perfume.cat.used", "Contacts with this value")}>{v.contacts.toLocaleString()}</span>
                {cat.kind !== "source_kind" ? (
                  <button type="button" className="text-xs text-[#14314F] underline" onClick={() => setEdit({ id: v.id, value: v.value })}>{tr("perfume.cat.rename", "Rename")}</button>
                ) : null}
                <button type="button" className="text-xs text-[#64748B] underline" onClick={() => setHistOf(histOf === v.id ? null : v.id)}>{tr("perfume.cat.history", "History")}</button>
                <button type="button" className="text-xs text-[#64748B] underline" data-testid={`perfume-catalog-archive-${v.id}`}
                  onClick={() => void run(() => archivePerfumeCatalogValue(v.id), `${v.value} archived`)}>{tr("perfume.cat.archive", "Archive")}</button>
              </>
            )}
          </li>
        ))}
      </ul>
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
