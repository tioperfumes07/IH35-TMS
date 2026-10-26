/**
 * ROUND 326.5 — the Customers and Vendors list boards, built to docs/design/boards/driver-customers-vendors/
 * Customers.dc.html and Vendors.dc.html: header + six KPI tiles across, chip filters with live counts, range /
 * aging (customers) or category tokens (vendors), search over every record, Regular / Master-detail toggle,
 * Export, gear column chooser, sortable table with a totals footer, and the live "surfaces something" note.
 * Every figure comes from GET /api/v1/mdata/boards/:kind — nothing on this screen is a board constant.
 * ROUND 443.280: the VENDORS home is rebuilt in VendorsHomeBoard.tsx (V3 board); PartyListSwitch mounts it.
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, apiRequest } from "../../api/client";
import { VariantDuplicatesPanel, useVariantCandidates, variantPairsFor } from "./VariantDuplicatesPanel";
import { formatDateUS } from "../../lib/formatDate";
import { formatNumberTable, formatUsdCentsTable } from "../../lib/money";
import { ListErrorState } from "../ListErrorState";
import { VendorsHomeBoard } from "./VendorsHomeBoard";
import { NumLink } from "./partyBoardKit";
import { V3KpiTile } from "../v3";
import { MoneyCell } from "../shared/MoneyCell";
import "../../design/ih35-design-tokens.css";
import "./party-board.css";
import { SelectCombobox } from "../Combobox";

export type PartyKind = "customers" | "vendors";
type Range = "ytd" | "12m" | "all";

type CustomerRow = {
  id: string; name: string; status: string; factored: string | null; invoices: number; billed_cents: number;
  collected_cents: number; open_cents: number; paid_invoices: number; last_invoice: string | null;
  aging: { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number };
};
type CustomerBoard = {
  /** The board's first counted day (server) for the selected range. */
  range_from: string;
  kpis: { with_transactions: number; in_the_book: number; open_invoices: number; billed_cents: number; ar_open_cents: number; collected_cents: number; invoices: number; invoices_with_payment: number };
  chips: { with_transactions: number; open_balance: number; factored: number; all: number };
  rows: CustomerRow[];
};
/**
 * ONE FORMATTER, 2026-10-02. These were four hand-rolled locals — `toLocaleString`, a local int, a
 * local money — in a file that renders the DEFAULT customer and vendor list. `lib/money.ts` is the
 * single source of truth and its own header forbids exactly this: "do NOT hand-roll toFixed(2),
 * toLocaleString, or per-file Intl.NumberFormat money variants". Two surfaces formatting money two
 * ways is how the same customer reads differently depending on which toggle you are on.
 *
 * It also carried a real defect. `money = (cents) => (cents ? usd(cents) : "—")` is falsy-testing a
 * NUMBER, so a true **$0.00 rendered as an em dash** — a customer who has genuinely collected zero
 * read as "no data". C-37 is the opposite rule: missing renders as —, and a real zero renders as
 * $0.00, because hiding a measured zero is as dishonest as fabricating one. `formatUsdCentsTable`
 * draws that line correctly (null/undefined/"" -> —, 0 -> $0.00, negatives in accounting form).
 */
const usd = (cents: number | null | undefined) => formatUsdCentsTable(cents);
const int = (n: number) => formatNumberTable(n);
const money = (cents: number | null | undefined) => formatUsdCentsTable(cents);
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
        <ParityTable<R>
          appearance="board"
          storageKey={`${props.storageKey}-table`}
          tableTestId="party-board-table"
          columns={visible.map((c, i): ParityColumn<R> => ({
            key: c.key,
            label: c.label,
            kind: c.num ? "number" : undefined,
            minWidth: c.width,
            sortValue: c.sort,
            exportValue: c.sort,
            render: (r) => (i === 0 ? <button type="button" className="pb-name" onClick={() => props.onOpen(r)}>{c.cell(r)}</button> : c.cell(r)),
          }))}
          rows={sorted}
          rowKey={(r) => r.id}
          emptyText="Nothing matches this filter."
          sortKey={sort?.key}
          sortDirection={sort ? (sort.dir === 1 ? "asc" : "desc") : undefined}
          onSortChange={(key, direction) => setSort({ key, dir: direction === "asc" ? 1 : -1 })}
          sortMode="external"
          footerCells={Object.fromEntries(visible.map((c, i) => [c.key, i === 0 ? props.footLabel : c.foot ?? null]))}
          suppressToolbarSearch
          suppressToolbarRange
          initialPageSize={100}
          pageSizeOptions={[100, 300]}
          allowAllPageSize
        />
      </div>
    </>
  );
}

export function PartyBoard(props: { kind: "customers"; operatingCompanyId: string; onMasterDetail: () => void; onCreate: () => void }) {
  const navigate = useNavigate();
  // Chip and range live in the URL (?chip=, ?range=) so every tile and figure links to the exact rows it sums.
  const [searchParams, setSearchParams] = useSearchParams();
  const rangeParam = searchParams.get("range");
  const range: Range = rangeParam === "12m" || rangeParam === "all" ? rangeParam : "ytd";
  const setRange = (next: Range) =>
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === "ytd") params.delete("range");
      else params.set("range", next);
      return params;
    }, { replace: true });
  const chip = searchParams.get("chip") || "with_transactions";
  const [aging, setAging] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [gearOpen, setGearOpen] = useState(false);
  const exportRef = useRef<() => void>(() => undefined);
  const q = useQuery({
    queryKey: ["party-board", props.kind, props.operatingCompanyId, range],
    queryFn: () => apiRequest<CustomerBoard>(`/api/v1/mdata/boards/${props.kind}?operating_company_id=${props.operatingCompanyId}&range=${range}`),
  });
  const data = q.data;
  const term = search.trim().toLowerCase();
  // ROUND 297: possible duplicates (variants) across customers + vendors + Faro debtors, counted live for the chip.
  const variants = useVariantCandidates(props.operatingCompanyId);
  const variantCount = variants.data ? variantPairsFor(variants.data.pairs, props.kind).length : null;

  if (q.isError) {
    const status = q.error instanceof ApiError ? q.error.status : 0;
    return <ListErrorState status={status} message={`Could not load ${props.kind}.`} onRetry={() => void q.refetch()} />;
  }

  const title = "Customers";
  const sub = "The list opens on the customers you actually do business with";
  const all = data?.chips.all ?? 0;

  let chips: Array<{ id: string; label: string; n: number }> = [];
  let table: ReactNode = null;
  let note: ReactNode = null;

  if (data) {
    const b = data as CustomerBoard;
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
      { key: "open", label: "Open balance", num: true, width: 130, sort: (r) => r.open_cents, cell: (r) => <span className="pb-strong"><MoneyCell cents={r.open_cents} format={money} drill={{ entity: { kind: "customer", id: r.id } }} /></span>, foot: money(sum("open_cents")) },
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
            {/* Each figure opens the customer rows whose Invoices / Billed / Collected / Open balance foots it equals. */}
            <NumLink to={`/customers?chip=with_transactions&range=${range}`}>{int(b.kpis.invoices)}</NumLink> invoices issued (open and paid),{" "}
            <strong><NumLink to={`/customers?chip=with_transactions&range=${range}`}>{usd(b.kpis.billed_cents)}</NumLink> billed</strong> — and only{" "}
            <strong>{int(b.kpis.invoices_with_payment)} invoice{b.kpis.invoices_with_payment === 1 ? "" : "s"} carry any payment at all</strong>,{" "}
            <NumLink to={`/customers?chip=with_transactions&range=${range}`}>{money(b.kpis.collected_cents)}</NumLink> in total.
            Cash that has not been applied to an invoice does not relieve A/R here, so the{" "}
            <NumLink to={`/customers?chip=open_balance&range=${range}`}>{usd(b.kpis.ar_open_cents)}</NumLink> open balance includes
            anything already paid but not applied. Computed live from your invoices.
          </div>
        </div>
      );
    }
  }

  return (
    <div className="pb" data-testid={`party-board-${props.kind}`}>
      <div className="pb-head">
        <div className="pb-head-row">
          <div>
            <div className="pb-title">{title}</div>
            <div className="pb-sub">{sub}</div>
          </div>
          <button type="button" className="pb-create" onClick={props.onCreate}>+ Create Customer</button>
        </div>
        <div className="pb-kpis" data-testid="party-board-kpis">
          {/* One tile format (V3KpiTile). Each tile opens the exact rows it counts: the board's own ?chip=&range= list
              (whose column foots equal the tile) or, for Open invoices, the invoices list's live_open filter. */}
          <V3KpiTile label="With transactions" value={data ? int(data.kpis.with_transactions) : "…"} href={`/customers?chip=with_transactions&range=${range}`} />
          <V3KpiTile label="In the book" value={data ? int(data.kpis.in_the_book) : "…"} href={`/customers?chip=all&range=${range}`} />
          {/* ROUND 297: "open" = live, not void, balance above $0 -- the same definition Factoring's candidates use. */}
          <V3KpiTile label="Open invoices" value={data ? int(data.kpis.open_invoices) : "…"} href={`/accounting/invoices?live_open=true&date_from=${data?.range_from ?? ""}`} />
          <V3KpiTile label="Billed" value={data ? money(data.kpis.billed_cents) : "…"} href={`/customers?chip=with_transactions&range=${range}`} />
          <V3KpiTile label="A/R open" value={data ? money(data.kpis.ar_open_cents) : "…"} tone="red" href={`/customers?chip=open_balance&range=${range}`} />
          <V3KpiTile label="Collected" value={data ? money(data.kpis.collected_cents) : "…"} href={`/customers?chip=with_transactions&range=${range}`} />
        </div>
      </div>

      <div className="pb-bar">
        {chips.map((c) => (
          <Link key={c.id} className="pb-chip" to={`/customers?chip=${c.id}&range=${range}`} aria-current={chip === c.id && !term ? "true" : undefined}
            onClick={() => setSearch("")}>
            {c.label} {int(c.n)}
          </Link>
        ))}
        <Link className="pb-chip" to={`/customers?chip=duplicates&range=${range}`} aria-current={chip === "duplicates" && !term ? "true" : undefined}
          data-testid="party-board-duplicates-chip" onClick={() => setSearch("")}>
          Possible duplicates {variantCount == null ? "…" : int(variantCount)}
        </Link>
        <span className="pb-sep" />
            <SelectCombobox aria-label="Date range" className="pb-select" value={range} onChange={(e) => setRange(e.target.value as Range)}>
              <option value="ytd">This year</option><option value="12m">Last 12 months</option><option value="all">All time</option>
            </SelectCombobox>
            <SelectCombobox aria-label="Aging" className="pb-select" value={aging} onChange={(e) => setAging(e.target.value)}>
              <option value="all">All ages</option><option value="current">Current</option><option value="d1_30">1–30 days</option>
              <option value="d31_60">31–60 days</option><option value="d61_90">61–90 days</option><option value="d90_plus">Over 90 days</option>
            </SelectCombobox>
        <label htmlFor={`pb-search-${props.kind}`} style={{ position: "absolute", left: -9999 }}>Search {props.kind}</label>
        <input id={`pb-search-${props.kind}`} type="search" className="pb-search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search all ${int(all)} — hidden is not missing`} />
        <button type="button" className="pb-chip" aria-pressed>Regular</button>
        <button type="button" className="pb-chip" aria-pressed={false} onClick={props.onMasterDetail} title="The full governed column set — A/R ageing, factoring fees and interest, reserve held, finance cost, days-to-pay, credit limit — plus the column chooser.">All columns</button>
        <button type="button" className="pb-chip" aria-pressed={false} onClick={() => exportRef.current()}>Export</button>
        <span style={{ position: "relative" }}>
          <button type="button" className="pb-gear" aria-label="Choose columns" title="Choose columns" aria-expanded={gearOpen} onClick={() => setGearOpen((v) => !v)}><GearIcon /></button>
        </span>
      </div>

      <div className="pb-body" style={{ position: "relative" }}>
        {chip === "duplicates" && !term ? (
          <VariantDuplicatesPanel board={props.kind} operatingCompanyId={props.operatingCompanyId} />
        ) : (
          <>
            {q.isLoading ? <div className="pb-muted">Loading {props.kind}…</div> : table}
            {note}
          </>
        )}
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
            <button type="button" className="pb-chip" aria-pressed>All columns</button>
          </div>
        ) : null}
        {props.detail}
      </>
    );
  }
  // ROUND 443.280 — Vendors home is the V3 board (VendorsHomeBoard); Customers keeps PartyBoard until its own row lands.
  if (props.kind === "vendors") {
    return <VendorsHomeBoard operatingCompanyId={props.operatingCompanyId} onMasterDetail={() => props.setDetail(true)} onCreate={props.onCreate} />;
  }
  return <PartyBoard kind="customers" operatingCompanyId={props.operatingCompanyId} onMasterDetail={() => props.setDetail(true)} onCreate={props.onCreate} />;
}
