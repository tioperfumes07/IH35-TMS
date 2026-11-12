/** PERFUME-DESK — vendors, price lists, and the import engine with its to-the-cent import check. */
import { useMemo, useState } from "react";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Combobox } from "../../components/Combobox";
import { ParityTable } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  extractPerfumeLines, listPerfumeLists, listPerfumeVendors, previewPerfumeImport, savePerfumeImport, savePerfumeVendor, setPerfumeListCurrent, voidPerfumeList,
  type PerfumeImportBody, type PerfumeImportCheck, type PerfumeList, type PerfumeVendor, type PerfumeVendorKind,
} from "../../api/perfume";
import {
  extractRows, FIELDS, findHeaderRow, guessMapping, isPictureFile, pictureLinesToExtracted, priceToCents, readAnyFile, readPictureFiles,
  type Mapping, type PictureLine, type ReadFile,
} from "./perfumeFileReaders";
import { tr } from "./perfumeI18n";
import { ListErrorState } from "../../components/ListErrorState";

const money = (c: unknown) => (c == null ? "—" : `$${(Number(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const KINDS: Array<[PerfumeVendorKind, string]> = [["buy", "Supplier — I buy from them and sell to them"], ["sell", "Wholesale competitor"], ["both", "Both"],
  ["offer", "My offer list — what I offer my clients"], ["inventory", "My inventory — my stock, quantities and last cost"]];

export function PerfumeListsPanel() {
  const vendors = useQuery({ queryKey: ["perfume", "vendors"], queryFn: listPerfumeVendors });
  const lists = useQuery({ queryKey: ["perfume", "lists"], queryFn: listPerfumeLists });
  // An outage must never look like "no vendors / no lists".
  const failed = vendors.isError ? vendors : lists.isError ? lists : null;
  if (failed) {
    return <ListErrorState title={tr("perfume.lists.loadError", "Couldn't load vendors and price lists")} status={0} message={(failed.error as Error)?.message} onRetry={() => { void vendors.refetch(); void lists.refetch(); }} />;
  }
  return (
    <div className="space-y-4">
      <ImportCard vendors={vendors.data?.vendors ?? []} />
      <VendorsCard vendors={vendors.data?.vendors ?? []} />
      <section className="space-y-1" aria-label={tr("perfume.lists.1", "Price lists on file")}>
        <div className="text-section-header">{tr("perfume.lists.2", "Price lists on file")}</div>
        <ParityTable<PerfumeList>
          rows={lists.data?.lists ?? []}
          rowKey={(l) => l.id}
          loading={lists.isLoading}
          storageKey="perfume-desk-lists-v1"
          emptyText="No price lists yet."
          columns={[
            { key: "vendor_name", label: "Vendor", sortable: true },
            { key: "list_date", label: "List date", sortable: true },
            { key: "file_name", label: "File", sortable: true },
            { key: "rows_saved", label: "Lines", sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
            { key: "price_total_saved_cents", label: "Price total", sortable: true, kind: "number", cellClass: "text-right tabular-nums", sortValue: (l) => Number(l.price_total_saved_cents), render: (l) => money(l.price_total_saved_cents) },
            { key: "matched", label: "Linked", sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
            { key: "review", label: "To review", sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
            { key: "unmatched", label: "No match", sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
            { key: "is_current", label: "In the grid", sortable: true, render: (l) => (l.is_current ? "Yes" : "No (older)") },
          ]}
          rowActions={(l) => <span className="flex items-center gap-1"><CurrentListButton list={l} /><VoidListButton list={l} /></span>}
          rowActionsWidth={320}
        />
      </section>
    </div>
  );
}

function CurrentListButton({ list }: { list: PerfumeList }) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button type="button" variant="secondary" className="h-[34px] px-2 text-xs" disabled={busy} onClick={async () => {
      setBusy(true);
      try { await setPerfumeListCurrent(list.id, !list.is_current); await qc.invalidateQueries({ queryKey: ["perfume"] }); pushToast(list.is_current ? "Removed from the grid" : "Counted in the grid", "success"); }
      catch (e) { pushToast(userFacingApiError(e, "Not changed"), "error"); }
      finally { setBusy(false); }
    }}>{list.is_current ? "Take out of grid" : "Use in grid"}</Button>
  );
}

function VoidListButton({ list }: { list: PerfumeList }) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [reason, setReason] = useState<string | null>(null);
  if (reason == null) return <Button type="button" variant="secondary" className="h-[34px] px-2 text-xs" onClick={() => setReason("")}>{tr("perfume.lists.3", "Void")}</Button>;
  return (
    <span className="flex items-center gap-1">
      <input aria-label={tr("perfume.lists.4", "Reason")} placeholder={tr("perfume.lists.5", "Reason")} value={reason} onChange={(e) => setReason(e.target.value)} className="h-[34px] w-[160px] rounded-sm border border-gray-300 px-2 text-xs" />
      <Button type="button" className="h-[34px] px-2 text-xs" disabled={reason.trim().length < 3} onClick={async () => {
        try { await voidPerfumeList(list.id, reason.trim()); await qc.invalidateQueries({ queryKey: ["perfume"] }); pushToast("List voided", "success"); }
        catch (e) { pushToast(userFacingApiError(e, "Not voided"), "error"); }
      }}>{tr("perfume.lists.6", "Save")}</Button>
      <Button type="button" variant="secondary" className="h-[34px] px-2 text-xs" onClick={() => setReason(null)}>{tr("perfume.lists.7", "Close")}</Button>
    </span>
  );
}

/* ---------------- vendors ---------------- */

function VendorsCard({ vendors }: { vendors: PerfumeVendor[] }) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [edit, setEdit] = useState<Partial<PerfumeVendor> & { earn?: string } | null>(null);
  const cents = (k: "cushion_lo_cents" | "cushion_hi_cents" | "freight_lo_cents" | "freight_hi_cents", label: string) => (
    <label className="flex flex-col gap-1 text-xs text-gray-600">{label}
      <input type="number" step="0.05" min="0" placeholder={tr("perfume.lists.8", "rule default")} className="h-[40px] w-[120px] rounded-sm border border-gray-300 px-2 tabular-nums"
        value={edit?.[k] == null ? "" : ((edit[k] as number) / 100).toFixed(2)}
        onChange={(e) => setEdit({ ...edit, [k]: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) })} />
    </label>
  );
  const save = async () => {
    if (!edit?.name?.trim()) return;
    try {
      await savePerfumeVendor({ ...edit, name: edit.name.trim(), earn_pct: edit.earn ? Number(edit.earn) : null } as PerfumeVendor & { earn_pct: number | null });
      setEdit(null);
      await qc.invalidateQueries({ queryKey: ["perfume"] });
      pushToast("Vendor saved", "success");
    } catch (e) { pushToast(userFacingApiError(e, "Vendor not saved"), "error"); }
  };
  return (
    <section className="space-y-1" aria-label={tr("perfume.lists.9", "Vendors")}>
      <div className="flex items-center justify-between">
        <div className="text-section-header">{tr("perfume.lists.10", "Vendors & Laredo stores")}</div>
        <Button type="button" className="h-[34px] px-3 text-xs" onClick={() => setEdit({ kind: "buy" })}>{tr("perfume.lists.11", "Add vendor")}</Button>
      </div>
      {edit ? (
        <div className="flex flex-wrap items-end gap-2 rounded-sm border border-gray-200 bg-white p-2">
          <label className="flex flex-col gap-1 text-xs text-gray-600">{tr("perfume.lists.12", "Name")}
            <input className="h-[40px] w-[260px] rounded-sm border border-gray-300 px-2" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder={tr("perfume.lists.13", "Perfume Center of America (Kanak)")} />
          </label>
          <span className="flex flex-col gap-1 text-xs text-gray-600">{tr("perfume.lists.14", "Kind")}
            <span className="flex gap-1">{KINDS.map(([k, l]) => (
              <button key={k} type="button" aria-pressed={edit.kind === k} onClick={() => setEdit({ ...edit, kind: k })}
                className={`h-[40px] rounded-sm border px-2 ${edit.kind === k ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-300 bg-[var(--surface-unselected)]"}`}>{l}</button>
            ))}</span>
          </span>
          {cents("cushion_lo_cents", "Cushion from $")}{cents("cushion_hi_cents", "to $")}
          {cents("freight_lo_cents", "Freight from $")}{cents("freight_hi_cents", "to $")}
          <label className="flex flex-col gap-1 text-xs text-gray-600">{tr("perfume.lists.15", "Earns %")}
            <input type="number" step="0.5" min="0" max="99" placeholder={tr("perfume.lists.16", "rule default")} className="h-[40px] w-[104px] rounded-sm border border-gray-300 px-2" value={edit.earn ?? (edit.earn_pct ?? "")} onChange={(e) => setEdit({ ...edit, earn: e.target.value })} />
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" checked={Boolean(edit.sells_by_box)} onChange={(e) => setEdit({ ...edit, sells_by_box: e.target.checked })} />{tr("perfume.lists.17", "Sells by full box only")}</label>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={!edit.name?.trim()} onClick={() => void save()}>{tr("perfume.lists.18", "Save")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => setEdit(null)}>{tr("perfume.lists.19", "Close")}</Button>
        </div>
      ) : null}
      <ParityTable<PerfumeVendor>
        rows={vendors}
        rowKey={(v) => v.id}
        storageKey="perfume-desk-vendors-v1"
        emptyText="No vendors yet — add Perfume Center of America, Miami Trading Zone, La Esperanza …"
        onRowClick={(v) => setEdit({ ...v, earn: v.earn_pct ?? "" })}
        columns={[
          { key: "name", label: "Name", sortable: true },
          { key: "kind", label: "Kind", sortable: true, render: (v) => KINDS.find(([k]) => k === v.kind)?.[1] ?? v.kind },
          { key: "cushion_lo_cents", label: "Cushion", sortable: true, render: (v) => (v.cushion_lo_cents == null && v.cushion_hi_cents == null ? "rule default" : `${money(v.cushion_lo_cents)} – ${money(v.cushion_hi_cents)}`) },
          { key: "freight_lo_cents", label: "Freight / pc", sortable: true, render: (v) => (v.freight_lo_cents == null && v.freight_hi_cents == null ? "rule default" : `${money(v.freight_lo_cents)} – ${money(v.freight_hi_cents)}`) },
          { key: "earn_pct", label: "Earns %", sortable: true, render: (v) => (v.earn_pct == null ? "rule default" : `${Number(v.earn_pct)}%`) },
          { key: "sells_by_box", label: "By box", sortable: true, render: (v) => (v.sells_by_box ? "Yes" : "") },
        ]}
      />
    </section>
  );
}

/* ---------------- import ---------------- */

function ImportCard({ vendors }: { vendors: PerfumeVendor[] }) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [fileLabel, setFileLabel] = useState("");
  const [read, setRead] = useState<ReadFile | null>(null);
  // Pictures (offer photos / scanned pages): Claude reads them, the owner fixes and approves every line.
  const [lines, setLines] = useState<PictureLine[]>([]);
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [sheetIx, setSheetIx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [map, setMap] = useState<Mapping>({});
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [listDate, setListDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  // A full price list replaces the vendor's current list; a supplement (new arrivals, specials) is added next to it.
  const [replaces, setReplaces] = useState(true);
  const [check, setCheck] = useState<PerfumeImportCheck | null>(null);
  const [busy, setBusy] = useState(false);

  const sheet = read?.sheets[sheetIx];
  const headers = useMemo(() => (sheet?.cells[headerRow] ?? []).map((h, i) => String(h ?? "").trim() || `Column ${i + 1}`), [sheet, headerRow]);
  const isPictures = read?.kind === "image";
  const extracted = useMemo(
    () => (isPictures ? (lines.length ? pictureLinesToExtracted(lines) : null) : sheet ? extractRows(sheet, headerRow, map) : null),
    [isPictures, lines, sheet, headerRow, map],
  );
  const needPrice = lines.filter((l) => l.include && !(Number(l.price) > 0)).length;

  const readPictures = async () => {
    const pics = read?.pictures ?? [];
    if (!pics.length) return;
    const BATCH = 4;
    const all: PictureLine[] = [];
    setLines([]); setCheck(null); setReading({ done: 0, total: pics.length });
    try {
      for (let i = 0; i < pics.length; i += BATCH) {
        const batch = pics.slice(i, i + BATCH);
        const r = await extractPerfumeLines(batch);
        for (const l of r.lines) all.push({ ...l, image: i + l.image, key: `${i + l.image}-${all.length}`, include: true });
        setLines([...all]);
        setReading({ done: Math.min(pics.length, i + BATCH), total: pics.length });
      }
      pushToast(`Read ${pics.length} picture(s): ${all.length} lines — check each one before saving`, "success");
    } catch (e) {
      pushToast(userFacingApiError(e, "The picture reader failed"), "error");
    } finally {
      setReading(null);
    }
  };
  const editLine = (key: string, patch: Partial<PictureLine>) => { setCheck(null); setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); };

  const open = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f); setCheck(null); setLines([]);
    setFileLabel(files.length > 1 ? `${files.length} pictures (${f.name} …)` : f.name);
    setReplaces(files.length > 1 || isPictureFile(f) ? false : !/arrival|nuevo|new[-_ ]|special|promo|oferta|addend|supplement/i.test(f.name));
    try {
      if (files.length > 1) {
        setRead(await readPictureFiles(files));
        return;
      }
      const r = await readAnyFile(f);
      if (r.kind === "image") { setRead(r); setReplaces(false); return; }
      const si = Math.max(0, r.sheets.findIndex((s) => s.cells.length > 1));
      const hr = findHeaderRow(r.sheets[si].cells);
      setRead(r); setSheetIx(si); setHeaderRow(hr);
      setMap(r.kind === "pdf_text" ? { desc: 0, price: 1 } : guessMapping((r.sheets[si].cells[hr] ?? []).map((h) => String(h ?? ""))));
      const saved = vendors.find((v) => f.name.toLowerCase().includes(v.name.toLowerCase().split(" ")[0]));
      if (saved) setVendorId(saved.id);
    } catch (e) { pushToast(`Could not read ${f.name}: ${String((e as Error)?.message ?? e)}`, "error"); }
  };
  const body = (): PerfumeImportBody | null => {
    if (!read || !extracted || !vendorId || !file) return null;
    return { vendor_id: vendorId, list_date: listDate, file_name: (fileLabel || file.name).slice(0, 200), source_kind: read.kind, rows_read: extracted.rowsRead, file_price_total_cents: extracted.fileTotalCents, rows: extracted.rows, replaces_current: replaces };
  };
  const run = async (save: boolean) => {
    const b = body(); if (!b) return;
    setBusy(true);
    try {
      if (save) {
        const r = await savePerfumeImport(b);
        setCheck(r.check);
        await qc.invalidateQueries({ queryKey: ["perfume"] });
        pushToast(`Saved ${r.check.rows_saved.toLocaleString()} lines · totals match to the cent`, "success");
      } else setCheck(await previewPerfumeImport(b));
    } catch (e) { pushToast(userFacingApiError(e, save ? "List not saved" : "Preview failed"), "error"); }
    finally { setBusy(false); }
  };
  const fieldOptions = [{ value: "", label: "— none —" }, ...headers.map((h, i) => ({ value: String(i), label: h }))];

  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" aria-label={tr("perfume.lists.20", "Import a price list")}>
      <div className="text-section-header">{tr("perfume.lists.21", "Import a price list")}</div>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-1 text-gray-600">{tr("perfume.lists.22", "File (.xlsx · .xls · .csv · PDF) or offer photos (pick several)")}
          <input type="file" multiple accept=".xlsx,.xls,.csv,.pdf,image/*" className="h-[40px] text-xs" data-testid="perfume-import-file"
            onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) void open(fs); }} />
        </label>
        <label className="flex flex-col gap-1 text-gray-600">{tr("perfume.lists.23", "Vendor")}
          <Combobox ariaLabel="Vendor" size="sm" value={vendorId} onChange={setVendorId} placeholder={tr("perfume.lists.24", "Pick vendor")}
            options={vendors.map((v) => ({ value: v.id, label: v.name, sublabel: KINDS.find(([k]) => k === v.kind)?.[1] }))} />
        </label>
        {vendorId ? (() => {
          const v = vendors.find((x) => x.id === vendorId);
          if (!v) return null;
          return (
            <label className="flex flex-col gap-1 text-gray-600">{tr("perfume.lists.role", "This list is from")}
              <Combobox ariaLabel="This list is from" size="sm" value={v.kind}
                onChange={(k) => {
                  if (!k || k === v.kind) return;
                  void savePerfumeVendor({ ...v, kind: k as PerfumeVendorKind, earn_pct: v.earn_pct == null ? null : Number(v.earn_pct) })
                    .then(() => qc.invalidateQueries({ queryKey: ["perfume"] }))
                    .then(() => pushToast(`${v.name}: ${KINDS.find(([kk]) => kk === k)?.[1]}`, "success"))
                    .catch((e) => pushToast(userFacingApiError(e, "Not changed"), "error"));
                }}
                options={KINDS.map(([k, l]) => ({ value: k, label: l }))} />
            </label>
          );
        })() : null}
        <label className="flex flex-col gap-1 text-gray-600">{tr("perfume.lists.25", "List date")}
          <DatePicker value={listDate} onChange={(v) => setListDate(v || listDate)} aria-label={tr("perfume.lists.26", "List date")} data-testid="perfume-import-list-date" className="w-[150px]" />
        </label>
        {read && read.sheets.length > 1 ? (
          <label className="flex flex-col gap-1 text-gray-600">{tr("perfume.lists.27", "Sheet")}
            <Combobox ariaLabel="Sheet" size="sm" value={String(sheetIx)} onChange={(v) => setSheetIx(Number(v ?? 0))} options={read.sheets.map((s, i) => ({ value: String(i), label: s.name }))} />
          </label>
        ) : null}
        {read && read.kind !== "pdf_text" && read.kind !== "image" ? (
          <label className="flex flex-col gap-1 text-gray-600">{tr("perfume.lists.28", "Header row")}
            <input type="number" min={1} className="h-[40px] w-[104px] rounded-sm border border-gray-300 px-2" value={headerRow + 1} onChange={(e) => setHeaderRow(Math.max(0, Number(e.target.value) - 1))} />
          </label>
        ) : null}
      </div>
      {isPictures ? (
        <div className="space-y-2 border-t border-gray-200 bg-[var(--surface-unselected)] p-2 text-xs" data-testid="perfume-picture-reader">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              <b>{(read?.pictures?.length ?? 0).toLocaleString()}</b> {tr("perfume.lists.pic1", "picture(s) / scanned page(s) ready. Claude reads each one; you check every line before anything is saved.")}
            </span>
            <Button type="button" className="h-[34px] px-3 text-xs" disabled={Boolean(reading)} onClick={() => void readPictures()} data-testid="perfume-read-pictures">
              {reading ? `${tr("perfume.lists.pic2", "Reading")} ${reading.done} / ${reading.total}…` : lines.length ? tr("perfume.lists.pic3", "Read again") : tr("perfume.lists.pic4", "Read with Claude")}
            </Button>
          </div>
          {lines.length ? (
            <>
              <div>
                {lines.length.toLocaleString()} {tr("perfume.lists.pic5", "lines read")} · {lines.filter((l) => l.include).length.toLocaleString()} {tr("perfume.lists.pic6", "approved")}
                {needPrice ? <b className="text-red-700"> · {needPrice} {tr("perfume.lists.pic7", "approved line(s) have no price — type it or untick the line")}</b> : null}
              </div>
              <ParityTable<PictureLine>
                rows={lines}
                rowKey={(l) => l.key}
                storageKey="perfume-desk-picture-lines-v1"
                hidePager
                columns={[
                  { key: "include", label: "Use", render: (l) => (
                    <input type="checkbox" aria-label={`Use line ${l.description}`} checked={l.include} onChange={(e) => editLine(l.key, { include: e.target.checked })} />) },
                  { key: "image_name", label: "Picture", sortable: true },
                  { key: "brand", label: "Brand", sortable: true, render: (l) => (
                    <input aria-label={tr("perfume.lists.pic9", "Brand")} className="h-[34px] w-[140px] rounded-sm border border-gray-300 px-2" value={l.brand ?? ""} onChange={(e) => editLine(l.key, { brand: e.target.value || null })} />) },
                  { key: "description", label: "Description", sortable: true, render: (l) => (
                    <input aria-label={tr("perfume.lists.pic10", "Description")} className="h-[34px] w-[300px] rounded-sm border border-gray-300 px-2" value={l.description} onChange={(e) => editLine(l.key, { description: e.target.value })} />) },
                  { key: "section", label: "Section", sortable: true },
                  { key: "price", label: "Price", sortable: true, cellClass: "text-right", render: (l) => (
                    <MoneyInput className="w-[110px]" ariaLabel={tr("perfume.lists.pic11", "Price")} valueCents={priceToCents(l.price ?? "")}
                      onChangeCents={(c) => editLine(l.key, { price: c == null || c <= 0 ? null : (c / 100).toFixed(2) })} />) },
                  { key: "note", label: "Reader note", sortable: true },
                ]}
              />
            </>
          ) : null}
        </div>
      ) : null}
      {read && read.kind !== "pdf_text" && read.kind !== "image" ? (
        <div className="grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
          {FIELDS.map(([f, label]) => (
            <label key={f} className="flex flex-col gap-1 text-gray-600">{label}
              <Combobox ariaLabel={label} size="sm" value={map[f] == null ? "" : String(map[f])} options={fieldOptions}
                onChange={(v) => setMap({ ...map, [f]: v === "" || v == null ? undefined : Number(v) })} />
            </label>
          ))}
        </div>
      ) : null}
      {extracted ? (
        <div className="space-y-2">
          <div className="text-xs text-gray-700">
            {isPictures ? tr("perfume.lists.pic8", "Approved from the pictures:") : tr("perfume.lists.29", "Read from the file:")} <b>{extracted.rowsRead.toLocaleString()}</b> {tr("perfume.lists.30", "priced lines · price total")} <b>{money(extracted.fileTotalCents)}</b>
            {extracted.sections ? ` · ${extracted.sections} section headers (WOMEN / MEN / SETS …) carried to the lines under them` : ""}
          </div>
          {isPictures ? null : <ParityTable
            rows={extracted.rows.slice(0, 8)}
            rowKey={(r) => String(r.row_no)}
            storageKey="perfume-desk-import-preview-v1"
            hidePager
            columns={[
              { key: "row_no", label: "Row" }, { key: "sku", label: "SKU" }, { key: "upc", label: "UPC" }, { key: "brand", label: "Brand" },
              { key: "description", label: "Description" }, { key: "section", label: "Section" },
              { key: "price", label: "Price", cellClass: "text-right tabular-nums", render: (r) => `$${r.price}` }, { key: "qty", label: "Qty" },
            ]}
          />}
          <label className="flex items-start gap-2 text-xs text-gray-700">
            <input type="checkbox" className="mt-0.5" checked={replaces} onChange={(e) => setReplaces(e.target.checked)} data-testid="perfume-import-replaces" />
            <span>
              <b>{tr("perfume.lists.31", "This is the vendor's full price list")}</b> {tr("perfume.lists.32", "— it replaces ALL their older lists: those are removed from Lists, the grid and review (kept only as the audit record). Untick for new arrivals / specials: the file is added next to their full list (the newest list wins when both carry an item) until their next full list replaces both.")}
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!vendorId || busy || !extracted.rows.length || needPrice > 0} onClick={() => void run(false)}>{tr("perfume.lists.33", "Check before saving")}</Button>
            <Button type="button" className="h-[34px] px-3 text-xs" disabled={!vendorId || busy || !extracted.rows.length || needPrice > 0} onClick={() => void run(true)}>{tr("perfume.lists.34", "Save list")}</Button>
          </div>
        </div>
      ) : null}
      {check ? <ImportCheckBox check={check} /> : null}
    </section>
  );
}

function ImportCheckBox({ check }: { check: PerfumeImportCheck }) {
  const ok = check.totals_match;
  const m = check.by_method;
  return (
    <div className={`rounded-sm border p-2 text-xs ${ok ? "border-slate-200 bg-slate-100" : "border-red-300 bg-red-50"}`} role="status">
      <div className="font-semibold">{ok ? "Import check passed — totals match to the cent" : "Import check FAILED — nothing was saved"}</div>
      <div>{tr("perfume.lists.35", "Lines read")} {check.rows_read.toLocaleString()} {tr("perfume.lists.36", "· saved")} {check.rows_saved.toLocaleString()} {tr("perfume.lists.37", "· skipped")} {check.rows_skipped.toLocaleString()}</div>
      <div>{tr("perfume.lists.38", "File price total")} {money(check.price_total_file_cents)} {tr("perfume.lists.39", "· saved price total")} {money(check.price_total_saved_cents)}</div>
      <div>
        {tr("perfume.lists.40", "Linked by UPC")} {m.upc ?? 0} {tr("perfume.lists.41", "· by SKU")} {m.sku ?? 0} {tr("perfume.lists.42", "· by your confirmed spelling")} {m.alias ?? 0} {tr("perfume.lists.43", "· by identity")} {(m.key ?? 0) + (m.loose_key ?? 0) + (m.name ?? 0)} {tr("perfume.lists.44", "· new items")} {check.items_created} {tr("perfume.lists.44b", "· corrected")} {check.items_renamed ?? 0} {tr("perfume.lists.44c", "· merged")} {check.items_merged ?? 0} {tr("perfume.lists.45", "· to review")} {check.review} {tr("perfume.lists.46", "· no match")} {check.unmatched}
        {check.upcs_on_two_products ? <b className="text-red-700"> · {check.upcs_on_two_products} {tr("perfume.lists.47", "UPC(s) the file prints on two different products — matched by name, not by that UPC")}</b> : null}
      </div>
    </div>
  );
}
