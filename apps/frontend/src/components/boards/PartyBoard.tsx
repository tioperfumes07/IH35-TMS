/**
 * ROUND 326.5 — the Customers and Vendors list boards, built to docs/design/boards/driver-customers-vendors/
 * Customers.dc.html and Vendors.dc.html: header + six KPI tiles across, chip filters with live counts, range /
 * aging (customers) or category tokens (vendors), search over every record, Regular / Master-detail toggle,
 * Export, gear column chooser, sortable table with a totals footer, and the live "surfaces something" note.
 * Every figure comes from GET /api/v1/mdata/boards/:kind — nothing on this screen is a board constant.
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ApiError, apiRequest } from "../../api/client";
import { formatDateUS } from "../../lib/formatDate";
import { ListErrorState } from "../ListErrorState";
import "../../design/ih35-design-tokens.css";
import "./party-board.css";

export type PartyKind = "customers" | "vendors";
type Range = "ytd" | "12m" | "all";

type CustomerRow = {
  id: string; name: string; status: string; factored: string | null; invoices: number; billed_cents: number;
  collected_cents: number; open_cents: number; paid_invoices: number; last_invoice: string | null;
  aging: { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number };
};
type VendorRow = {
  id: string; name: string; status: string; category: string | null; txns: number; spend_cents: number;
  avg_ticket_cents: number | null; last_paid: string | null; pays_through: string | null; open_bills: number; open_bills_cents: number;
};
type CustomerBoard = {
  kpis: { with_transactions: number; in_the_book: number; open_invoices: number; billed_cents: number; ar_open_cents: number; collected_cents: number; invoices: number; invoices_with_payment: number };
  chips: { with_transactions: number; open_balance: number; factored: number; all: number };
  rows: CustomerRow[];
};
type VendorBoard = {
  kpis: { with_transactions: number; in_the_book: number; spend_cents: number; fuel_share_pct: number | null; open_bills_cents: number | null; unposted_fuel_cents: number; unposted_fuel_count: number; unposted_fuel_since: string | null; transactions: number; top_vendor: { name: string; txns: number; spend_cents: number; share_pct: number | null } | null };
  chips: { with_transactions: number; open_bills: number; all: number };
  rows: VendorRow[];
};

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const int = (n: number) => n.toLocaleString("en-US");
/** Missing renders as — (owner design law 7): never $0.00 for "no money", never 0 for "no data". */
const money = (cents: number | null | undefined) => (cents ? usd(cents) : "—");
const day = (d: string | null) => (d ? formatDateUS(d) : "—");

type Col<R> = { key: string; label: string; num?: boolean; width?: number; sort: (r: R) => string | number; cell: (r: R) => ReactNode; foot?: ReactNode };

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

function readHidden(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function downloadCsv(filename: string, header: string[], rows: Array<Array<string | number>>) {
  const esc = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const blob = new Blob([[header, ...rows].map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function BoardTable<R extends { id: string }>(props: {
  storageKey: string; cols: Array<Col<R>>; rows: R[]; footLabel: string; onOpen: (r: R) => void; exportName: string; exportRef: React.MutableRefObject<() => void>;
  gearOpen: boolean;
}) {
  const [hidden, setHidden] = useState<string[]>(() => readHidden(props.storageKey));
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const visible = props.cols.filter((c) => !hidden.includes(c.key));
  const sorted = useMemo(() => {
    if (!sort) return props.rows;
    const col = props.cols.find((c) => c.key === sort.key);
    if (!col) return props.rows;
    return [...props.rows].sort((a, b) => {
      const x = col.sort(a), y = col.sort(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [props.rows, props.cols, sort]);
  props.exportRef.current = () =>
    downloadCsv(props.exportName, visible.map((c) => c.label), sorted.map((r) => visible.map((c) => { const v = c.sort(r); return typeof v === "number" && c.num ? v : String(v ?? ""); })));
  const toggle = (key: string) => {
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    setHidden(next);
    try { localStorage.setItem(props.storageKey, JSON.stringify(next)); } catch { /* per-viewer convenience only */ }
  };
  return (
    <>
      {props.gearOpen ? (
        <div className="pb-menu" data-testid="party-board-columns" role="dialog" aria-label="Choose columns">
          {props.cols.map((c, i) => (
            <label key={c.key}><input type="checkbox" checked={!hidden.includes(c.key)} disabled={i === 0} onChange={() => toggle(c.key)} />{c.label}</label>
          ))}
        </div>
      ) : null}
      <div className="pb-card">
        <table className="ih-table">
          <thead>
            <tr>
              {visible.map((c) => (
                <th key={c.key} className="ih-hd pb-th" style={{ textAlign: c.num ? "right" : "left", width: c.width }}
                  aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: c.num ? -1 : 1 }))}>
                  {c.label}{sort?.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                {visible.map((c, i) => (
                  <td key={c.key} className={c.num ? "ih-num" : undefined}>
                    {i === 0 ? <button type="button" className="pb-name" onClick={() => props.onOpen(r)}>{c.cell(r)}</button> : c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr><td colSpan={visible.length} className="pb-muted">Nothing matches this filter.</td></tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="pb-foot">
              {visible.map((c, i) => (
                <td key={c.key} className={c.num ? "ih-num" : undefined}>{i === 0 ? props.footLabel : c.foot ?? null}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

export function PartyBoard(props: { kind: PartyKind; operatingCompanyId: string; onMasterDetail: () => void; onCreate: () => void }) {
  const navigate = useNavigate();
  const isCustomers = props.kind === "customers";
  const [range, setRange] = useState<Range>("ytd");
  const [chip, setChip] = useState<string>("with_transactions");
  const [aging, setAging] = useState<string>("all");
  const [cats, setCats] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [gearOpen, setGearOpen] = useState(false);
  const exportRef = useRef<() => void>(() => undefined);
  const q = useQuery({
    queryKey: ["party-board", props.kind, props.operatingCompanyId, range],
    queryFn: () => apiRequest<CustomerBoard | VendorBoard>(`/api/v1/mdata/boards/${props.kind}?operating_company_id=${props.operatingCompanyId}&range=${range}`),
  });
  const data = q.data;
  const term = search.trim().toLowerCase();

  if (q.isError) {
    const status = q.error instanceof ApiError ? q.error.status : 0;
    return <ListErrorState status={status} message={`Could not load ${props.kind}.`} onRetry={() => void q.refetch()} />;
  }

  const title = isCustomers ? "Customers" : "Vendors";
  const sub = isCustomers ? "The list opens on the customers you actually do business with" : "The list opens on the vendors you actually pay";
  const all = data?.chips.all ?? 0;

  let tiles: Array<{ label: string; value: string; tone?: "navy" | "red" | "amber" }> = [];
  let chips: Array<{ id: string; label: string; n: number }> = [];
  let table: ReactNode = null;
  let note: ReactNode = null;

  if (data && isCustomers) {
    const b = data as CustomerBoard;
    tiles = [
      { label: "With transactions", value: int(b.kpis.with_transactions), tone: "navy" },
      { label: "In the book", value: int(b.kpis.in_the_book) },
      { label: "Open invoices", value: int(b.kpis.open_invoices) },
      { label: "Billed", value: money(b.kpis.billed_cents) },
      { label: "A/R open", value: money(b.kpis.ar_open_cents), tone: "red" },
      { label: "Collected", value: money(b.kpis.collected_cents) },
    ];
    chips = [
      { id: "with_transactions", label: "With transactions", n: b.chips.with_transactions },
      { id: "open_balance", label: "Open balance", n: b.chips.open_balance },
      { id: "factored", label: "Factored", n: b.chips.factored },
      { id: "all", label: "All", n: b.chips.all },
    ];
    const agingKey = aging as keyof CustomerRow["aging"];
    const rows = b.rows.filter((r) =>
      (term ? r.name.toLowerCase().includes(term) : chip === "with_transactions" ? r.invoices > 0 : chip === "open_balance" ? r.open_cents > 0 : chip === "factored" ? r.factored != null : true)
      && (aging === "all" || (r.aging[agingKey] ?? 0) > 0));
    const sum = (k: "invoices" | "billed_cents" | "collected_cents" | "open_cents") => rows.reduce((s, r) => s + r[k], 0);
    const cols: Array<Col<CustomerRow>> = [
      { key: "name", label: "Customer", sort: (r) => r.name, cell: (r) => r.name },
      { key: "invoices", label: "Invoices", num: true, width: 82, sort: (r) => r.invoices, cell: (r) => (r.invoices ? int(r.invoices) : <span className="ih-empty">—</span>), foot: int(sum("invoices")) },
      { key: "billed", label: "Billed", num: true, width: 122, sort: (r) => r.billed_cents, cell: (r) => money(r.billed_cents), foot: money(sum("billed_cents")) },
      { key: "collected", label: "Collected", num: true, width: 122, sort: (r) => r.collected_cents, cell: (r) => (r.collected_cents ? usd(r.collected_cents) : <span className="ih-empty">—</span>), foot: money(sum("collected_cents")) },
      { key: "open", label: "Open balance", num: true, width: 130, sort: (r) => r.open_cents, cell: (r) => <span className="pb-strong">{money(r.open_cents)}</span>, foot: money(sum("open_cents")) },
      { key: "last", label: "Last invoice", num: true, width: 104, sort: (r) => r.last_invoice ?? "", cell: (r) => <span className="pb-muted">{day(r.last_invoice)}</span> },
      { key: "factored", label: "Factored", width: 108, sort: (r) => r.factored ?? "", cell: (r) => <span className="pb-muted2">{r.factored ?? "—"}</span> },
      { key: "status", label: "Status", width: 96, sort: (r) => r.status, cell: (r) => <span className="pb-status">{r.status}</span> },
    ];
    table = (
      <BoardTable storageKey="party-board-cols-customers" cols={cols} rows={rows} exportRef={exportRef} exportName="customers.csv" gearOpen={gearOpen}
        footLabel={`${int(rows.length)} ${chip === "with_transactions" && !term ? "customers with transactions" : "customers"}`}
        onOpen={(r) => navigate(`/customers/${r.id}`)} />
    );
    if (b.kpis.invoices > 0) {
      note = (
        <div className="pb-note" data-testid="party-board-note">
          <div className="pb-note-t">This screen surfaces something you should see</div>
          <div className="pb-note-b">
            {int(b.kpis.invoices)} live invoices, <strong>{usd(b.kpis.billed_cents)} billed</strong> — and only{" "}
            <strong>{int(b.kpis.invoices_with_payment)} invoice{b.kpis.invoices_with_payment === 1 ? "" : "s"} carry any payment at all</strong>, {money(b.kpis.collected_cents)} in total.
            Cash that has not been applied to an invoice does not relieve A/R here, so the {usd(b.kpis.ar_open_cents)} open balance includes
            anything already paid but not applied. Computed live from your invoices.
          </div>
        </div>
      );
    }
  } else if (data) {
    const b = data as VendorBoard;
    tiles = [
      { label: "With transactions", value: int(b.kpis.with_transactions), tone: "navy" },
      { label: "In the book", value: int(b.kpis.in_the_book) },
      { label: "Spend YTD", value: money(b.kpis.spend_cents) },
      { label: "Fuel share", value: b.kpis.fuel_share_pct == null ? "—" : `${b.kpis.fuel_share_pct}%` },
      { label: "Open bills", value: money(b.kpis.open_bills_cents) },
      { label: "Unposted fuel", value: money(b.kpis.unposted_fuel_cents), tone: b.kpis.unposted_fuel_cents ? "amber" : undefined },
    ];
    chips = [
      { id: "with_transactions", label: "With transactions", n: b.chips.with_transactions },
      { id: "open_bills", label: "Open bills", n: b.chips.open_bills },
      { id: "all", label: "All", n: b.chips.all },
    ];
    const rows = b.rows.filter((r) =>
      (term ? r.name.toLowerCase().includes(term) : chip === "with_transactions" ? r.txns > 0 : chip === "open_bills" ? r.open_bills > 0 : true)
      && (cats.length === 0 || (r.category != null && cats.includes(r.category))));
    const cols: Array<Col<VendorRow>> = [
      { key: "name", label: "Vendor", sort: (r) => r.name, cell: (r) => r.name },
      { key: "category", label: "Category", width: 118, sort: (r) => r.category ?? "", cell: (r) => <span className="pb-muted2">{r.category ?? "—"}</span> },
      { key: "txns", label: "Transactions", num: true, width: 92, sort: (r) => r.txns, cell: (r) => (r.txns ? int(r.txns) : <span className="ih-empty">—</span>), foot: int(rows.reduce((s, r) => s + r.txns, 0)) },
      { key: "spend", label: "Spend YTD", num: true, width: 136, sort: (r) => r.spend_cents, cell: (r) => <span className="pb-strong">{money(r.spend_cents)}</span>, foot: money(rows.reduce((s, r) => s + r.spend_cents, 0)) },
      { key: "avg", label: "Avg ticket", num: true, width: 118, sort: (r) => r.avg_ticket_cents ?? 0, cell: (r) => <span className="pb-muted2">{money(r.avg_ticket_cents)}</span> },
      { key: "last", label: "Last paid", num: true, width: 104, sort: (r) => r.last_paid ?? "", cell: (r) => <span className="pb-muted">{day(r.last_paid)}</span> },
      { key: "pays", label: "Pays through", width: 120, sort: (r) => r.pays_through ?? "", cell: (r) => <span className="pb-muted2">{r.pays_through ?? "—"}</span> },
      { key: "open", label: "Open bills", num: true, width: 116, sort: (r) => r.open_bills_cents, cell: (r) => (r.open_bills_cents ? usd(r.open_bills_cents) : <span className="ih-empty">—</span>), foot: money(rows.reduce((s, r) => s + r.open_bills_cents, 0)) },
    ];
    const allCats = [...new Set(b.rows.filter((r) => r.txns > 0 && r.category).map((r) => r.category as string))].sort();
    table = (
      <>
        <BoardTable storageKey="party-board-cols-vendors" cols={cols} rows={rows} exportRef={exportRef} exportName="vendors.csv" gearOpen={gearOpen}
          footLabel={`${int(rows.length)} ${chip === "with_transactions" && !term ? "vendors with transactions" : "vendors"}`}
          onOpen={(r) => navigate(`/vendors/${r.id}`)} />
        <datalist id="pb-vendor-cats">{allCats.map((c) => <option key={c} value={c} />)}</datalist>
      </>
    );
    const top = b.kpis.top_vendor;
    note = (
      <div className="pb-note" data-testid="party-board-note">
        <div className="pb-note-t">Two things this screen makes visible</div>
        <div className="pb-note-b">
          {top && b.kpis.spend_cents ? (
            <><strong>{top.name} is {int(top.txns)} of your {int(b.kpis.transactions)} vendor transactions and {usd(top.spend_cents)} of {usd(b.kpis.spend_cents)} — {top.share_pct}% of every dollar you pay a vendor.</strong> That concentration is worth knowing before you negotiate.<br /></>
          ) : null}
          {b.kpis.unposted_fuel_count ? (
            <><strong>{usd(b.kpis.unposted_fuel_cents)} of Relay fuel has never posted.</strong> {int(b.kpis.unposted_fuel_count)} transactions staged since {day(b.kpis.unposted_fuel_since)} and not yet posted to the GL.</>
          ) : "Every Relay fuel transaction has posted."}
        </div>
      </div>
    );
  }

  return (
    <div className="pb" data-testid={`party-board-${props.kind}`}>
      <div className="pb-head">
        <div className="pb-head-row">
          <div>
            <div className="pb-title">{title}</div>
            <div className="pb-sub">{sub}</div>
          </div>
          <button type="button" className="pb-create" onClick={props.onCreate}>+ Create {isCustomers ? "Customer" : "Vendor"}</button>
        </div>
        <div className="pb-kpis" data-testid="party-board-kpis">
          {(tiles.length ? tiles : Array.from({ length: 6 }, (): (typeof tiles)[number] => ({ label: "", value: "…" }))).map((t, i) => (
            <div key={`${t.label}:${i}`} className={`pb-kpi${t.tone ? ` pb-kpi--${t.tone}` : ""}`}>
              <div className="ih-hd">{t.label || " "}</div>
              <div className="pb-kpi-v">{t.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="pb-bar">
        {chips.map((c) => (
          <button key={c.id} type="button" className="pb-chip" aria-pressed={chip === c.id && !term} onClick={() => { setChip(c.id); setSearch(""); }}>
            {c.label} {int(c.n)}
          </button>
        ))}
        <span className="pb-sep" />
        {isCustomers ? (
          <>
            <select aria-label="Date range" className="pb-select" value={range} onChange={(e) => setRange(e.target.value as Range)}>
              <option value="ytd">This year</option><option value="12m">Last 12 months</option><option value="all">All time</option>
            </select>
            <select aria-label="Aging" className="pb-select" value={aging} onChange={(e) => setAging(e.target.value)}>
              <option value="all">All ages</option><option value="current">Current</option><option value="d1_30">1–30 days</option>
              <option value="d31_60">31–60 days</option><option value="d61_90">61–90 days</option><option value="d90_plus">Over 90 days</option>
            </select>
          </>
        ) : (
          <>
            <span className="ih-hd">Category</span>
            <div className="pb-tokens">
              {cats.map((c) => (
                <span key={c} className="pb-token">{c} <button type="button" aria-label={`Remove ${c}`} onClick={() => setCats(cats.filter((x) => x !== c))}>×</button></span>
              ))}
              <input className="pb-token-add" list="pb-vendor-cats" placeholder="Add…" aria-label="Add category"
                onChange={(e) => { const v = e.target.value; if (v && !cats.includes(v) && (data as VendorBoard | undefined)?.rows.some((r) => r.category === v)) { setCats([...cats, v]); e.target.value = ""; } }} />
            </div>
          </>
        )}
        <label htmlFor={`pb-search-${props.kind}`} style={{ position: "absolute", left: -9999 }}>Search {props.kind}</label>
        <input id={`pb-search-${props.kind}`} type="search" className="pb-search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search all ${int(all)} — hidden is not missing`} />
        <button type="button" className="pb-chip" aria-pressed>Regular</button>
        <button type="button" className="pb-chip" aria-pressed={false} onClick={props.onMasterDetail}>Master-detail</button>
        <button type="button" className="pb-chip" aria-pressed={false} onClick={() => exportRef.current()}>Export</button>
        <span style={{ position: "relative" }}>
          <button type="button" className="pb-gear" aria-label="Choose columns" title="Choose columns" aria-expanded={gearOpen} onClick={() => setGearOpen((v) => !v)}><GearIcon /></button>
        </span>
      </div>

      <div className="pb-body" style={{ position: "relative" }}>
        {q.isLoading ? <div className="pb-muted">Loading {props.kind}…</div> : table}
        {note}
      </div>
    </div>
  );
}

/** One toggle, same position on every list: Regular (the board) is the default; Master-detail is the existing page. */
export function PartyListSwitch(props: { kind: PartyKind; operatingCompanyId: string | null; detail: ReactNode; detailActive: boolean; setDetail: (on: boolean) => void; onCreate: () => void }) {
  if (props.detailActive || !props.operatingCompanyId) {
    return (
      <>
        {props.operatingCompanyId ? (
          <div className="pb-switch">
            <button type="button" className="pb-chip" aria-pressed={false} onClick={() => props.setDetail(false)}>Regular</button>
            <button type="button" className="pb-chip" aria-pressed>Master-detail</button>
          </div>
        ) : null}
        {props.detail}
      </>
    );
  }
  return <PartyBoard kind={props.kind} operatingCompanyId={props.operatingCompanyId} onMasterDetail={() => props.setDetail(true)} onCreate={props.onCreate} />;
}
