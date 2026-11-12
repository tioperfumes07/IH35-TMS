/** PERFUME-DESK — vendors, price lists, and the import engine with its to-the-cent import check. */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Combobox } from "../../components/Combobox";
import { ParityTable } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  listPerfumeLists, listPerfumeVendors, previewPerfumeImport, savePerfumeImport, savePerfumeVendor, setPerfumeListCurrent, voidPerfumeList,
  type PerfumeImportBody, type PerfumeImportCheck, type PerfumeList, type PerfumeVendor, type PerfumeVendorKind,
} from "../../api/perfume";
import { extractRows, FIELDS, findHeaderRow, guessMapping, readAnyFile, type Mapping, type ReadFile } from "./perfumeFileReaders";

const money = (c: unknown) => (c == null ? "—" : `$${(Number(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const KINDS: Array<[PerfumeVendorKind, string]> = [["buy", "I buy from them"], ["sell", "Laredo store I sell against"], ["both", "Both"]];

export function PerfumeListsPanel() {
  const vendors = useQuery({ queryKey: ["perfume", "vendors"], queryFn: listPerfumeVendors });
  const lists = useQuery({ queryKey: ["perfume", "lists"], queryFn: listPerfumeLists });
  return (
    <div className="space-y-4">
      <ImportCard vendors={vendors.data?.vendors ?? []} />
      <VendorsCard vendors={vendors.data?.vendors ?? []} />
      <section className="space-y-1" aria-label="Price lists on file">
        <div className="text-section-header">Price lists on file</div>
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
  if (reason == null) return <Button type="button" variant="secondary" className="h-[34px] px-2 text-xs" onClick={() => setReason("")}>Void</Button>;
  return (
    <span className="flex items-center gap-1">
      <input aria-label="Reason" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-[34px] w-[160px] rounded-sm border border-gray-300 px-2 text-xs" />
      <Button type="button" className="h-[34px] px-2 text-xs" disabled={reason.trim().length < 3} onClick={async () => {
        try { await voidPerfumeList(list.id, reason.trim()); await qc.invalidateQueries({ queryKey: ["perfume"] }); pushToast("List voided", "success"); }
        catch (e) { pushToast(userFacingApiError(e, "Not voided"), "error"); }
      }}>Save</Button>
      <Button type="button" variant="secondary" className="h-[34px] px-2 text-xs" onClick={() => setReason(null)}>Close</Button>
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
      <input type="number" step="0.05" min="0" placeholder="rule default" className="h-[40px] w-[120px] rounded-sm border border-gray-300 px-2 tabular-nums"
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
    <section className="space-y-1" aria-label="Vendors">
      <div className="flex items-center justify-between">
        <div className="text-section-header">Vendors & Laredo stores</div>
        <Button type="button" className="h-[34px] px-3 text-xs" onClick={() => setEdit({ kind: "buy" })}>Add vendor</Button>
      </div>
      {edit ? (
        <div className="flex flex-wrap items-end gap-2 rounded-sm border border-gray-200 bg-white p-2">
          <label className="flex flex-col gap-1 text-xs text-gray-600">Name
            <input className="h-[40px] w-[260px] rounded-sm border border-gray-300 px-2" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Perfume Center of America (Kanak)" />
          </label>
          <span className="flex flex-col gap-1 text-xs text-gray-600">Kind
            <span className="flex gap-1">{KINDS.map(([k, l]) => (
              <button key={k} type="button" aria-pressed={edit.kind === k} onClick={() => setEdit({ ...edit, kind: k })}
                className={`h-[40px] rounded-sm border px-2 ${edit.kind === k ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-300 bg-white"}`}>{l}</button>
            ))}</span>
          </span>
          {cents("cushion_lo_cents", "Cushion from $")}{cents("cushion_hi_cents", "to $")}
          {cents("freight_lo_cents", "Freight from $")}{cents("freight_hi_cents", "to $")}
          <label className="flex flex-col gap-1 text-xs text-gray-600">Earns %
            <input type="number" step="0.5" min="0" max="99" placeholder="rule default" className="h-[40px] w-[104px] rounded-sm border border-gray-300 px-2" value={edit.earn ?? (edit.earn_pct ?? "")} onChange={(e) => setEdit({ ...edit, earn: e.target.value })} />
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" checked={Boolean(edit.sells_by_box)} onChange={(e) => setEdit({ ...edit, sells_by_box: e.target.checked })} />Sells by full box only</label>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={!edit.name?.trim()} onClick={() => void save()}>Save</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => setEdit(null)}>Close</Button>
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
  const [read, setRead] = useState<ReadFile | null>(null);
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
  const extracted = useMemo(() => (sheet ? extractRows(sheet, headerRow, map) : null), [sheet, headerRow, map]);

  const open = async (f: File) => {
    setFile(f); setCheck(null);
    setReplaces(!/arrival|nuevo|new[-_ ]|special|promo|oferta|addend|supplement/i.test(f.name));
    try {
      const r = await readAnyFile(f);
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
    return { vendor_id: vendorId, list_date: listDate, file_name: file.name, source_kind: read.kind, rows_read: extracted.rowsRead, file_price_total_cents: extracted.fileTotalCents, rows: extracted.rows, replaces_current: replaces };
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
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" aria-label="Import a price list">
      <div className="text-section-header">Import a price list</div>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-1 text-gray-600">File (.xlsx · .xls · .csv · text PDF)
          <input type="file" accept=".xlsx,.xls,.csv,.pdf" className="h-[40px] text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (f) void open(f); }} />
        </label>
        <label className="flex flex-col gap-1 text-gray-600">Vendor
          <Combobox ariaLabel="Vendor" size="sm" value={vendorId} onChange={setVendorId} placeholder="Pick vendor"
            options={vendors.map((v) => ({ value: v.id, label: v.name, sublabel: KINDS.find(([k]) => k === v.kind)?.[1] }))} />
        </label>
        <label className="flex flex-col gap-1 text-gray-600">List date
          <input type="date" className="h-[40px] w-[132px] rounded-sm border border-gray-300 px-2" value={listDate} onChange={(e) => setListDate(e.target.value)} />
        </label>
        {read && read.sheets.length > 1 ? (
          <label className="flex flex-col gap-1 text-gray-600">Sheet
            <Combobox ariaLabel="Sheet" size="sm" value={String(sheetIx)} onChange={(v) => setSheetIx(Number(v ?? 0))} options={read.sheets.map((s, i) => ({ value: String(i), label: s.name }))} />
          </label>
        ) : null}
        {read && read.kind !== "pdf_text" ? (
          <label className="flex flex-col gap-1 text-gray-600">Header row
            <input type="number" min={1} className="h-[40px] w-[104px] rounded-sm border border-gray-300 px-2" value={headerRow + 1} onChange={(e) => setHeaderRow(Math.max(0, Number(e.target.value) - 1))} />
          </label>
        ) : null}
      </div>
      {read && read.kind !== "pdf_text" ? (
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
            Read from the file: <b>{extracted.rowsRead.toLocaleString()}</b> priced lines · price total <b>{money(extracted.fileTotalCents)}</b>
            {extracted.sections ? ` · ${extracted.sections} section headers (WOMEN / MEN / SETS …) carried to the lines under them` : ""}
          </div>
          <ParityTable
            rows={extracted.rows.slice(0, 8)}
            rowKey={(r) => String(r.row_no)}
            storageKey="perfume-desk-import-preview-v1"
            hidePager
            columns={[
              { key: "row_no", label: "Row" }, { key: "sku", label: "SKU" }, { key: "upc", label: "UPC" }, { key: "brand", label: "Brand" },
              { key: "description", label: "Description" }, { key: "section", label: "Section" },
              { key: "price", label: "Price", cellClass: "text-right tabular-nums", render: (r) => `$${r.price}` }, { key: "qty", label: "Qty" },
            ]}
          />
          <label className="flex items-start gap-2 text-xs text-gray-700">
            <input type="checkbox" className="mt-0.5" checked={replaces} onChange={(e) => setReplaces(e.target.checked)} data-testid="perfume-import-replaces" />
            <span>
              <b>This is the vendor&apos;s full price list</b> — it replaces their current list in the grid.
              Untick for new arrivals / specials: the file is added and their current list stays in the grid (the newest list wins when both carry an item).
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!vendorId || busy || !extracted.rows.length} onClick={() => void run(false)}>Check before saving</Button>
            <Button type="button" className="h-[34px] px-3 text-xs" disabled={!vendorId || busy || !extracted.rows.length} onClick={() => void run(true)}>Save list</Button>
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
    <div className={`rounded-sm border p-2 text-xs ${ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`} role="status">
      <div className="font-semibold">{ok ? "Import check passed — totals match to the cent" : "Import check FAILED — nothing was saved"}</div>
      <div>Lines read {check.rows_read.toLocaleString()} · saved {check.rows_saved.toLocaleString()} · skipped {check.rows_skipped.toLocaleString()}</div>
      <div>File price total {money(check.price_total_file_cents)} · saved price total {money(check.price_total_saved_cents)}</div>
      <div>
        Linked by UPC {m.upc ?? 0} · by SKU {m.sku ?? 0} · by your confirmed spelling {m.alias ?? 0} · by identity {(m.key ?? 0) + (m.loose_key ?? 0)} ·
        new items {check.items_created} · to review {check.review} · no match {check.unmatched}
      </div>
    </div>
  );
}
