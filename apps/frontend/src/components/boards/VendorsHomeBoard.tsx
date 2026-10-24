// SURFACE-BREACH-AUTHORIZED: CC-1 verify-party-boards-bound-live + lib/print-party-boards (row 43 vendors board rebuild)
/**
 * ROUND 443.280 — Vendors home, REBUILT to the V3 board (10-22-2026-LEAD-MOD-DESIGN-V3-Vendors.dc.html):
 * six KPI tiles, "Spend by category · YTD" + "Pays through" panels, one "Vendors · n" panel carrying the four chips and
 * Export (Vendor / Category / Transactions / Spend YTD / bar / Avg ticket / Last paid / Pays through), and the live
 * "Measured" bar. Every figure comes from GET /api/v1/mdata/boards/vendors — nothing is a board constant. What the
 * board does not show (search, category tokens, column chooser, per-vendor open-bills column) lives on the
 * master-detail directory, reached by "View all →" (?view=detail) — never on or under this board.
 */
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ApiError, apiRequest } from "../../api/client";
import { V3 } from "../../design/v3-tokens";
import { V3KpiTile, V3Panel, V3Segmented } from "../v3";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorState } from "../ListErrorState";
import { VariantDuplicatesPanel, useVariantCandidates, variantPairsFor } from "./VariantDuplicatesPanel";
import { MeasuredNote, NumLink, PartyHomeHeader, PartyTable, SpendBar, day, int, outlineButton, usd, type PartyCol } from "./partyBoardKit";

type VendorRow = {
  id: string; name: string; status: string; category: string | null; txns: number; spend_cents: number;
  avg_ticket_cents: number | null; last_paid: string | null; pays_through: string | null; open_bills: number; open_bills_cents: number;
};
export type VendorBoard = {
  kpis: {
    with_transactions: number; in_the_book: number; spend_cents: number; fuel_share_pct: number | null; open_bills_cents: number | null;
    unposted_fuel_cents: number; unposted_fuel_count: number; unposted_fuel_since: string | null; transactions: number;
  };
  chips: { with_transactions: number; open_bills: number; all: number };
  by_category: Array<{ category: string; spend_cents: number }>;
  pays_through: Array<{ account_id: string | null; account_name: string; vendors: number; spend_cents: number }>;
  open_bills_check: { remainder_count: number; remainder_cents: number; status_open_count: number; status_open_cents: number };
  rows: VendorRow[];
};

type Chip = "with_transactions" | "open_bills" | "all" | "duplicates";
type PaysRow = { id: string; account_id: string | null; account_name: string; vendors: number; spend_cents: number };

const TOP_CATEGORIES = 3;

export function VendorsHomeBoard(props: { operatingCompanyId: string; onMasterDetail: () => void; onCreate: () => void }) {
  const navigate = useNavigate();
  const [chip, setChip] = useState<Chip>("with_transactions");
  const exportRef = useRef<() => void>(() => undefined);
  const noExport = useRef<() => void>(() => undefined);
  const q = useQuery({
    queryKey: ["party-board", "vendors", props.operatingCompanyId, "ytd"],
    queryFn: () => apiRequest<VendorBoard>(`/api/v1/mdata/boards/vendors?operating_company_id=${props.operatingCompanyId}&range=ytd`),
  });
  const variants = useVariantCandidates(props.operatingCompanyId);
  const variantCount = variants.data ? variantPairsFor(variants.data.pairs, "vendors").length : null;

  if (q.isError) {
    const status = q.error instanceof ApiError ? q.error.status : 0;
    return <ListErrorState status={status} message="Could not load vendors." onRetry={() => void q.refetch()} />;
  }
  const b = q.data;
  const rows = b ? b.rows.filter((r) => (chip === "with_transactions" ? r.txns > 0 : chip === "open_bills" ? r.open_bills > 0 : true)) : [];
  const maxSpend = Math.max(1, ...rows.map((r) => r.spend_cents));

  // Top categories by spend, everything else rolled into one "Other" line (the board's four-line panel).
  const catTotal = b ? b.by_category.reduce((s, c) => s + c.spend_cents, 0) : 0;
  const topCats = b ? b.by_category.slice(0, TOP_CATEGORIES) : [];
  const otherCents = b ? b.by_category.slice(TOP_CATEGORIES).reduce((s, c) => s + c.spend_cents, 0) : 0;
  const catLines = [...topCats, ...(b && b.by_category.length > TOP_CATEGORIES ? [{ category: "Other", spend_cents: otherCents }] : [])];
  const pct = (cents: number) => (catTotal > 0 ? (cents / catTotal) * 100 : 0);

  const cols: Array<PartyCol<VendorRow>> = [
    { key: "name", label: "Vendor", sort: (r) => r.name, cell: (r) => r.name },
    { key: "category", label: "Category", width: 130, sort: (r) => r.category ?? "", cell: (r) => <span>{r.category ?? "—"}</span> },
    {
      key: "txns", label: "Transactions", num: true, width: 100, sort: (r) => r.txns,
      cell: (r) => (r.txns ? <NumLink to={`/vendors/${r.id}`}>{int(r.txns)}</NumLink> : <span>—</span>),
    },
    {
      key: "spend", label: "Spend YTD", num: true, width: 130, sort: (r) => r.spend_cents,
      cell: (r) => (r.spend_cents ? <NumLink to={`/vendors/${r.id}`}>{usd(r.spend_cents)}</NumLink> : <span>—</span>),
    },
    { key: "bar", label: "", width: 130, sortable: false, sort: (r) => r.spend_cents, cell: (r) => <SpendBar pct={(r.spend_cents / maxSpend) * 100} width={110} /> },
    { key: "avg", label: "Avg ticket", num: true, width: 110, sort: (r) => r.avg_ticket_cents ?? 0, cell: (r) => <span>{usd(r.avg_ticket_cents)}</span> },
    { key: "last", label: "Last paid", width: 104, sort: (r) => r.last_paid ?? "", cell: (r) => <span>{day(r.last_paid)}</span> },
    { key: "pays", label: "Pays through", width: 190, sort: (r) => r.pays_through ?? "", cell: (r) => <span>{r.pays_through ?? "—"}</span> },
  ];

  const paysRows: PaysRow[] = b ? b.pays_through.map((p) => ({ ...p, id: p.account_id ?? "none" })) : [];
  const paysCols: Array<PartyCol<PaysRow>> = [
    { key: "account", label: "Account", sort: (r) => r.account_name, cell: (r) => r.account_name },
    { key: "vendors", label: "Vendors", num: true, width: 90, sort: (r) => r.vendors, cell: (r) => <span>{int(r.vendors)}</span> },
    {
      key: "spend", label: "Spend", num: true, width: 130, sort: (r) => r.spend_cents,
      cell: (r) => (r.account_id ? <NumLink to={`/accounting/chart-of-accounts/register/${r.account_id}`}>{usd(r.spend_cents)}</NumLink> : <span>{usd(r.spend_cents)}</span>),
    },
  ];

  const chipOptions: Array<{ id: Chip; label: string }> = [
    { id: "with_transactions", label: `With transactions ${int(b?.chips.with_transactions ?? 0)}` },
    { id: "open_bills", label: `Open bills ${int(b?.chips.open_bills ?? 0)}` },
    { id: "all", label: `All ${int(b?.chips.all ?? 0)}` },
    { id: "duplicates", label: `Possible duplicates ${variantCount == null ? "…" : int(variantCount)}` },
  ];

  const chk = b?.open_bills_check;
  const boardOpen = b?.kpis.open_bills_cents ?? 0;
  const agree = chk != null && boardOpen === chk.remainder_cents && boardOpen === chk.status_open_cents;

  return (
    <div data-testid="party-board-vendors" style={{ background: V3.page, color: V3.ink, fontFamily: V3.font, padding: "12px 20px 30px", minHeight: "100%" }}>
      <PartyHomeHeader crumb="Vendors" title="Vendors" subtitle="The list opens on the vendors you actually pay"
        createLabel="+ Create Vendor" onBack={() => navigate(-1)} onCreate={props.onCreate} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        <div data-testid="party-board-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          <V3KpiTile label="With transactions" value={b ? int(b.kpis.with_transactions) : "…"} onClick={() => setChip("with_transactions")} />
          <V3KpiTile label="In the book" value={b ? int(b.kpis.in_the_book) : "…"} onClick={() => setChip("all")} />
          <V3KpiTile label="Spend YTD" value={b ? usd(b.kpis.spend_cents) : "…"} onClick={() => navigate("/accounting/expenses")} />
          <V3KpiTile label="Fuel share" value={b ? (b.kpis.fuel_share_pct == null ? "—" : `${b.kpis.fuel_share_pct}%`) : "…"} onClick={() => navigate("/fuel/history")} />
          <V3KpiTile label="Open bills" value={b ? usd(b.kpis.open_bills_cents) : "…"} onClick={() => navigate("/accounting/bills?has_balance=true")} />
          <V3KpiTile label="Unposted fuel" value={b ? usd(b.kpis.unposted_fuel_cents) : "…"} tone={b && b.kpis.unposted_fuel_cents > 0 ? "amber" : "ink"}
            sub={b ? (b.kpis.unposted_fuel_count > 0 ? `${int(b.kpis.unposted_fuel_count)} since ${day(b.kpis.unposted_fuel_since)}` : "None") : undefined}
            onClick={() => navigate("/fuel/relay-inbox")} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 12, alignItems: "start" }}>
          <V3Panel title="Spend by category · YTD" onViewAll={props.onMasterDetail} testId="party-board-categories">
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              {q.isLoading ? <span style={{ fontSize: 12, color: V3.muted }}>Loading…</span> : catLines.length === 0 ? <span style={{ fontSize: 12, color: V3.muted }}>No vendor spend in range.</span> : catLines.map((c) => (
                <div key={c.category} style={{ display: "grid", gridTemplateColumns: "130px 1fr 90px 50px", gap: 10, alignItems: "center", fontSize: 12 }}>
                  <span>{c.category}</span>
                  <SpendBar pct={pct(c.spend_cents)} width="100%" />
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{usd(c.spend_cents)}</span>
                  <span style={{ textAlign: "right", color: V3.muted, fontVariantNumeric: "tabular-nums" }}>{pct(c.spend_cents).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </V3Panel>
          <V3Panel title="Pays through" onViewAll={props.onMasterDetail} testId="party-board-pays-through">
            <PartyTable<PaysRow> storageKey="party-board-vendors-pays-table" testId="party-board-pays-table" cols={paysCols} rows={paysRows} exportRef={noExport}
              exportName="pays-through.csv" emptyText="No payments in range."
              renderFirst={(r) => (r.account_id ? <EntityLink kind="account" id={r.account_id} label={r.account_name} /> : <span>{r.account_name}</span>)} />
          </V3Panel>
        </div>

        {chip === "duplicates" ? (
          <V3Panel title="Vendors · possible duplicates" headerRight={<V3Segmented<Chip> testId="party-board-chips" value={chip} options={chipOptions} onChange={setChip} />}>
            <VariantDuplicatesPanel board="vendors" operatingCompanyId={props.operatingCompanyId} />
          </V3Panel>
        ) : (
          <V3Panel title={`Vendors · ${int(rows.length)}`} onViewAll={props.onMasterDetail} testId="party-board-panel"
            headerRight={
              <>
                <V3Segmented<Chip> testId="party-board-chips" value={chip} options={chipOptions} onChange={setChip} />
                <button type="button" style={outlineButton} onClick={() => exportRef.current()}>Export</button>
              </>
            }>
            {q.isLoading ? <div style={{ padding: 12, fontSize: 12, color: V3.muted }}>Loading vendors…</div> : (
              <PartyTable<VendorRow> storageKey="party-board-vendors-table" testId="party-board-table" cols={cols} rows={rows} exportRef={exportRef}
                exportName="vendors.csv" emptyText="Nothing matches this filter."
                renderFirst={(r) => <EntityLink kind="vendor" id={r.id} label={r.name} />} />
            )}
          </V3Panel>
        )}

        {chk ? (
          <MeasuredNote testId="party-board-note">
            {agree
              ? `Open bills agree across definitions: ${usd(boardOpen)} (${int(chk.remainder_count)} bills with an unpaid remainder).`
              : `Open bills disagree across definitions: this screen ${usd(boardOpen)} (vendor-linked bills with an unpaid remainder) · all bills with an unpaid remainder ${usd(chk.remainder_cents)} (${int(chk.remainder_count)}) · bills in an open status ${usd(chk.status_open_cents)} (${int(chk.status_open_count)}). One AP service must feed every screen.`}
            {b && b.kpis.unposted_fuel_count > 0 ? ` ${usd(b.kpis.unposted_fuel_cents)} of Relay fuel (${int(b.kpis.unposted_fuel_count)} transactions) has not posted to the GL.` : ""}
          </MeasuredNote>
        ) : null}
      </div>
    </div>
  );
}
