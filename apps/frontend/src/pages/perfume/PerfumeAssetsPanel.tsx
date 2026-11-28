/**
 * TIO Perfumes · Books · Fixed assets — ROUND L.31 M14 (owner 2026-11-27 19:38 CT "ASSETS … ALL FULLY COMPLETELY DONE"). ScentsX LLC's
 * fixed asset register on the ONE fixed-assets engine: register a fixture / furniture / computer / leasehold improvement in its class
 * (1500 Store Fixtures & Equipment / 1600 Accumulated Depreciation / 6800 Depreciation Expense, migration 202617230100), see cost,
 * depreciation to date and book value, and post a month's depreciation through the existing FIN-21 poster (Dr 6800 / Cr 1600). The
 * purchase itself is the bill / expense / check coded to 1500 — registering posts nothing. QuickBooks-style pop-up.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { formatUsdCents } from "../../lib/money";
import { getFixedAssetClasses, getFixedAssets, postAssetDepreciation, registerFixedAsset, type FixedAssetListItem } from "../../api/fixed-assets";
import { getScentsxCompany } from "../../api/scentsx";
import { tr } from "./perfumeI18n";
import { ctl, DASH, usDate } from "./perfumeDocParts";

const todayCT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

export function PerfumeAssetsPanel() {
  const { pushToast } = useToast();
  const co = useQuery({ queryKey: ["scentsx", "company"], queryFn: getScentsxCompany });
  const id = co.data?.company.id ?? "";
  const list = useQuery({ queryKey: ["scentsx", "assets", id], queryFn: () => getFixedAssets({ operating_company_id: id, limit: 200 }), enabled: Boolean(id) });
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = list.data?.items ?? [];
  const post = async (a: FixedAssetListItem) => {
    setBusy(a.id);
    try {
      const r = await postAssetDepreciation(id, a.id, todayCT());
      pushToast(r.result === "posted" ? `${a.name}: depreciation posted (Dr 6800 / Cr 1600)` : `${a.name}: ${r.result.replace(/_/g, " ")}`, r.result === "posted" ? "success" : "info");
      await list.refetch();
    } catch (e) { pushToast(userFacingApiError(e, "Not posted"), "error"); } finally { setBusy(null); }
  };
  if (co.isError) return <ListErrorState title={tr("scentsx.fa.co_error", "Couldn't load ScentsX")} status={0} message={(co.error as Error)?.message} onRetry={() => void co.refetch()} />;
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-assets-panel" aria-label={tr("scentsx.fa.title", "Fixed assets")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-card-title">{tr("scentsx.fa.title", "Fixed assets")} · {co.data?.company.legal_name ?? "ScentsX"}</div>
        <Button type="button" className="h-[34px] px-3 text-xs" disabled={!id} onClick={() => setAdding(true)} data-testid="scentsx-fa-new">{tr("scentsx.fa.new", "+ Register asset")}</Button>
      </div>
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-4">
        <KpiCard label={tr("scentsx.fa.kpi_n", "Assets")} number={String(rows.length)} disabled />
        <KpiCard label={tr("scentsx.fa.kpi_cost", "Cost")} number={formatUsdCents(rows.reduce((s, a) => s + Number(a.purchase_price_cents), 0))} disabled />
        <KpiCard label={tr("scentsx.fa.kpi_dep", "Depreciation to date")} number={formatUsdCents(rows.reduce((s, a) => s + Number(a.depreciation_to_date_cents), 0))} disabled />
        <KpiCard label={tr("scentsx.fa.kpi_nbv", "Book value")} number={formatUsdCents(rows.reduce((s, a) => s + Number(a.net_book_value_cents), 0))} disabled />
      </div>
      {list.isError ? <ListErrorState title={tr("scentsx.fa.error", "Couldn't load the assets")} status={0} message={(list.error as Error)?.message} onRetry={() => void list.refetch()} /> : (
        <ParityTable<FixedAssetListItem> selectable
          rows={rows} rowKey={(a) => a.id} loading={list.isLoading || co.isLoading} storageKey="scentsx-fa-v1" exportFilename="ScentsX fixed assets" exportExcel
          emptyText="No fixed assets yet — register fixtures, furniture or computers as you buy them."
          columns={[
            { className: "text-left", cellClass: "text-left", key: "asset_number", label: "No.", sortable: true, render: (a) => a.asset_number ?? DASH, exportValue: (a) => a.asset_number ?? "" },
            { className: "text-left", cellClass: "text-left font-semibold", key: "name", label: "Asset", sortable: true, render: (a) => a.name, exportValue: (a) => a.name },
            { className: "text-left", cellClass: "text-left", key: "class_name", label: "Class", sortable: true, render: (a) => a.class_name ?? DASH, exportValue: (a) => a.class_name ?? "" },
            { key: "in_service_date", label: "In service", sortable: true, cellClass: "text-right tabular-nums", render: (a) => usDate(a.in_service_date), exportValue: (a) => a.in_service_date },
            { key: "useful_life_months", label: "Life (months)", kind: "number", cellClass: "text-right tabular-nums", render: (a) => String(a.useful_life_months) },
            { key: "purchase_price_cents", label: "Cost", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (a) => formatUsdCents(a.purchase_price_cents), exportValue: (a) => a.purchase_price_cents / 100 },
            { key: "depreciation_to_date_cents", label: "Depreciation to date", kind: "number", cellClass: "text-right tabular-nums", render: (a) => formatUsdCents(a.depreciation_to_date_cents), exportValue: (a) => a.depreciation_to_date_cents / 100 },
            { key: "net_book_value_cents", label: "Book value", kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (a) => formatUsdCents(a.net_book_value_cents), exportValue: (a) => a.net_book_value_cents / 100 },
            { className: "text-left", cellClass: "text-left", key: "status", label: "Status", render: (a) => a.status.replace(/_/g, " "), exportValue: (a) => a.status },
            { key: "post", label: "", render: (a) => (a.status === "active" ? <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" disabled={busy === a.id} onClick={() => void post(a)} data-testid={`scentsx-fa-post-${a.id}`}>{tr("scentsx.fa.post", "Post depreciation")}</Button> : DASH) },
          ]}
        />
      )}
      {adding ? <RegisterModal companyId={id} onClose={() => setAdding(false)} onDone={() => { setAdding(false); void list.refetch(); }} /> : null}
    </section>
  );
}

function RegisterModal({ companyId, onClose, onDone }: { companyId: string; onClose: () => void; onDone: () => void }) {
  const { pushToast } = useToast();
  const classes = useQuery({ queryKey: ["scentsx", "fa-classes", companyId], queryFn: () => getFixedAssetClasses(companyId) });
  const [v, setV] = useState({ class_id: "", name: "", asset_number: "", serial: "", life: "", purchase_date: todayCT(), in_service_date: todayCT() });
  const [cost, setCost] = useState<number | null>(null);
  const [salvage, setSalvage] = useState<number | null>(0);
  const [busy, setBusy] = useState(false);
  const cls = classes.data?.classes.find((c) => c.id === v.class_id);
  const ok = v.class_id && v.name.trim() && (cost ?? 0) > 0 && (salvage ?? 0) <= (cost ?? 0) && v.in_service_date >= v.purchase_date;
  const save = async () => {
    setBusy(true);
    try {
      await registerFixedAsset({ operating_company_id: companyId, class_id: v.class_id, name: v.name.trim(), asset_number: v.asset_number.trim() || null, serial: v.serial.trim() || null,
        purchase_price_cents: cost!, salvage_value_cents: salvage ?? 0, purchase_date: v.purchase_date, in_service_date: v.in_service_date,
        useful_life_months: v.life.trim() ? Number(v.life) : undefined });
      pushToast(`${v.name.trim()} registered`, "success"); onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Not registered"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={tr("scentsx.fa.register", "Register a fixed asset")} size="md" data-testid="scentsx-fa-modal">
      <div className="space-y-3 text-xs">
        <div className="grid gap-2 md:grid-cols-2">
          <label className="block">{tr("scentsx.fa.class", "Class")} *
            <select className={`${ctl} block w-full`} value={v.class_id} onChange={(e) => setV({ ...v, class_id: e.target.value })} data-testid="scentsx-fa-class">
              <option value="">{tr("scentsx.fa.pick", "Pick a class…")}</option>
              {(classes.data?.classes ?? []).map((c) => <option key={c.id} value={c.id}>{`${c.class_name} · ${Math.round(c.default_useful_life_months / 12)} years`}</option>)}
            </select>
          </label>
          <label className="block">{tr("scentsx.fa.name", "Asset")} *<input className={`${ctl} block w-full`} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} data-testid="scentsx-fa-name" /></label>
          <label className="block">{tr("scentsx.fa.number", "Asset no.")}<input className={`${ctl} block w-full`} value={v.asset_number} onChange={(e) => setV({ ...v, asset_number: e.target.value })} /></label>
          <label className="block">{tr("scentsx.fa.serial", "Serial")}<input className={`${ctl} block w-full`} value={v.serial} onChange={(e) => setV({ ...v, serial: e.target.value })} /></label>
          <label className="block">{tr("scentsx.fa.cost", "Cost")} *<MoneyInput className="block w-[160px]" ariaLabel="Cost" valueCents={cost} onChangeCents={setCost} /></label>
          <label className="block">{tr("scentsx.fa.salvage", "Salvage value")}<MoneyInput className="block w-[160px]" ariaLabel="Salvage value" valueCents={salvage} onChangeCents={setSalvage} /></label>
          <label className="block">{tr("scentsx.fa.bought", "Purchased")}<DatePicker aria-label="Purchase date" value={v.purchase_date} onChange={(x) => setV({ ...v, purchase_date: x || todayCT() })} /></label>
          <label className="block">{tr("scentsx.fa.in_service", "In service")}<DatePicker aria-label="In service date" value={v.in_service_date} onChange={(x) => setV({ ...v, in_service_date: x || todayCT() })} /></label>
          <label className="block">{tr("scentsx.fa.life", "Life in months")}<input type="number" min={1} className={`${ctl} block w-[120px] text-right`} placeholder={cls ? String(cls.default_useful_life_months) : ""} aria-label="Life in months" value={v.life} onChange={(e) => setV({ ...v, life: e.target.value })} /></label>
        </div>
        <p className="text-[#64748B]">{tr("scentsx.fa.note", "Registering posts nothing. Record the purchase as a bill, expense or check to 1500 Store Fixtures & Equipment; depreciation posts Dr 6800 / Cr 1600 each month you press Post.")}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("scentsx.fa.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void save()} data-testid="scentsx-fa-save">{tr("scentsx.fa.save", "Register")}</Button>
        </div>
      </div>
    </Modal>
  );
}
