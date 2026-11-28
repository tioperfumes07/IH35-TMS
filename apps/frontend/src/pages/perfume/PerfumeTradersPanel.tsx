/**
 * PERFUME-TRADERS — vendors you also sell to (design board 3, owner 2026-11-26 16:59 CT "ok get this all completely done now").
 * The trade board: an item a vendor offered moves offer received → buyers matched → offer sent → negotiating → closed / lost,
 * with its buy / sell price, quantity and the buyers matched to it. Beside it, read from what the app already holds:
 * which vendors carry which brands on their current price list, buyers seen on two or more vendors' emails, and whose
 * customer list reached the owner. Nothing is deleted — a trade or a buyer taken off is archived.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  addPerfumeTradeBuyer, archivePerfumeTrade, getPerfumeTraders, listPerfumeContacts, savePerfumeTrade, setPerfumeTradeStage, updatePerfumeTradeBuyer,
  type PerfumeTrade, type PerfumeTradeBuyer, type PerfumeTradeStage, type PerfumeTraders,
} from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { PerfumeHistoryTable } from "./PerfumeHistoryTable";
import { perfumeHistoryOf } from "../../api/perfume";

const DASH = "—";
const ctl = "h-[34px] rounded-sm border border-[#C6D1DC] bg-white px-2 text-xs";
const money = (c: number | null | undefined) => (c == null ? DASH : `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const usDate = (d: string | null | undefined) => (d ? `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}` : DASH);
const STAGES: Array<[PerfumeTradeStage, string]> = [
  ["offer_received", "Offer received"], ["buyers_matched", "Buyers matched"], ["offer_sent", "Offer sent"],
  ["negotiating", "Negotiating"], ["closed", "Closed"], ["lost", "Lost"],
];
const BUYER_STATUS: Array<[PerfumeTradeBuyer["status"], string]> = [["matched", "Matched"], ["offered", "Offered"], ["negotiating", "Negotiating"], ["won", "Won"], ["lost", "Lost"]];
const marginPct = (t: Pick<PerfumeTrade, "buy_cents" | "sell_cents">) =>
  t.buy_cents && t.sell_cents ? `${(((t.sell_cents - t.buy_cents) / t.sell_cents) * 100).toFixed(1)}%` : DASH;

/** A KPI card's drill: brings its section into view. */
export function jumpTo(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

type Common = PerfumeTraders["common_buyers"][number];
type Exposed = PerfumeTraders["exposed_lists"][number];
type MatrixRow = PerfumeTraders["matrix"][number];

export function PerfumeTradersPanel() {
  const { pushToast } = useToast();
  const [brands, setBrands] = useState<string[]>([]);
  const data = useQuery({ queryKey: ["perfume", "traders", brands], queryFn: () => getPerfumeTraders(brands) });
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const o = data.data;
  const k = o?.kpis;
  const trades = o?.trades ?? [];
  const move = async (t: PerfumeTrade, stage: PerfumeTradeStage) => {
    try { await setPerfumeTradeStage(t.id, stage); await data.refetch(); } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
  };

  if (data.isError) return <ListErrorState title={tr("perfume.trd.error", "Couldn't load the traders board")} status={0} message={(data.error as Error)?.message} onRetry={() => void data.refetch()} />;
  return (
    <div className="space-y-3" data-testid="perfume-traders-panel">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
        <KpiCard label={tr("perfume.trd.kpi_both", "Vendors I also sell to")} number={(k?.both ?? 0).toLocaleString()} to="/perfume?tab=vendors" />
        <KpiCard label={tr("perfume.trd.kpi_both_email", "… with an email")} number={(k?.both_with_email ?? 0).toLocaleString()} to="/perfume?tab=vendors" />
        <KpiCard label={tr("perfume.trd.kpi_sent_lists", "People who sent me lists")} number={(k?.sent_lists ?? 0).toLocaleString()} to="/perfume?tab=contacts" />
        <KpiCard label={tr("perfume.trd.kpi_exposed", "Exposed vendor lists")} number={(k?.exposed_lists ?? 0).toLocaleString()} onClick={() => jumpTo("perfume-trd-exposed")} />
        <KpiCard label={tr("perfume.trd.kpi_common", "Buyers on 2+ lists")} number={(k?.common_buyers ?? 0).toLocaleString()} onClick={() => jumpTo("perfume-trd-common")} />
        <KpiCard label={tr("perfume.trd.kpi_open", "Open trades")} number={(k?.open_trades ?? 0).toLocaleString()} onClick={() => jumpTo("perfume-trd-stages")} />
        <KpiCard label={tr("perfume.trd.kpi_closed", "Closed trades")} number={(k?.closed_trades ?? 0).toLocaleString()} onClick={() => jumpTo("perfume-trd-stage-closed")} />
      </div>

      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.trd.board", "Trade board")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-card-title">{tr("perfume.trd.board", "Trade board")}</div>
          <Button type="button" className="h-[34px] px-3 text-xs" data-testid="perfume-trd-add" onClick={() => setAdding(true)}>{tr("perfume.trd.add", "Add a trade")}</Button>
        </div>
        {adding ? <TradeForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void data.refetch(); }} /> : null}
        <div id="perfume-trd-stages" className="grid gap-2 md:grid-cols-3 xl:grid-cols-6" data-testid="perfume-trd-stages">
          {STAGES.map(([stage, label]) => {
            const here = trades.filter((t) => t.stage === stage);
            return (
              <div key={stage} id={`perfume-trd-stage-${stage}`} className="min-w-0 bg-[#F8FAFC] p-2" data-testid={`perfume-trd-stage-${stage}`}>
                <div className="mb-1 flex items-center justify-between text-xs font-semibold text-[#1F2A44]"><span>{tr(`perfume.trd.stage_${stage}`, label)}</span><span className="tabular-nums">{here.length}</span></div>
                <ul className="space-y-1">
                  {here.map((t) => (
                    <li key={t.id} className="rounded-sm border border-[#D8E0E8] bg-white p-2 text-xs" data-testid="perfume-trd-card">
                      <button type="button" className="block w-full text-left" onClick={() => setSelected(t.id)}>
                        <div className="font-semibold text-[#1F2A44]">{t.item}</div>
                        <div className="text-[#64748B]">{[t.brand, t.from_company ? `${tr("perfume.trd.from", "from")} ${t.from_company}` : ""].filter(Boolean).join(" · ") || DASH}</div>
                        <div className="tabular-nums">{`${money(t.buy_cents)} → ${money(t.sell_cents)} · ${marginPct(t)}${t.qty ? ` · ${t.qty.toLocaleString()} ${tr("perfume.trd.units", "units")}` : ""}`}</div>
                        <div className="text-[#64748B]">{`${t.buyers.length} ${tr("perfume.trd.buyers", "buyers")}${t.closed_on ? ` · ${tr("perfume.trd.closed_on", "closed")} ${usDate(t.closed_on)}` : ""}`}</div>
                      </button>
                      <select aria-label={`${tr("perfume.trd.move", "Move")} ${t.item}`} className={`${ctl} mt-1 w-full`} value={t.stage} onChange={(e) => void move(t, e.target.value as PerfumeTradeStage)}>
                        {STAGES.map(([s, l]) => <option key={s} value={s}>{tr(`perfume.trd.stage_${s}`, l)}</option>)}
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
      {selected ? <TradeDetail trade={trades.find((t) => t.id === selected) ?? null} onClose={() => setSelected(null)} onChanged={() => void data.refetch()} /> : null}

      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.trd.matrix", "Who carries which brands")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-card-title">{tr("perfume.trd.matrix", "Who carries which brands")}</div>
            <div className="text-xs text-[#64748B]">{tr("perfume.trd.matrix_note", "Lines on each vendor's current price list. With no brand picked: the 8 brands the most vendors carry.")}</div>
          </div>
          <MultiSelectDropdown label={tr("perfume.trd.brands", "Brands")} allLabel={tr("perfume.trd.top_brands", "Top 8 brands")} searchable data-testid="perfume-trd-brands"
            options={(o?.brand_options ?? []).map((b) => ({ value: b.brand, label: `${b.brand} (${b.vendors})` }))} selected={brands} onChange={setBrands} />
        </div>
        <ParityTable<MatrixRow> selectable
          rows={o?.matrix ?? []}
          rowKey={(r) => r.vendor_id}
          loading={data.isLoading}
          storageKey="perfume-traders-matrix-v1"

          exportFilename="TIO traders matrix"

          exportExcel
          suppressToolbarSearch
          emptyText="No current price list carries these brands."
          columns={[
            { key: "vendor", label: "Vendor", sortable: true, render: (r) => <span className="font-semibold">{r.vendor}</span> },
            { key: "carried", label: "Brands carried", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => `${r.carried} / ${o?.matrix_brands.length ?? 0}` },
            ...(o?.matrix_brands ?? []).map((b) => ({
              key: `b_${b}`, label: b, cellClass: "text-right tabular-nums", render: (r: MatrixRow) => (r.brands[b] ? r.brands[b]!.toLocaleString() : DASH),
            })),
          ]}
        />
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <section id="perfume-trd-common" className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.trd.common", "Buyers on several exposed lists")}>
          <ParityTable<Common> selectable
            cardTitle title={tr("perfume.trd.common", "Buyers on several exposed lists")}
            rows={o?.common_buyers ?? []}
            rowKey={(r) => r.id}
            loading={data.isLoading}
            storageKey="perfume-traders-common-v1"

            exportFilename="TIO traders common"

            exportExcel
            emptyText="No buyer has been copied on two vendors' emails yet."
            columns={[
              { key: "name", label: "Buyer", sortable: true, render: (r) => <span className="font-semibold">{r.name}</span> },
              { key: "lists", label: "Lists", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.lists.toLocaleString() },
              { key: "senders", label: "Copied by", render: (r) => r.senders.join(", ") },
              { key: "city", label: "City", sortable: true, render: (r) => [r.city, r.country].filter(Boolean).join(", ") || DASH },
              { key: "role", label: "Role", sortable: true, render: (r) => r.role ?? DASH },
            ]}
          />
        </section>
        <section id="perfume-trd-exposed" className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.trd.exposed", "Exposed vendor lists")}>
          <ParityTable<Exposed> selectable
            cardTitle title={tr("perfume.trd.exposed", "Exposed vendor lists")}
            rows={o?.exposed_lists ?? []}
            rowKey={(r) => r.sender}
            loading={data.isLoading}
            storageKey="perfume-traders-exposed-v1"

            exportFilename="TIO traders exposed"

            exportExcel
            emptyText="No vendor email with its customers copied has been read yet."
            columns={[
              { key: "sender", label: "Whose list", sortable: true, render: (r) => <span className="font-semibold">{r.sender}</span> },
              { key: "buyers", label: "Buyers shown", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.buyers.toLocaleString() },
              { key: "first_on", label: "First list date", sortable: true, render: (r) => usDate(r.first_on) },
              { key: "last_on", label: "Last list date", sortable: true, render: (r) => usDate(r.last_on) },
            ]}
          />
        </section>
      </div>
    </div>
  );
}

/** A company picked from the contacts database (type at least 2 letters). */
function CompanyPick({ placeholder, onPick, testId }: { placeholder: string; onPick: (id: string, name: string) => void; testId: string }) {
  const [find, setFind] = useState("");
  const found = useQuery({ queryKey: ["perfume", "contacts", "pick", find], queryFn: () => listPerfumeContacts({ q: find, limit: 20 }), enabled: find.trim().length >= 2 });
  return (
    <div className="relative">
      <input type="search" className={`${ctl} w-full max-w-[420px]`} placeholder={placeholder} value={find} onChange={(e) => setFind(e.target.value)} data-testid={testId} />
      {find.trim().length >= 2 && (found.data?.rows?.length ?? 0) > 0 ? (
        <div className="absolute z-20 mt-1 max-h-64 w-full max-w-[420px] overflow-y-auto border border-gray-300 bg-white shadow-lg" role="listbox">
          {found.data!.rows.map((r) => (
            <button key={r.id} type="button" role="option" aria-selected={false} className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-100"
              onClick={() => { onPick(r.id, r.name); setFind(""); }} data-testid={`${testId}-${r.id}`}>
              <span className="font-semibold">{r.name}</span> <span className="text-[#64748B]">{[r.role, r.city, r.country].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TradeForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { pushToast } = useToast();
  const [f, setF] = useState({ item: "", brand: "", upc: "", note: "", qty: "" });
  const [buy, setBuy] = useState<number | null>(null);
  const [sell, setSell] = useState<number | null>(null);
  const [from, setFrom] = useState<{ id: string; name: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    try {
      await savePerfumeTrade({ item: f.item.trim(), brand: f.brand || null, upc: f.upc || null, from_company_id: from?.id ?? null,
        buy_cents: buy || null, sell_cents: sell || null, qty: f.qty ? Number(f.qty) : null, note: f.note || null, stage: "offer_received" });
      pushToast(`${f.item} added`, "success"); onSaved();
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
  };
  return (
    <div className="space-y-2 border-t border-[#E8EDF2] pt-2" data-testid="perfume-trd-form">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">{tr("perfume.trd.f_item", "Item")}<input className={`${ctl} block w-[260px]`} value={f.item} onChange={set("item")} data-testid="perfume-trd-f-item" /></label>
        <label className="text-xs">{tr("perfume.trd.f_brand", "Brand")}<input className={`${ctl} block`} value={f.brand} onChange={set("brand")} /></label>
        <label className="text-xs">{tr("perfume.trd.f_upc", "UPC")}<input className={`${ctl} block w-[150px]`} inputMode="numeric" value={f.upc} onChange={set("upc")} /></label>
        <label className="text-xs">{tr("perfume.trd.f_buy", "Buy price")}<MoneyInput className={`${ctl} block w-[120px]`} valueCents={buy} onChangeCents={setBuy} ariaLabel={tr("perfume.trd.f_buy", "Buy price")} /></label>
        <label className="text-xs">{tr("perfume.trd.f_sell", "Sell price")}<MoneyInput className={`${ctl} block w-[120px]`} valueCents={sell} onChangeCents={setSell} ariaLabel={tr("perfume.trd.f_sell", "Sell price")} /></label>
        <label className="text-xs">{tr("perfume.trd.f_qty", "Quantity")}<input type="number" min={1} className={`${ctl} block w-[110px]`} value={f.qty} onChange={set("qty")} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[260px] flex-1">
          {from ? <div className="text-xs">{tr("perfume.trd.f_from", "Offered by")}: <span className="font-semibold">{from.name}</span> <button type="button" className="ml-1 text-xs underline" onClick={() => setFrom(null)}>{tr("perfume.trd.change", "change")}</button></div>
            : <CompanyPick placeholder={tr("perfume.trd.f_from_ph", "Offered by — type the vendor's company")} onPick={(id, name) => setFrom({ id, name })} testId="perfume-trd-f-from" />}
        </div>
        <input className={`${ctl} min-w-[200px] flex-1`} placeholder={tr("perfume.trd.f_note", "Note")} value={f.note} onChange={set("note")} />
        <Button type="button" className="h-[34px] px-3 text-xs" disabled={!f.item.trim()} onClick={() => void save()} data-testid="perfume-trd-f-save">{tr("perfume.trd.save", "Save")}</Button>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.trd.cancel", "Cancel")}</Button>
      </div>
    </div>
  );
}

function TradeDetail({ trade, onClose, onChanged }: { trade: PerfumeTrade | null; onClose: () => void; onChanged: () => void }) {
  const { pushToast } = useToast();
  const history = useQuery({ queryKey: ["perfume", "trade", trade?.id, "history", trade?.updated_at, trade?.buyers.length], queryFn: () => perfumeHistoryOf("trades", trade!.id), enabled: Boolean(trade) });
  if (!trade) return null;
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); onChanged(); if (ok) pushToast(ok, "success"); } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
  };
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-trd-detail" aria-label={trade.item}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-card-title">{trade.item}</div>
          <div className="text-xs text-[#64748B]">{[trade.brand, trade.upc ? `UPC ${trade.upc}` : "", trade.from_company ? `${tr("perfume.trd.from", "from")} ${trade.from_company}` : "",
            `${money(trade.buy_cents)} → ${money(trade.sell_cents)} (${marginPct(trade)})`, trade.qty ? `${trade.qty.toLocaleString()} ${tr("perfume.trd.units", "units")}` : "", trade.note ?? ""].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => void act(async () => { await archivePerfumeTrade(trade.id); onClose(); }, `${trade.item} archived`)}>{tr("perfume.trd.archive", "Archive trade")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.trd.close", "Close")}</Button>
        </div>
      </div>
      <CompanyPick placeholder={tr("perfume.trd.add_buyer", "Match a buyer — type a company, person, email or city")} testId="perfume-trd-buyer-find"
        onPick={(id, name) => void act(() => addPerfumeTradeBuyer(trade.id, { company_id: id, offer_cents: trade.sell_cents }), `${name} matched`)} />
      <ParityTable<PerfumeTradeBuyer> selectable
        cardTitle title={tr("perfume.trd.buyers_title", "Buyers matched to this trade")}
        rows={trade.buyers}
        rowKey={(b) => b.id}
        storageKey="perfume-trade-buyers-v1"

        exportFilename="TIO trade buyers"

        exportExcel
        suppressToolbarSearch
        emptyText="No buyer matched yet."
        columns={[
          { key: "company", label: "Buyer", sortable: true, render: (b) => <span className="font-semibold">{b.company}</span> },
          { key: "status", label: "Where it stands", sortable: true, render: (b) => (
            <select aria-label={`${tr("perfume.trd.status_of", "Status of")} ${b.company}`} className={ctl} value={b.status}
              onChange={(e) => void act(() => updatePerfumeTradeBuyer(b.id, { status: e.target.value as PerfumeTradeBuyer["status"] }))}>
              {BUYER_STATUS.map(([s, l]) => <option key={s} value={s}>{tr(`perfume.trd.bs_${s}`, l)}</option>)}
            </select>) },
          { key: "offer_cents", label: "My offer", sortable: true, cellClass: "text-right tabular-nums", render: (b) => (
            <BuyerOffer buyer={b} onSave={(v) => void act(() => updatePerfumeTradeBuyer(b.id, { offer_cents: v }))} />) },
          { key: "note", label: "Note", render: (b) => b.note ?? DASH },
          { key: "remove", label: "", render: (b) => (
            <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={() => void act(() => updatePerfumeTradeBuyer(b.id, { archived: true }), `${b.company} taken off`)}>
              {tr("perfume.trd.take_off", "Take off")}</Button>) },
        ]}
      />
      <PerfumeHistoryTable events={history.data?.events ?? []} loading={history.isLoading} storageKey="perfume-trade-history-v1" exportName="TIO trade history" />
    </section>
  );
}

/** The offer to one buyer: typed freely, saved once when the box is left. */
function BuyerOffer({ buyer, onSave }: { buyer: PerfumeTradeBuyer; onSave: (cents: number | null) => void }) {
  const [v, setV] = useState<number | null>(buyer.offer_cents);
  return (
    <span onBlur={() => { if ((v || null) !== buyer.offer_cents) onSave(v || null); }}>
      <MoneyInput className={`${ctl} w-[110px]`} valueCents={v} onChangeCents={setV} ariaLabel={`${tr("perfume.trd.offer_to", "Offer to")} ${buyer.company}`} />
    </span>
  );
}
