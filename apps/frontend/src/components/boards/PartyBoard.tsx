/**
 * ROUND 326.5 — the Customers and Vendors home boards. Rows 55 / 56 (register 11-02, board verdict CHROME-ONLY):
 * the CUSTOMERS home is REBUILT here to the V3 board (docs/design/v3/Customers.dc.html): ← Back + title + "+ Create
 * Customer", six KPI tiles (A/R open carries "% past due", Collected "no payments applied" when none is), the chip
 * strip (With transactions / Open balance / Factored / All / Possible duplicates) with Export + Print, one
 * "Customers · n" panel (Customer / Invoices / Billed / Collected / Open balance / Aging bar / Last invoice / Factored /
 * Status) with the aging legend, and the live "Measured" bar. Every figure comes from GET /api/v1/mdata/boards/customers
 * (party-board.service.ts readCustomerBoard) — nothing on this screen is a board constant. What the board does not
 * show (search, aging filter, column chooser, the full governed column set) lives on the master-detail directory,
 * reached by "View all →" (?view=detail) — never on or under this board. The VENDORS home is VendorsHomeBoard.tsx.
 */
import { useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, apiRequest } from "../../api/client";
import { V3 } from "../../design/v3-tokens";
import { inModuleBackHref } from "../../lib/structuralBreadcrumb";
import { formatCompanyName } from "../../lib/formatCompanyName";
import { formatUsdCents, formatUsdCentsTable } from "../../lib/money";
import { ListErrorState } from "../ListErrorState";
import { EntityLink } from "../shared/EntityLink";
import { V3KpiTile, V3Panel, V3Segmented } from "../v3";
import { VariantDuplicatesPanel, useVariantCandidates, variantPairsFor } from "./VariantDuplicatesPanel";
import { VendorsHomeBoard } from "./VendorsHomeBoard";
import { DotLabel, MeasuredNote, NumLink, PartyHomeHeader, PartyTable, day, int, outlineButton, type PartyCol } from "./partyBoardKit";
import "../../design/ih35-design-tokens.css";
import "./party-board.css";

export type PartyKind = "customers" | "vendors";
type Range = "ytd" | "12m" | "all";

type Aging = { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number };
type CustomerRow = {
  id: string; name: string; status: string; factored: string | null; factor_vendor_id?: string | null; invoices: number; billed_cents: number;
  collected_cents: number; open_cents: number; paid_invoices: number; last_invoice: string | null; aging: Aging;
};
export type CustomerBoard = {
  /** The board's first counted day (server) for the selected range. */
  range_from: string;
  kpis: { with_transactions: number; in_the_book: number; open_invoices: number; billed_cents: number; ar_open_cents: number; collected_cents: number; invoices: number; invoices_with_payment: number };
  chips: { with_transactions: number; open_balance: number; factored: number; all: number };
  rows: CustomerRow[];
};
/**
 * ONE FORMATTER, 2026-10-02. `lib/money.ts` is the single source of truth. The old local
 * `money = (cents) => (cents ? usd(cents) : "—")` falsy-tested a NUMBER, so a true $0.00 rendered as an em dash.
 * C-37: missing renders —, a real zero renders $0.00 — `formatUsdCentsTable` draws that line (tables);
 * the KPI tiles carry the "$" form (formatUsdCents), as on the board.
 */
const money = (cents: number | null | undefined) => formatUsdCentsTable(cents);
const tileUsd = (cents: number) => formatUsdCents(cents);

/** The board's aging legend, oldest last. A bucket is drawn and listed only when it holds money. */
const AGING: Array<{ key: keyof Aging; label: string; color: string }> = [
  { key: "current", label: "not due", color: V3.data },
  { key: "d1_30", label: "1–30 late", color: V3.slate },
  { key: "d31_60", label: "31–60 late", color: V3.red },
  { key: "d61_90", label: "61–90 late", color: V3.amber },
  { key: "d90_plus", label: "90+ late", color: V3.shell },
];
const pastDue = (a: Aging) => a.d1_30 + a.d31_60 + a.d61_90 + a.d90_plus;

/** One row's open balance split by age, drawn on a fixed track scaled to the largest open balance in the list. */
function AgingBar({ aging, maxOpen }: { aging: Aging; maxOpen: number }) {
  const parts = AGING.map((b) => ({ ...b, cents: aging[b.key] })).filter((b) => b.cents > 0);
  const title = parts.map((p) => `${p.label} ${tileUsd(p.cents)}`).join(" · ");
  return (
    <div title={title || "nothing open"} data-testid="customers-aging-bar" style={{ width: 140, height: 6, background: V3.chartGrid, borderRadius: 3, display: "flex", overflow: "hidden" }}>
      {parts.map((p) => <div key={p.key} style={{ width: `${(p.cents / Math.max(1, maxOpen)) * 100}%`, height: 6, background: p.color }} />)}
    </div>
  );
}

type Chip = "with_transactions" | "open_balance" | "factored" | "all" | "duplicates";
const CHIPS: readonly Chip[] = ["with_transactions", "open_balance", "factored", "all", "duplicates"];
const parseChip = (v: string | null): Chip => (CHIPS.includes(v as Chip) ? (v as Chip) : "with_transactions");

export function PartyBoard(props: { kind: "customers"; operatingCompanyId: string; onMasterDetail: () => void; onCreate: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Chip and range live in the URL (?chip=, ?range=) so every tile and figure links to the exact rows it sums.
  const [searchParams, setSearchParams] = useSearchParams();
  const rangeParam = searchParams.get("range");
  const range: Range = rangeParam === "12m" || rangeParam === "all" ? rangeParam : "ytd";
  const chip = parseChip(searchParams.get("chip"));
  const setChip = (next: Chip) =>
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === "with_transactions") params.delete("chip");
      else params.set("chip", next);
      return params;
    }, { replace: true });
  const exportRef = useRef<() => void>(() => undefined);
  const q = useQuery({
    queryKey: ["party-board", props.kind, props.operatingCompanyId, range],
    queryFn: () => apiRequest<CustomerBoard>(`/api/v1/mdata/boards/${props.kind}?operating_company_id=${props.operatingCompanyId}&range=${range}`),
  });
  // ROUND 297: possible duplicates (variants) across customers + vendors + Faro debtors, counted live for the chip.
  const variants = useVariantCandidates(props.operatingCompanyId);
  const variantCount = variants.data ? variantPairsFor(variants.data.pairs, props.kind).length : null;

  if (q.isError) {
    const status = q.error instanceof ApiError ? q.error.status : 0;
    return <ListErrorState status={status} message={`Could not load ${props.kind}.`} onRetry={() => void q.refetch()} />;
  }
  const b = q.data;
  const rows = b
    ? b.rows.filter((r) => (chip === "with_transactions" ? r.invoices > 0 : chip === "open_balance" ? r.open_cents > 0 : chip === "factored" ? r.factored != null : true))
    : [];
  const maxOpen = Math.max(1, ...rows.map((r) => r.open_cents));
  const withTx = b ? b.rows.filter((r) => r.invoices > 0) : [];
  const pastDueCents = withTx.reduce((s, r) => s + pastDue(r.aging), 0);
  const pastDuePct = b && b.kpis.ar_open_cents > 0 ? Math.round((pastDueCents / b.kpis.ar_open_cents) * 1000) / 10 : null;
  const bucketsShown = AGING.filter((a) => rows.some((r) => r.aging[a.key] > 0));

  const cols: Array<PartyCol<CustomerRow>> = [
    { key: "name", label: "Customer", sort: (r) => r.name, cell: (r) => formatCompanyName(r.name) },
    {
      key: "invoices", label: "Invoices", num: true, width: 82, sort: (r) => r.invoices,
      cell: (r) => (r.invoices ? <NumLink to={`/accounting/invoices?customer_id=${r.id}`}>{int(r.invoices)}</NumLink> : <span>—</span>),
    },
    { key: "billed", label: "Billed", num: true, width: 122, sort: (r) => r.billed_cents, cell: (r) => <NumLink to={`/customers/${r.id}`}>{money(r.billed_cents)}</NumLink> },
    // Codex batch46 row 55: collected is a MEASURED sum — a real $0.00 renders as $0.00, never "—".
    { key: "collected", label: "Collected", num: true, width: 122, sort: (r) => r.collected_cents, cell: (r) => <NumLink to={`/customers/${r.id}`}>{money(r.collected_cents)}</NumLink> },
    {
      key: "open", label: "Open balance", num: true, width: 130, sort: (r) => r.open_cents,
      cell: (r) => <NumLink to={`/accounting/invoices?customer_id=${r.id}&has_balance=true`}>{money(r.open_cents)}</NumLink>,
    },
    { key: "aging", label: "Aging", width: 160, sortable: false, sort: (r) => pastDue(r.aging), cell: (r) => <AgingBar aging={r.aging} maxOpen={maxOpen} /> },
    { key: "last_invoice_date", label: "Last invoice", width: 104, sort: (r) => r.last_invoice ?? "", cell: (r) => <span>{day(r.last_invoice)}</span> },
    {
      key: "factored", label: "Factored", width: 150, sort: (r) => r.factored ?? "",
      cell: (r) => (r.factored ? (
        <DotLabel color={V3.link}>{r.factor_vendor_id ? <EntityLink kind="vendor" id={r.factor_vendor_id} label={formatCompanyName(r.factored)} /> : formatCompanyName(r.factored)}</DotLabel>
      ) : <DotLabel color={V3.slate}>—</DotLabel>),
    },
    {
      key: "status", label: "Status", width: 96, sort: (r) => r.status,
      cell: (r) => <DotLabel color={r.status === "inactive" ? V3.slate : V3.green}>{r.status === "inactive" ? "Inactive" : "Active"}</DotLabel>,
    },
  ];

  const chipOptions: Array<{ id: Chip; label: string }> = [
    { id: "with_transactions", label: `With transactions ${int(b?.chips.with_transactions ?? 0)}` },
    { id: "open_balance", label: `Open balance ${int(b?.chips.open_balance ?? 0)}` },
    { id: "factored", label: `Factored ${int(b?.chips.factored ?? 0)}` },
    { id: "all", label: `All ${int(b?.chips.all ?? 0)}` },
    { id: "duplicates", label: `Possible duplicates ${variantCount == null ? "…" : int(variantCount)}` },
  ];

  let note: ReactNode = null;
  if (b && b.kpis.invoices > 0) {
    note = (
      <MeasuredNote testId="party-board-note">
        <NumLink to={`/customers?chip=with_transactions&range=${range}`}>{int(b.kpis.invoices)}</NumLink> invoices issued (open and paid) since {day(b.range_from)},{" "}
        <NumLink to={`/customers?chip=with_transactions&range=${range}`}>{tileUsd(b.kpis.billed_cents)}</NumLink> billed.{" "}
        {b.kpis.collected_cents === 0 ? (
          <>
            Collected is <NumLink to={`/customers?chip=with_transactions&range=${range}`}>{tileUsd(0)}</NumLink> for every customer: no payment has been
            applied to any of them, so open balance <NumLink to={`/customers?chip=open_balance&range=${range}`}>{tileUsd(b.kpis.ar_open_cents)}</NumLink> = billed.
          </>
        ) : (
          <>
            {int(b.kpis.invoices_with_payment)} invoice{b.kpis.invoices_with_payment === 1 ? "" : "s"} carry a payment,{" "}
            <NumLink to={`/customers?chip=with_transactions&range=${range}`}>{tileUsd(b.kpis.collected_cents)}</NumLink> collected. Cash not applied to an
            invoice does not relieve A/R, so the <NumLink to={`/customers?chip=open_balance&range=${range}`}>{tileUsd(b.kpis.ar_open_cents)}</NumLink> open
            balance includes anything paid but not applied.
          </>
        )}
        {pastDuePct != null ? <> {`${pastDuePct}% of it is past due.`}</> : null}
      </MeasuredNote>
    );
  }

  return (
    <div data-testid={`party-board-${props.kind}`} style={{ background: V3.page, color: V3.ink, fontFamily: V3.font, padding: "12px 20px 30px", minHeight: "100%" }}>
      <PartyHomeHeader crumb={"Customers"} title={"Customers"} subtitle={"The list opens on the customers you actually do business with"}
        createLabel={"+ Create Customer"} onBack={() => navigate(inModuleBackHref(location.pathname))} onCreate={props.onCreate} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        <div data-testid="party-board-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          {/* One tile format (V3KpiTile). Each tile opens the exact rows it counts: the board's own ?chip=&range= list
              (whose column foots equal the tile) or, for Open invoices, the invoices list's live_open filter. */}
          <V3KpiTile label="With transactions" value={b ? int(b.kpis.with_transactions) : "…"} href={`/customers?chip=with_transactions&range=${range}`} />
          <V3KpiTile label="In the book" value={b ? int(b.kpis.in_the_book) : "…"} href={`/customers?chip=all&range=${range}`} />
          {/* ROUND 297: "open" = live, not void, balance above $0 -- the same definition Factoring's candidates use. */}
          <V3KpiTile label="Open invoices" value={b ? int(b.kpis.open_invoices) : "…"} href={`/accounting/invoices?live_open=true&date_from=${b?.range_from ?? ""}`} />
          <V3KpiTile label="Billed" value={b ? tileUsd(b.kpis.billed_cents) : "…"} href={`/customers?chip=with_transactions&range=${range}`} />
          <V3KpiTile label="A/R open" value={b ? tileUsd(b.kpis.ar_open_cents) : "…"} href={`/customers?chip=open_balance&range=${range}`}
            sub={pastDuePct != null ? `${pastDuePct}% past due` : undefined} />
          <V3KpiTile label="Collected" value={b ? tileUsd(b.kpis.collected_cents) : "…"} href={`/customers?chip=with_transactions&range=${range}`}
            tone={b && b.kpis.collected_cents === 0 && b.kpis.billed_cents > 0 ? "red" : "ink"}
            sub={b && b.kpis.invoices_with_payment === 0 ? "no payments applied" : b ? `${int(b.kpis.invoices_with_payment)} invoices paid` : undefined} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <V3Segmented<Chip> testId="party-board-chips" value={chip} options={chipOptions} onChange={setChip} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={outlineButton} data-testid="customers-board-export" onClick={() => exportRef.current()}>{"Export"}</button>
            <button type="button" style={outlineButton} data-testid="customers-board-print" onClick={() => window.print()}>{"Print"}</button>
          </div>
        </div>

        {chip === "duplicates" ? (
          <V3Panel title={"Customers · possible duplicates"}>
            <VariantDuplicatesPanel board="customers" operatingCompanyId={props.operatingCompanyId} />
          </V3Panel>
        ) : (
          <V3Panel title={`Customers · ${int(rows.length)}`} onViewAll={props.onMasterDetail} testId="party-board-panel"
            footer={bucketsShown.length ? (
              <div data-testid="customers-aging-legend" style={{ display: "flex", gap: 14, padding: "10px 12px", fontSize: 11, color: V3.muted }}>
                {bucketsShown.map((a) => (
                  <span key={a.key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span aria-hidden="true" style={{ width: 8, height: 6, background: a.color, display: "inline-block" }} />{a.label}
                  </span>
                ))}
              </div>
            ) : undefined}>
            {q.isLoading ? <div style={{ padding: 12, fontSize: 12, color: V3.muted }}>{"Loading customers…"}</div> : (
              <PartyTable<CustomerRow> storageKey="party-board-customers-table" testId="party-board-table" cols={cols} rows={rows} exportRef={exportRef}
                exportName="customers.csv" emptyText="Nothing matches this filter."
                renderFirst={(r) => <EntityLink kind="customer" id={r.id} label={formatCompanyName(r.name)} />} />
            )}
          </V3Panel>
        )}
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
            <button type="button" className="pb-chip" aria-pressed>All columns</button>
          </div>
        ) : null}
        {props.detail}
      </>
    );
  }
  // Rows 55 / 56 — both homes are their V3 boards: Vendors = VendorsHomeBoard, Customers = PartyBoard (above).
  if (props.kind === "vendors") {
    return <VendorsHomeBoard operatingCompanyId={props.operatingCompanyId} onMasterDetail={() => props.setDetail(true)} onCreate={props.onCreate} />;
  }
  return <PartyBoard kind="customers" operatingCompanyId={props.operatingCompanyId} onMasterDetail={() => props.setDetail(true)} onCreate={props.onCreate} />;
}
