// Board 43 — docs/design/v3/maintenance-vehicle-graphics/Main.dc.html "Fleet Health Line", ported element for element.
// Every style value below is the board's own inline style, copied verbatim (fonts, sizes, weights, colours, radii,
// paddings, grid tracks, heights, the 122×52 top-down tractor and the 600-unit road bar). Board values deliberately
// override the global 11/12/22 type scale and 2px radius token on this surface (owner: "identical, not similar").
// Each templated value carries data-v3="<board template key>" so the parity reader can diff the live page against the board.
// Data is live (readFleetHealth); the board's own constants stay: 25,000-mile PM, 400 mi/day (= 12,000 mi/month).
// TABLE_DATE_OMIT: one row per UNIT with its current health; NEXT PM is the projected PM date, not a record date.
import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { readFleetHealth } from "./fleet-health-source";
import { toBoardRow, type BoardRow, type K } from "./fleet-health-board-rows";
import { ListErrorState } from "../../../components/ListErrorState";
import { currentOriginHref, withReturnContext } from "../../../lib/returnContext";
import "../../../assets/fonts/v3-maintenance/fonts.css";
import "../../../assets/fonts/v3-maintenance/board-box.css";

const BSC = "'Barlow Semi Condensed'";

const GRID: CSSProperties = { display: "grid", gridTemplateColumns: "70px 150px 150px minmax(0, 1fr) 96px 190px 112px", alignItems: "center" };

/** The board's 122×52 top-down tractor (viewBox -14 96 314 128), cab in the state colour. */
export function BoardTractor({ r }: { r: Pick<BoardRow, "cab" | "body" | "moving" | "alert" | "aria"> }) {
  return (
    <svg width="122" height="52" viewBox="-14 96 314 128" role="img" aria-label={r.aria} data-v3="truck">
      {r.moving ? <path d="M-12 130h16M-12 160h22M-12 190h16" stroke="#9AA8B8" strokeWidth="5" strokeLinecap="round" /> : null}
      <g transform="rotate(-90 150 160)">
        <g>
        <ellipse cx="150" cy="160" rx="62" ry="138" fill="#1A2533" opacity=".28" />
        <rect x="128" y="18" width="7" height="186" rx="2" fill="#1B2533" /><rect x="165" y="18" width="7" height="186" rx="2" fill="#1B2533" />
        <rect x="128" y="40" width="44" height="5" fill="#1B2533" /><rect x="128" y="82" width="44" height="5" fill="#1B2533" />
        <rect x="100" y="28" width="28" height="28" rx="5" fill="#141B26" /><rect x="172" y="28" width="28" height="28" rx="5" fill="#141B26" />
        <rect x="100" y="70" width="28" height="28" rx="5" fill="#141B26" /><rect x="172" y="70" width="28" height="28" rx="5" fill="#141B26" />
        <path d="M114 30v24M114 72v24M186 30v24M186 72v24" stroke="#3A4658" strokeWidth="2" />
        <rect x="102" y="18" width="22" height="6" rx="2" fill="#2C3A4E" /><rect x="176" y="18" width="22" height="6" rx="2" fill="#2C3A4E" />
        <circle cx="150" cy="64" r="20" fill="#5D6B7D" stroke="#3A4658" strokeWidth="3" /><path d="M150 44v14" stroke="#2C3A4E" strokeWidth="5" />
        <rect x="96" y="150" width="16" height="48" rx="8" fill="#C9D2DC" stroke="#8C99AA" strokeWidth="1.5" />
        <rect x="188" y="150" width="16" height="48" rx="8" fill="#C9D2DC" stroke="#8C99AA" strokeWidth="1.5" />
        <path d="M98 160h12M98 186h12M190 160h12M190 186h12" stroke="#8C99AA" strokeWidth="1.5" />
        <rect x="111" y="104" width="78" height="58" rx="12" fill={r.cab} />
        <rect x="119" y="110" width="62" height="40" rx="8" fill="#FFFFFF" opacity=".14" />
        <rect x="113" y="160" width="74" height="40" rx="6" fill={r.cab} />
        <rect x="132" y="168" width="36" height="12" rx="3" fill="#FFFFFF" opacity=".2" />
        <rect x="98" y="198" width="15" height="7" rx="2" fill="#2C3A4E" /><rect x="187" y="198" width="15" height="7" rx="2" fill="#2C3A4E" />
        {r.body === "aero" ? <>
          <path d="M116 200h68l-4 14h-60z" fill="#A9C8E3" />
          <rect x="104" y="232" width="13" height="30" rx="4" fill="#141B26" /><rect x="183" y="232" width="13" height="30" rx="4" fill="#141B26" />
          <path d="M120 214h60l-3 64c-1 7-6 10-12 10h-30c-6 0-11-3-12-10z" fill={r.cab} />
          <path d="M150 218v66" stroke="#FFFFFF" strokeOpacity=".25" strokeWidth="2" />
          <rect x="128" y="286" width="44" height="7" rx="3" fill="#D3DBE5" />
          <rect x="124" y="276" width="10" height="5" rx="2" fill="#FDE68A" /><rect x="166" y="276" width="10" height="5" rx="2" fill="#FDE68A" />
        </> : null}
        {r.body === "classic" ? <>
          <path d="M117 200h66l-1 12h-64z" fill="#A9C8E3" />
          <rect x="102" y="234" width="14" height="30" rx="4" fill="#141B26" /><rect x="184" y="234" width="14" height="30" rx="4" fill="#141B26" />
          <rect x="119" y="212" width="62" height="72" rx="3" fill={r.cab} />
          <path d="M135 214v68M165 214v68" stroke="#FFFFFF" strokeOpacity=".22" strokeWidth="2" />
          <rect x="121" y="282" width="58" height="8" rx="2" fill="#D3DBE5" />
          <circle cx="113" cy="276" r="5" fill="#FDE68A" stroke="#B3B9C2" strokeWidth="1.5" /><circle cx="187" cy="276" r="5" fill="#FDE68A" stroke="#B3B9C2" strokeWidth="1.5" />
          <rect x="126" y="186" width="5" height="18" rx="2.5" fill="#D3DBE5" /><rect x="169" y="186" width="5" height="18" rx="2.5" fill="#D3DBE5" />
        </> : null}
        {r.body === "sloped" ? <>
          <path d="M114 198h72l-6 24h-60z" fill="#A9C8E3" />
          <rect x="104" y="232" width="13" height="28" rx="4" fill="#141B26" /><rect x="183" y="232" width="13" height="28" rx="4" fill="#141B26" />
          <path d="M120 222h60l-3 44c-1 8-7 12-14 12h-26c-7 0-13-4-14-12z" fill={r.cab} />
          <rect x="129" y="276" width="42" height="7" rx="3" fill="#D3DBE5" />
          <path d="M124 264h12M164 264h12" stroke="#FDE68A" strokeWidth="4" strokeLinecap="round" />
        </> : null}
        </g>
      </g>
      {r.alert ? <>
        <circle cx="286" cy="110" r="13" fill={r.cab} stroke="#FFFFFF" strokeWidth="3.5" />
        <path d="M281 115l5.5-5.5M288 105.5a2.8 2.8 0 1 0 3.5 3.5" stroke="#FFFFFF" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      </> : null}
    </svg>
  );
}

export function FleetHealthLineBoard({ companyId }: { companyId: string }) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const origin = currentOriginHref(pathname, search);
  const ret = (href: string) => withReturnContext(href, origin);
  const health = useQuery({ queryKey: ["maintenance", "fleet-health", companyId], queryFn: () => readFleetHealth(companyId), enabled: Boolean(companyId), staleTime: 60_000, refetchInterval: 180_000 });
  const rows = (health.data?.units ?? []).map((u) => toBoardRow(u, ret));
  const cnt: Record<K, number> = { over: 0, soon: 0, shop: 0, none: 0, ok: 0 };
  for (const r of rows) cnt[r.k]++;
  const tiles = [
    { n: cnt.over, label: "OVERDUE", color: "#C0262D" },
    { n: cnt.soon, label: "DUE ≤ 2 WK", color: "#C76A0A" },
    { n: cnt.shop, label: "IN SHOP", color: "#2456C7" },
    { n: cnt.none, label: "NO PM CLOCK", color: "#5B6B7E" },
  ];
  return (
    <div data-testid="fleet-health-line-board" data-v3-board="maintenance-vehicle-graphics/Main"
      style={{ fontFamily: "'Barlow', system-ui, sans-serif", lineHeight: "normal", color: "#101828", background: "#E9EDF2", boxSizing: "border-box", padding: "20px 28px 28px" }}>
      <div style={{ maxWidth: 1440, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <h1 data-v3="title" style={{ margin: 0, font: `800 28px/1 ${BSC}`, color: "#14213D" }}>Fleet Health Line</h1>
            <span data-v3="subtitle" style={{ fontSize: 13, color: "#4A5A70" }}>Each truck on its 25,000-mile road to the next PM · live Samsara odometer · 12,000 mi / month</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }} data-testid="fleet-health-board-tiles">
            {tiles.map((t) => (
              <span key={t.label} style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", borderRadius: 9, background: "#FFFFFF", boxShadow: "0 1px 0 #D5DCE5" }}>
                <span data-v3="t.n" style={{ font: `800 20px ${BSC}`, color: t.color }}>{health.data ? t.n : "—"}</span>
                <span data-v3="t.label" style={{ font: `700 11px ${BSC}`, letterSpacing: ".08em", color: "#33415A" }}>{t.label}</span>
              </span>
            ))}
            <button type="button" data-v3="newWo" onClick={() => navigate(ret("/maintenance/work-orders/new"))} style={{ height: 36, padding: "0 16px", borderRadius: 9, border: 0, background: "#14213D", font: "600 13px 'Barlow'", color: "#FFFFFF", cursor: "pointer" }}>New work order</button>
          </div>
        </div>
        {health.isError ? (
          <ListErrorState title="Couldn't load fleet health" status={0} message={health.error instanceof Error ? health.error.message : undefined} onRetry={() => void health.refetch()} />
        ) : (
          <div style={{ background: "#FFFFFF", borderRadius: 14, boxShadow: "0 1px 0 #D5DCE5", overflowX: "auto" }}>
            <div style={{ minWidth: 1200 }} role="table" aria-label="Fleet health line">
              <div role="row" data-v3="head" style={{ ...GRID, padding: "8px 16px", borderBottom: "1px solid #E3E8EF", font: `700 10.5px ${BSC}`, letterSpacing: ".12em", color: "#5B6B7E" }}>
                <div role="columnheader">UNIT</div><div role="columnheader">TRACTOR</div><div role="columnheader">MAKE · MODEL</div>
                <div role="columnheader">ROAD TO NEXT PM · 0 — 20K PLAN — 25K</div><div role="columnheader">NEXT PM</div>
                <div role="columnheader">LOCATION</div><div role="columnheader">STATUS</div>
              </div>
              {health.isPending ? <div role="status" style={{ padding: "12px 16px", fontSize: 12, color: "#5B6B7E" }}>Loading fleet health…</div> : null}
              {!health.isPending && rows.length === 0 ? <div style={{ padding: "12px 16px", fontSize: 12, color: "#5B6B7E" }}>No trucks on file.</div> : null}
              {rows.map((r) => (
                <div role="row" key={r.id} data-testid={`fleet-health-row-${r.id}`} data-v3="row" style={{ ...GRID, height: 56, padding: "0 16px", borderBottom: "1px solid #F0F3F7" }}>
                  <Link data-v3="r.unit" to={ret(`/fleet/units/${encodeURIComponent(r.id)}`)} style={{ font: `800 17px ${BSC}`, textDecoration: "none", color: "#14213D" }}>{r.unit}</Link>
                  <BoardTractor r={r} />
                  <div role="cell" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <span data-v3="r.make" style={{ font: "700 13px 'Barlow'", color: "#14213D" }}>{r.make}</span>
                    <span data-v3="r.odo" style={{ font: "500 11.5px 'IBM Plex Mono'", color: "#5B6B7E" }}>{r.odo}</span>
                  </div>
                  <div role="cell" style={{ paddingRight: 22, display: "flex", flexDirection: "column", gap: 2 }}>
                    <Link to={r.pmHref} aria-label={`${r.unit}: PM schedule`} style={{ display: "block", lineHeight: 0 }}>
                      <span role="progressbar" aria-valuemin={0} aria-valuemax={600} aria-valuenow={r.fillW} data-testid="fleet-health-pm-bar" style={{ display: "block" }}>
                        <svg width="100%" height="16" viewBox="0 0 600 16" preserveAspectRatio="none" aria-hidden="true">
                          <rect x="0" y="4" width="600" height="8" rx="4" fill="#DCE2EA" />
                          <rect x="0" y="4" width={r.fillW} height="8" rx="4" fill={r.road} />
                          <rect x="479" y="1" width="2.5" height="14" fill="#C76A0A" />
                          <rect x="596" y="0" width="4" height="16" fill="#C0262D" />
                        </svg>
                      </span>
                    </Link>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#4A5A70" }}>
                      <Link data-v3="r.sinceLabel" to={r.pmHref} style={{ color: "inherit", textDecoration: "none" }}>{r.sinceLabel}</Link>
                      <span data-v3="r.leftLabel" style={{ fontWeight: 700, color: r.leftColor }}>{r.leftLabel}</span>
                    </div>
                  </div>
                  <span role="cell" data-v3="r.nextPm" style={{ font: `800 15px ${BSC}`, color: r.leftColor }}>{r.nextPm}</span>
                  <span role="cell" data-v3="r.loc" style={{ fontSize: 12, color: "#33415A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.loc}</span>
                  <span role="cell" data-v3="r.status" style={{ display: "inline-flex", alignItems: "center", gap: 5, justifySelf: "start", padding: "3px 9px", borderRadius: 999, background: r.stBg, color: r.stFg, font: "700 11.5px 'Barlow'" }}>
                    <span style={{ width: 7, height: 7, borderRadius: 4, background: r.cab }} />{r.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div data-v3="footer" style={{ fontSize: 11.5, fontWeight: 600, color: "#8A4B06" }}>Live: units, make/model/year, odometers and locations (Samsara + unit records). A truck with no last-PM odometer on file shows "Enter last PM" until one is entered. Tractors drawn from above by body style (long-hood aero, classic square-hood, sloped-hood); no manufacturer logos.</div>
      </div>
    </div>
  );
}
