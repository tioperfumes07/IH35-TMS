/**
 * ROUND 326.5 — Driver Hub Home, built to docs/design/boards/driver-customers-vendors/Main.dc.html: title + six
 * tiles across (78px, not 216), one module-tab bar, one filter line (status chips, unit tokens, pay basis, search,
 * Master-detail / List, gear), then data: the driver list sorted by settlement due and the selected driver's panel
 * (five figures, integrity, recent activity, linked counts). Every figure comes from GET /api/v1/mdata/boards/drivers.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, apiRequest } from "../../api/client";
import { formatDateUS } from "../../lib/formatDate";
import { ListErrorState } from "../ListErrorState";
import { EntityLink, resolveEntityRoute, type EntityKind } from "../shared/EntityLink";
import "../../design/ih35-design-tokens.css";
import "./party-board.css";
import { formatUsdCentsTable } from "../../lib/money";

type HubRow = { id: string; name: string; status: string; phone: string | null; cdl: string | null; unit: string | null; basis: string | null; due_cents: number; due_count: number; on_load: boolean };
type Hub = {
  company_name: string | null;
  kpis: { active: number; total: number; on_loads: number; available: number; on_leave: number; settle_due: number; escrow_held_cents: number };
  chips: Record<"Active" | "Probation" | "OnLeave" | "Inactive" | "All", number>;
  rows: HubRow[];
};
type Panel = {
  driver: { id: string; name: string; status: string; unit: string | null; cdl_state: string | null; hire_date: string | null };
  figures: { settlement_due_cents: number; escrow_held_cents: number | null; advances_open_cents: number; miles_30d: number | null };
  integrity: { flags_90d: number };
  activity: Array<{ kind: string; at: string; what: string; cents: number | null; entity: string; id: string | null }>;
  linked: Record<string, number>;
};

const usd = (c: number) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Owner design law 7 + lib/money C-35/C-37 (Lead ruling ROUND 330.6): MISSING renders "—", a real measured zero renders
// "$0.00". The old ternary falsy-tested a number and turned every real $0.00 into "unknown".
const money = (c: number | null | undefined) => formatUsdCentsTable(c);
const int = (n: number) => n.toLocaleString("en-US");

export const DRIVER_HUB_TABS: Array<{ label: string; to: string }> = [
  { label: "Drivers", to: "/drivers" },
  { label: "Profiles", to: "/drivers/profiles" },
  { label: "Settlements ▾", to: "/drivers/settlements" },
  { label: "Cash advances", to: "/drivers/cash-advances" },
  { label: "Cash advance requests", to: "/driver-finance/cash-advance-requests" },
  { label: "Pay rate templates", to: "/drivers/pay-rate-templates" },
  { label: "Team splits", to: "/drivers/team-splits" },
  { label: "Driver disputes", to: "/drivers/disputes" },
  { label: "Leave", to: "/drivers/leave" },
  { label: "Teams", to: "/lists/driver/teams" },
];

const LINKED: Array<{ key: string; label: string; tab?: string }> = [
  { key: "loads", label: "Loads" }, { key: "settlements", label: "Settlements", tab: "settlements" }, { key: "fuel", label: "Fuel" },
  { key: "driver_reports", label: "Driver reports" }, { key: "accidents", label: "Accidents" }, { key: "insurance_claims", label: "Insurance claims" },
  { key: "legal", label: "Legal" }, { key: "documents", label: "Documents" },
];

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

function DriverPanel({ operatingCompanyId, driverId }: { operatingCompanyId: string; driverId: string }) {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["driver-hub-panel", operatingCompanyId, driverId],
    queryFn: () => apiRequest<Panel>(`/api/v1/mdata/boards/drivers/${driverId}?operating_company_id=${operatingCompanyId}`),
  });
  if (q.isError) return <ListErrorState status={q.error instanceof ApiError ? q.error.status : 0} message="Could not load this driver." onRetry={() => void q.refetch()} />;
  if (!q.data) return <div className="pb-panel-body pb-muted">Loading driver…</div>;
  const p = q.data;
  const flag = p.integrity.flags_90d > 0;
  const go = (kind: string, id: string | null) => {
    const to = id ? resolveEntityRoute(kind as EntityKind, id) : null;
    if (to) navigate(to);
  };
  return (
    <>
      <div className="pb-panel-head">
        <div>
          <div className="pb-panel-name">{p.driver.name}</div>
          <div className="pb-panel-meta">
            Unit {p.driver.unit ?? "—"} · CDL {p.driver.cdl_state ?? "—"} · hired {p.driver.hire_date ? formatDateUS(p.driver.hire_date) : "—"} · <b>{p.driver.status}</b>
          </div>
        </div>
        <Link className="pb-link" to={`/drivers/${p.driver.id}`}>Open full profile →</Link>
      </div>
      <div className="pb-panel-body">
        <div className="pb-figs">
          <div><div className="ih-hd">Settlement due</div><div className="pb-fig">{money(p.figures.settlement_due_cents)}</div></div>
          <div><div className="ih-hd">Escrow held</div><div className="pb-fig">{p.figures.escrow_held_cents == null ? "—" : usd(p.figures.escrow_held_cents)}</div></div>
          <div><div className="ih-hd">Advances open</div><div className="pb-fig">{money(p.figures.advances_open_cents)}</div></div>
          <div><div className="ih-hd">Miles, 30 days</div><div className="pb-fig">{p.figures.miles_30d == null ? "—" : int(p.figures.miles_30d)}</div></div>
          <div className={`pb-integrity${flag ? " pb-integrity--flag" : ""}`}>
            <div className="ih-hd">Integrity</div>
            <div className="pb-fig">{flag ? "Flagged" : "Clear"}</div>
            <div className="pb-tiny">{int(p.integrity.flags_90d)} flags · 90 days</div>
          </div>
        </div>
        <div className="pb-section">
          <div className="ih-hd" style={{ marginBottom: 6 }}>Recent activity</div>
          {p.activity.length === 0 ? <div className="pb-muted">No activity recorded for this driver.</div> : (
            <table className="ih-table">
              <tbody>
                {p.activity.map((a, i) => (
                  <tr key={`${a.kind}:${a.id ?? i}`} style={{ cursor: a.id ? "pointer" : undefined }} onClick={() => go(a.entity, a.id)}>
                    <td className="pb-sub-sm" style={{ width: 84 }}>{formatDateUS(a.at)}</td>
                    <td style={{ width: 70 }}><span className={`pb-badge pb-badge--${a.kind}`}>{a.kind}</span></td>
                    <td className="pb-muted2">{a.what}</td>
                    <td className="ih-num pb-strong text-right tabular-nums" style={{ width: 96 }}>
                      {a.id && resolveEntityRoute(a.entity as EntityKind, a.id) ? (
                        <EntityLink kind={a.entity as EntityKind} id={a.id} label={money(a.cents)} />
                      ) : (
                        money(a.cents)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="pb-section">
          <div className="ih-hd" style={{ marginBottom: 6 }}>Linked</div>
          <div className="pb-chips">
            {LINKED.map((l) => (
              <Link key={l.key} className="pb-linkchip" to={`/drivers/${p.driver.id}${l.tab ? `?tab=${l.tab}` : ""}`}>{l.label} ({int(p.linked[l.key] ?? 0)})</Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export function DriverHubBoard(props: { operatingCompanyId: string; onList: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [status, setStatus] = useState<keyof Hub["chips"]>("Active");
  const [units, setUnits] = useState<string[]>([]);
  const [basis, setBasis] = useState("all");
  const [search, setSearch] = useState("");
  const [hidden, setHidden] = useState<string[]>([]);
  const [gearOpen, setGearOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["driver-hub", props.operatingCompanyId],
    queryFn: () => apiRequest<Hub>(`/api/v1/mdata/boards/drivers?operating_company_id=${props.operatingCompanyId}`),
  });
  const term = search.trim().toLowerCase();
  const rows = useMemo(() => (q.data?.rows ?? []).filter((r) =>
    (term ? [r.name, r.phone ?? "", r.cdl ?? ""].some((v) => v.toLowerCase().includes(term))
      : status === "All" ? true : status === "Inactive" ? r.status === "Inactive" || r.status === "Terminated" : r.status === status)
    && (units.length === 0 || (r.unit != null && units.includes(r.unit)))
    && (basis === "all" || (basis === "none" ? r.basis == null : r.basis === basis))), [q.data, term, status, units, basis]);
  if (q.isError) return <ListErrorState status={q.error instanceof ApiError ? q.error.status : 0} message="Could not load drivers." onRetry={() => void q.refetch()} />;
  const h = q.data;
  const current = selected && rows.some((r) => r.id === selected) ? selected : rows[0]?.id ?? null;
  const allUnits = [...new Set((h?.rows ?? []).map((r) => r.unit).filter((u): u is string => Boolean(u)))].sort();
  const bases = [...new Set((h?.rows ?? []).map((r) => r.basis).filter((b): b is string => Boolean(b)))].sort();
  const cols = [
    { key: "unit", label: "Unit" }, { key: "basis", label: "Pay basis" }, { key: "due", label: "Due" },
  ];
  const show = (k: string) => !hidden.includes(k);
  const statusLabel: Record<keyof Hub["chips"], string> = { Active: "Active", Probation: "Probation", OnLeave: "On leave", Inactive: "Inactive", All: "All" };
  const tiles = h ? [
    { label: "Active", value: `${int(h.kpis.active)} / ${int(h.kpis.total)}`, tone: "navy", onClick: () => setStatus("Active") },
    { label: "On loads", value: int(h.kpis.on_loads) },
    { label: "Available", value: int(h.kpis.available) },
    { label: "On leave", value: int(h.kpis.on_leave), onClick: () => setStatus("OnLeave") },
    { label: "Settle due", value: int(h.kpis.settle_due), tone: h.kpis.settle_due ? "amber" : undefined, onClick: () => navigate("/drivers/settlements") },
    { label: "Escrow held", value: money(h.kpis.escrow_held_cents) },
  ] : [];

  return (
    <div className="pb" data-testid="driver-hub-board">
      <div className="pb-head">
        <div className="pb-head-row">
          <div>
            <div className="pb-title">Driver Hub Home</div>
            <div className="pb-sub">{h ? `${int(h.kpis.total)} drivers · ${int(h.kpis.active)} active · ${h.company_name ?? ""}` : "Loading drivers…"}</div>
          </div>
          <div className="pb-head-actions">
            <button type="button" className="pb-refresh" onClick={() => void qc.invalidateQueries({ queryKey: ["driver-hub"] }).then(() => qc.invalidateQueries({ queryKey: ["driver-hub-panel"] }))}>Refresh</button>
            <button type="button" className="pb-create" onClick={() => navigate("/drivers/profiles?view=list&create=1")}>+ Create Driver</button>
          </div>
        </div>
        <div className="pb-kpis" data-testid="driver-hub-kpis">
          {(tiles.length ? tiles : Array.from({ length: 6 }, () => ({ label: "", value: "…" } as (typeof tiles)[number]))).map((t, i) => (
            <button key={`${t.label}:${i}`} type="button" className={`pb-kpi pb-kpi-btn${t.tone ? ` pb-kpi--${t.tone}` : ""}`} onClick={t.onClick}>
              <div className="ih-hd">{t.label || " "}</div>
              <div className="pb-kpi-v">{t.value}</div>
            </button>
          ))}
        </div>
      </div>

      <nav className="pb-tabs" aria-label="Drivers module">
        {DRIVER_HUB_TABS.map((t) => (
          <Link key={t.to} className="pb-tab" to={t.to} aria-current={t.to === "/drivers/profiles" ? "page" : undefined}>{t.label}</Link>
        ))}
      </nav>

      <div className="pb-bar">
        {(["Active", "Probation", "OnLeave", "Inactive", "All"] as const).map((s) => (
          <button key={s} type="button" className="pb-chip" aria-pressed={status === s && !term} onClick={() => { setStatus(s); setSearch(""); }}>
            {statusLabel[s]} {int(h?.chips[s] ?? 0)}
          </button>
        ))}
        <span className="pb-sep" />
        <div className="pb-tokens">
          {units.map((u) => (
            <span key={u} className="pb-token">{u} <button type="button" aria-label={`Remove ${u}`} onClick={() => setUnits(units.filter((x) => x !== u))}>×</button></span>
          ))}
          <input className="pb-token-add" list="pb-hub-units" placeholder="Unit…" aria-label="Add unit"
            onChange={(e) => { const v = e.target.value; if (allUnits.includes(v) && !units.includes(v)) { setUnits([...units, v]); e.target.value = ""; } }} />
          <datalist id="pb-hub-units">{allUnits.map((u) => <option key={u} value={u} />)}</datalist>
        </div>
        <select aria-label="Pay basis" className="pb-select" value={basis} onChange={(e) => setBasis(e.target.value)}>
          <option value="all">All pay bases</option>
          {bases.map((b) => <option key={b} value={b}>{b}</option>)}
          <option value="none">No rate card</option>
        </select>
        <label htmlFor="pb-dsearch" style={{ position: "absolute", left: -9999 }}>Search drivers</label>
        <input id="pb-dsearch" type="search" className="pb-search" placeholder="Search name, phone, CDL…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button type="button" className="pb-chip" aria-pressed>Master-detail</button>
        <button type="button" className="pb-chip" aria-pressed={false} onClick={props.onList}>List</button>
        <span style={{ position: "relative" }}>
          <button type="button" className="pb-gear" aria-label="Choose columns" title="Choose columns" aria-expanded={gearOpen} onClick={() => setGearOpen((v) => !v)}><GearIcon /></button>
          {gearOpen ? (
            <div className="pb-menu" role="dialog" aria-label="Choose columns">
              <label><input type="checkbox" checked disabled />Driver</label>
              {cols.map((c) => (
                <label key={c.key}><input type="checkbox" checked={show(c.key)} onChange={() => setHidden(show(c.key) ? [...hidden, c.key] : hidden.filter((k) => k !== c.key))} />{c.label}</label>
              ))}
            </div>
          ) : null}
        </span>
      </div>

      <div className="pb-md">
        <div className="pb-card">
          <div className="pb-md-head">
            <span className="ih-hd">{int(rows.length)} {term ? "matching" : statusLabel[status].toLowerCase()} drivers</span>
            <span className="pb-sub-sm">Sorted by settlement due</span>
          </div>
          <div style={{ overflow: "auto", minHeight: 0 }}>
            <table className="ih-table">
              <thead>
                <tr>
                  <th className="ih-hd" style={{ textAlign: "left" }}>Driver</th>
                  {show("unit") ? <th className="ih-hd" style={{ textAlign: "left", width: 62 }}>Unit</th> : null}
                  {show("basis") ? <th className="ih-hd" style={{ textAlign: "left", width: 86 }}>Pay basis</th> : null}
                  {show("due") ? <th className="ih-hd" style={{ textAlign: "right", width: 96 }}>Due</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.id === current ? "pb-row-sel" : undefined} style={{ cursor: "pointer" }} onClick={() => setSelected(r.id)}>
                    <td><button type="button" className="pb-name" onClick={() => setSelected(r.id)}>{r.name}</button></td>
                    {show("unit") ? <td className="pb-strong">{r.unit ?? <span className="ih-empty">—</span>}</td> : null}
                    {show("basis") ? <td className="pb-sub-sm">{r.basis ?? "—"}</td> : null}
                    {show("due") ? <td className="ih-num pb-strong text-right tabular-nums">{money(r.due_cents)}</td> : null}
                  </tr>
                ))}
                {h && rows.length === 0 ? <tr><td colSpan={4} className="pb-muted">No driver matches this filter.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
        <div className="pb-card">
          {current ? <DriverPanel operatingCompanyId={props.operatingCompanyId} driverId={current} /> : <div className="pb-panel-body pb-muted">{h ? "Select a driver." : "Loading…"}</div>}
        </div>
      </div>
    </div>
  );
}
