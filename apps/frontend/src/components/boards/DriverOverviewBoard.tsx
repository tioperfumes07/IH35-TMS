/**
 * DRV-F420 / F416 / F421 / F422 / F415 — driver profile shell.
 * All 17 tabs render here, scoped to this driver. Active tab is ?tab=.
 */
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AddPayLineModal } from "../driver-finance/AddPayLineModal";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, apiRequest } from "../../api/client";
import { formatDateUS } from "../../lib/formatDate";
import { ListErrorState } from "../ListErrorState";
import { EntityLink, resolveEntityRoute } from "../shared/EntityLink";
import { DriverSamsaraDuplicateBanner } from "../driver-profile/DriverSamsaraDuplicateBanner";
import { DriverEditForm } from "../../pages/drivers/DriverEditForm";
import {
  DRIVER_PROFILE_MORE_TABS,
  DRIVER_PROFILE_STRIP_TABS,
  driverProfileTabHref,
  parseDriverProfileTab,
  type DriverProfileTab,
} from "../../pages/drivers/driverProfileTabs";
import { CollapsibleProfileCard } from "./CollapsibleProfileCard";
import "../../design/ih35-design-tokens.css";
import "./party-board.css";
import { formatUsdCentsTable } from "../../lib/money";

type Integrity = { key: string; label: string; his: number | null; fleet: number | null; worse: "higher" | "lower"; unit?: string; money?: boolean };
type Overview = {
  driver: { id: string; name: string; status: string; unit: string | null; phone: string | null; cdl: string | null; hire_date: string | null; pay_basis: string | null };
  tiles: {
    settlement_due_cents: number; settlements_due: number; additional_pay_cents: number; additional_items: number; escrow_held_cents: number | null; escrow_target_cents: number | null;
    miles_30d: number; fleet_miles_30d_per_driver: number; mpg_30d: number | null; fleet_mpg_30d: number | null; complaints_90d: number; fleet_complaints_avg_90d: number; integrity_flags_90d: number;
  };
  settlements: Array<{ id: string; display_id: string; status: string; closed_at: string | null; loads: number; miles: number; line_haul_cents: number; additional_cents: number; deductions_cents: number; net_cents: number }>;
  settlement_count: number;
  additional: Array<{ id: string; at: string; line_type: string; kind: string; description: string | null; amount_cents: number; load_id: string | null; load_number: string | null; settlement_id: string; settlement: string | null; approved_by: string | null }>;
  complaints: Array<{ id: string; at: string; kind: string; summary: string | null; load_id: string | null; load_number: string | null; raised_by: string | null; outcome: string | null; cost_cents: number | null; severity: string | null }>;
  reports: Array<{ id: string; kind: string; unit: string | null; what: string | null; at: string | null; outcome: string | null; cost_cents: number | null; entity: string }>;
  integrity: Integrity[];
  integrity_flagged: string[];
  trucks: Array<{ unit_id: string; unit: string; from: string; to: string | null; miles: number; mpg: number | null }>;
  pay_terms: { basis: string | null; rate_per_mile_cents: number | null; empty_rate_per_mile_cents: number | null; flat_per_load_cents: number | null; worker_class: string | null; net_pay_floor_pct: number | null; escrow_target_cents: number | null };
  compliance: { cdl_expires: string | null; medical_card: string | null; mvr_review: string | null; drug_screen_last: string | null; hos_violations_90d: number };
};

const usd = (c: number) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money = (c: number | null | undefined) => formatUsdCentsTable(c);
const int = (n: number) => n.toLocaleString("en-US");
const day = (d: string | null | undefined) => (d ? formatDateUS(d) : "—");
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

/** Every tab stays on /drivers/:id. Never /safety or /dispatch. */
export const DRIVER_DETAIL_TABS = (id: string): Array<{ label: DriverProfileTab; to: string }> =>
  DRIVER_PROFILE_STRIP_TABS.map((label) => ({ label, to: driverProfileTabHref(id, label) }));

const kindTone = (k: string) => (/detention|layover|wait|late|damage/i.test(k) ? "amber" : /refus|accident/i.test(k) ? "red" : /bonus|report|mechanical/i.test(k) ? "navy" : "");
const fmtIntegrity = (i: Integrity, v: number | null) => (v == null ? "—" : i.money ? usd(v) : `${v}${i.unit ?? ""}`);

function ProfileTabStrip({ driverId, activeTab }: { driverId: string; activeTab: DriverProfileTab }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = DRIVER_PROFILE_MORE_TABS.includes(activeTab as (typeof DRIVER_PROFILE_MORE_TABS)[number]);
  return (
    <nav className="dd-tabs" aria-label="Driver" data-testid="driver-profile-tab-strip">
      {DRIVER_PROFILE_STRIP_TABS.map((label) => (
        <Link
          key={label}
          className="pb-tab"
          to={driverProfileTabHref(driverId, label)}
          aria-current={activeTab === label ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
      <div className="relative">
        <button
          type="button"
          className="pb-tab"
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          data-testid="driver-profile-more"
          onClick={() => setMoreOpen((v) => !v)}
        >
          {moreActive ? activeTab : "More"} ▾
        </button>
        {moreOpen ? (
          <div className="absolute left-0 z-20 mt-1 min-w-[180px] rounded-sm border border-[#D8E0E8] bg-white p-1 shadow-sm" role="menu">
            {DRIVER_PROFILE_MORE_TABS.map((label) => (
              <Link
                key={label}
                role="menuitem"
                className="block px-2 py-1 text-[12px] text-[#0F1B2D] hover:bg-[var(--surface-hover)]"
                to={driverProfileTabHref(driverId, label)}
                onClick={() => setMoreOpen(false)}
              >
                {label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </nav>
  );
}

export function DriverOverviewBoard(props: {
  operatingCompanyId: string;
  driverId: string;
  /** When true, the page owns the identity header. The tab strip still renders here. */
  hideChrome?: boolean;
  children?: ReactNode;
}) {
  const [addPayOpen, setAddPayOpen] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeTab = parseDriverProfileTab(searchParams);
  const q = useQuery({
    queryKey: ["driver-overview", props.operatingCompanyId, props.driverId],
    queryFn: () => apiRequest<Overview>(`/api/v1/mdata/boards/drivers/${props.driverId}/overview?operating_company_id=${props.operatingCompanyId}`),
    enabled: activeTab !== "Edit",
  });
  if (activeTab === "Edit") {
    return (
      <div className="pb" data-testid="driver-overview-board" data-active-tab="Edit">
        {props.hideChrome ? null : (
          <div className="dd-head">
            <div className="pb-head-row">
              <div className="dd-id">
                <div className="pb-title">Edit driver</div>
              </div>
            </div>
            <ProfileTabStrip driverId={props.driverId} activeTab={activeTab} />
          </div>
        )}
        {props.hideChrome ? <ProfileTabStrip driverId={props.driverId} activeTab={activeTab} /> : null}
        <div className="dd-body">
          <DriverEditForm driverId={props.driverId} operatingCompanyId={props.operatingCompanyId} />
        </div>
      </div>
    );
  }
  if (q.isError) return <ListErrorState status={q.error instanceof ApiError ? q.error.status : 0} message="Could not load this driver." onRetry={() => void q.refetch()} />;
  if (!q.data) return <div className="pb"><div className="dd-body pb-muted">Loading driver…</div></div>;
  const o = q.data;
  const t = o.tiles;
  const go = (kind: Parameters<typeof resolveEntityRoute>[0], id: string | null) => { const to = id ? resolveEntityRoute(kind, id) : null; if (to) navigate(to); };
  const runSettlement = () => navigate(`/driver-finance/settlement-creator?driver_id=${o.driver.id}`);
  const flagged = t.integrity_flags_90d > 0;
  const sum = (k: "loads" | "miles" | "line_haul_cents" | "additional_cents" | "deductions_cents" | "net_cents") => o.settlements.reduce((s, r) => s + r[k], 0);
  const tiles = [
    { label: "Settlement due", value: money(t.settlement_due_cents), sub: `${int(t.settlements_due)} unpaid` },
    { label: "Additional pay", value: money(t.additional_pay_cents), sub: `${int(t.additional_items)} items, 90 days` },
    { label: "Escrow held", value: t.escrow_held_cents == null ? "—" : usd(t.escrow_held_cents), sub: t.escrow_target_cents ? `target ${usd(t.escrow_target_cents)}` : "no target set" },
    { label: "Miles, 30 days", value: t.miles_30d ? int(t.miles_30d) : "—", sub: `fleet ${int(t.fleet_miles_30d_per_driver)}` },
    { label: "MPG, 30 days", value: t.mpg_30d == null ? "—" : String(t.mpg_30d), sub: `fleet ${t.fleet_mpg_30d ?? "—"}` },
    { label: "Complaints", value: int(t.complaints_90d), sub: `fleet avg ${t.fleet_complaints_avg_90d} · 90 days`, tone: t.complaints_90d > t.fleet_complaints_avg_90d && t.complaints_90d > 0 ? "amber" : "", to: driverProfileTabHref(o.driver.id, "Complaints") },
    { label: "Integrity", value: flagged ? "Flagged" : "Clear", sub: `${int(t.integrity_flags_90d)} flags · 90 days`, tone: flagged ? "amber" : "navy" },
  ];
  const scope = `driver-profile.${o.driver.id}.${activeTab}`;

  return (
    <div className="pb" data-testid="driver-overview-board" data-active-tab={activeTab}>
      {props.hideChrome ? (
        <ProfileTabStrip driverId={o.driver.id} activeTab={activeTab} />
      ) : (
      <div className="dd-head">
        <div className="pb-head-row">
          <div className="dd-id">
            <div className="dd-avatar" aria-hidden="true">{initials(o.driver.name)}</div>
            <div>
              <div className="pb-title">{o.driver.name}</div>
              <div className="pb-sub">
                Unit {o.driver.unit ?? "—"} · {o.driver.phone ?? "no phone"} · CDL {o.driver.cdl ?? "—"} · hired {day(o.driver.hire_date)} · {o.driver.pay_basis ?? "no rate card"}
              </div>
              <DriverSamsaraDuplicateBanner companyId={props.operatingCompanyId} driverId={o.driver.id} />
            </div>
            <span className="dd-pill">{o.driver.status}</span>
          </div>
          <div className="pb-head-actions">
            <Link className="dd-btn" to={driverProfileTabHref(o.driver.id, "Edit")} data-testid="driver-overview-edit">Edit</Link>
            <button type="button" className="dd-btn" onClick={() => setAddPayOpen(true)} data-testid="driver-add-payment">Add payment</button>
            <button type="button" className="dd-btn dd-btn--primary" onClick={runSettlement}>Run settlement</button>
          </div>
        </div>
        <ProfileTabStrip driverId={o.driver.id} activeTab={activeTab} />
      </div>
      )}

      {activeTab !== "Overview" ? (
        <div className="dd-body">{props.children}</div>
      ) : (
      <div className="dd-body">
        <div className="dd-kpis" data-testid="driver-overview-kpis">
          {tiles.map((k) => {
            const inner = (
              <>
                <div className="ih-hd">{k.label}</div>
                <div className="dd-kpi-v">{k.value}</div>
                <div className="dd-kpi-sub">{k.sub}</div>
              </>
            );
            return k.to ? (
              <Link key={k.label} className={`pb-kpi${k.tone ? ` dd-kpi--${k.tone}` : ""}`} to={k.to}>{inner}</Link>
            ) : (
              <div key={k.label} className={`pb-kpi${k.tone ? ` dd-kpi--${k.tone}` : ""}`}>{inner}</div>
            );
          })}
        </div>

        <div className="dd-cols">
          <div className="dd-col">
            <CollapsibleProfileCard
              scope={scope}
              cardId="settlements"
              title="Settlements"
              count={o.settlement_count}
              action={<Link className="pb-link" to={driverProfileTabHref(o.driver.id, "Settlements")}>All {int(o.settlement_count)} →</Link>}
            >
              {o.settlements.length === 0 ? <div className="dd-note">No settlement has been issued to this driver.</div> : (
                <table className="ih-table">
                  <thead>
                    <tr>
                      <th className="ih-hd" style={{ textAlign: "left" }}>Settlement</th>
                      <th className="ih-hd" style={{ textAlign: "right", width: 92 }}>Closed</th>
                      <th className="ih-hd" style={{ textAlign: "right", width: 54 }}>Loads</th>
                      <th className="ih-hd" style={{ textAlign: "right", width: 70 }}>Miles</th>
                      <th className="ih-hd" style={{ textAlign: "right" }}>Line haul</th>
                      <th className="ih-hd" style={{ textAlign: "right" }}>Additional</th>
                      <th className="ih-hd" style={{ textAlign: "right" }}>Deductions</th>
                      <th className="ih-hd" style={{ textAlign: "right" }}>Net pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.settlements.map((s) => (
                      <tr key={s.id}>
                        <td><EntityLink kind="settlement" id={s.id} label={s.display_id} /></td>
                        <td className="ih-num pb-muted">{s.status === "closed" ? day(s.closed_at) : s.status}</td>
                        <td className="ih-num">{int(s.loads)}</td>
                        <td className="ih-num">{s.miles ? int(s.miles) : <span className="ih-empty">—</span>}</td>
                        <td className="ih-num text-right tabular-nums">{money(s.line_haul_cents)}</td>
                        <td className="ih-num text-right tabular-nums">{s.additional_cents ? usd(s.additional_cents) : <span className="ih-empty">—</span>}</td>
                        <td className="ih-num text-right tabular-nums">{money(s.deductions_cents)}</td>
                        <td className="ih-num pb-strong text-right tabular-nums">{money(s.net_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="pb-foot">
                      <td colSpan={2}>{int(o.settlements.length)} settlements</td>
                      <td className="ih-num">{int(sum("loads"))}</td>
                      <td className="ih-num">{int(sum("miles"))}</td>
                      <td className="ih-num text-right tabular-nums">{money(sum("line_haul_cents"))}</td>
                      <td className="ih-num text-right tabular-nums">{money(sum("additional_cents"))}</td>
                      <td className="ih-num text-right tabular-nums">{money(sum("deductions_cents"))}</td>
                      <td className="ih-num text-right tabular-nums">{money(sum("net_cents"))}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </CollapsibleProfileCard>

            <CollapsibleProfileCard
              scope={scope}
              cardId="additional"
              title="Additional payments"
              subtitle="Anything paid outside line haul — it rides the settlement, it never becomes a separate cheque"
              count={o.additional.length}
              action={<button type="button" className="dd-add" onClick={runSettlement}>+ Add</button>}
            >
              {o.additional.length === 0 ? <div className="dd-note">No additional payment in the last 90 days.</div> : (
                <table className="ih-table">
                  <thead>
                    <tr>
                      <th className="ih-hd" style={{ textAlign: "right", width: 92 }}>Date</th>
                      <th className="ih-hd" style={{ textAlign: "left" }}>Kind</th>
                      <th className="ih-hd" style={{ textAlign: "left" }}>Reason</th>
                      <th className="ih-hd" style={{ textAlign: "left" }}>Load</th>
                      <th className="ih-hd" style={{ textAlign: "left" }}>Settlement</th>
                      <th className="ih-hd" style={{ textAlign: "left" }}>Approved by</th>
                      <th className="ih-hd" style={{ textAlign: "right" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.additional.map((p) => (
                      <tr key={p.id}>
                        <td className="ih-num pb-muted">{day(p.at)}</td>
                        <td><span className={`dd-tag${kindTone(p.kind) ? ` dd-tag--${kindTone(p.kind)}` : ""}`}>{p.kind.replace(/_/g, " ")}</span></td>
                        <td className="pb-muted2">{p.description ?? "—"}</td>
                        <td>{p.load_id ? <button type="button" className="pb-name" onClick={() => go("load", p.load_id)}>{p.load_number}</button> : "—"}</td>
                        <td><button type="button" className="pb-name" onClick={() => go("settlement", p.settlement_id)}>{p.settlement ?? "—"}</button></td>
                        <td className="pb-muted2">{p.approved_by ?? "—"}</td>
                        <td className="ih-num pb-strong text-right tabular-nums">{usd(p.amount_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="pb-foot">
                      <td colSpan={6}>{int(o.additional.length)} payments, last 90 days</td>
                      <td className="ih-num text-right tabular-nums">{money(t.additional_pay_cents)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </CollapsibleProfileCard>

            <CollapsibleProfileCard
              scope={scope}
              cardId="complaints"
              title="Complaints against the driver"
              subtitle="Late, refused to roll, service failure — logged with who raised it and what it cost"
              count={o.complaints.length}
              action={
                <span className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    className="dd-add"
                    onClick={() => navigate(driverProfileTabHref(o.driver.id, "Complaints"))}
                    data-testid="driver-log-complaint"
                  >
                    + Log complaint
                  </button>
                  <Link className="pb-link" to={driverProfileTabHref(o.driver.id, "Complaints")} data-testid="complaints-view-all">
                    View all
                  </Link>
                </span>
              }
            >
              {o.complaints.length === 0 ? <div className="dd-note">No complaint against this driver in the last 90 days · fleet average {t.fleet_complaints_avg_90d}.</div> : (
                <table className="ih-table">
                  <thead>
                    <tr>
                      <th className="ih-hd" style={{ textAlign: "right", width: 92 }}>Date</th>
                      <th className="ih-hd" style={{ textAlign: "left" }}>Kind</th>
                      <th className="ih-hd" style={{ textAlign: "left" }}>What happened</th>
                      <th className="ih-hd" style={{ textAlign: "left" }}>Load</th>
                      <th className="ih-hd" style={{ textAlign: "left" }}>Raised by</th>
                      <th className="ih-hd" style={{ textAlign: "left" }}>Outcome</th>
                      <th className="ih-hd" style={{ textAlign: "right" }}>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.complaints.map((c) => (
                      <tr key={c.id}>
                        <td className="ih-num pb-muted">{day(c.at)}</td>
                        <td><span className={`dd-tag${kindTone(c.kind) ? ` dd-tag--${kindTone(c.kind)}` : ""}`}>{c.kind.replace(/_/g, " ")}</span></td>
                        <td className="pb-muted2">{c.summary ?? "—"}</td>
                        <td>{c.load_id ? <button type="button" className="pb-name" onClick={() => go("load", c.load_id)}>{c.load_number}</button> : "—"}</td>
                        <td className="pb-muted2">{c.raised_by ?? "—"}</td>
                        <td className="pb-muted2">{c.outcome ?? "—"}</td>
                        <td className={`ih-num${c.cost_cents ? " dd-red" : ""} text-right tabular-nums`}>{money(c.cost_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="pb-foot">
                      <td colSpan={6}>{int(o.complaints.length)} complaints, 90 days · fleet average {t.fleet_complaints_avg_90d}</td>
                      <td className="ih-num text-right tabular-nums">{money(o.complaints.reduce((s, c) => s + (c.cost_cents ?? 0), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </CollapsibleProfileCard>

            <CollapsibleProfileCard scope={scope} cardId="reports" title="Reports &amp; damage he filed" count={o.reports.length}>
              {o.reports.length === 0 ? <div className="dd-note">No driver report and no DVIR defect filed by this driver.</div> : (
                <table className="ih-table">
                  <thead>
                    <tr>
                      <th className="ih-hd" style={{ textAlign: "left" }}>Kind</th>
                      <th className="ih-hd" style={{ textAlign: "left" }}>Unit</th>
                      <th className="ih-hd" style={{ textAlign: "left" }}>What</th>
                      <th className="ih-hd" style={{ textAlign: "right", width: 92 }}>Reported</th>
                      <th className="ih-hd" style={{ textAlign: "left" }}>Outcome</th>
                      <th className="ih-hd" style={{ textAlign: "right" }}>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.reports.map((r) => (
                      <tr key={`${r.entity}:${r.id}`}>
                        <td><span className={`dd-tag${kindTone(r.kind) ? ` dd-tag--${kindTone(r.kind)}` : ""}`}>{r.kind}</span></td>
                        <td className="pb-strong">{r.unit ?? "—"}</td>
                        <td className="pb-muted2">{r.what ?? "—"}</td>
                        <td className="ih-num pb-muted">{day(r.at)}</td>
                        <td className="pb-muted2">{r.outcome ?? "—"}</td>
                        <td className="ih-num text-right tabular-nums">{money(r.cost_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CollapsibleProfileCard>
          </div>

          <div className="dd-col">
            <CollapsibleProfileCard
              scope={scope}
              cardId="integrity"
              title="Integrity"
              count={t.integrity_flags_90d}
              action={<span className={`dd-tag ${flagged ? "dd-tag--amber" : "dd-tag--navy"}`}>{flagged ? "Flagged" : "Clear"}</span>}
            >
              <div>
                {o.integrity.map((i) => (
                  <div key={i.key} className="dd-kv">
                    <span>{i.label}</span>
                    <span>
                      {i.fleet != null ? <span className="dd-fleet">fleet {fmtIntegrity(i, i.fleet)}</span> : null}
                      <span className={`ih-num${o.integrity_flagged.includes(i.key) ? " dd-warn" : ""}`}>{fmtIntegrity(i, i.his)}</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="dd-note">
                Every rate is per mile <strong>he</strong> drove, from his own Samsara driver record — not a raw count, which would punish the hardest worker in the fleet. A band is evidence to look at, never a verdict.
              </div>
            </CollapsibleProfileCard>

            <CollapsibleProfileCard
              scope={scope}
              cardId="trucks"
              title="Trucks he has held"
              subtitle="How damage gets pinned on the right man when trucks rotate"
              count={o.trucks.length}
            >
              {o.trucks.length === 0 ? <div className="dd-note">No truck assignment recorded for this driver.</div> : (
                <table className="ih-table">
                  <tbody>
                    {o.trucks.map((a) => (
                      <tr key={`${a.unit_id}:${a.from}`} style={{ cursor: "pointer" }} onClick={() => go("unit", a.unit_id)}>
                        <td className="pb-strong">{a.unit}</td>
                        <td className="ih-num pb-muted">{day(a.from)} — {a.to ? day(a.to) : "now"}</td>
                        <td className="ih-num">{a.miles ? `${int(a.miles)} mi` : <span className="ih-empty">—</span>}</td>
                        <td className="ih-num">{a.mpg == null ? <span className="ih-empty">—</span> : `${a.mpg} mpg`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CollapsibleProfileCard>

            <CollapsibleProfileCard scope={scope} cardId="pay-terms" title="Pay terms">
              <div>
                <div className="dd-kv"><span>Pay basis</span><span className="ih-num">{o.pay_terms.basis ?? "No rate card"}</span></div>
                <div className="dd-kv"><span>Rate</span><span className="ih-num">{o.pay_terms.rate_per_mile_cents != null ? `${usd(o.pay_terms.rate_per_mile_cents)} / mi` : o.pay_terms.flat_per_load_cents != null ? `${usd(o.pay_terms.flat_per_load_cents)} / load` : "—"}</span></div>
                <div className="dd-kv"><span>Empty miles</span><span className="ih-num">{o.pay_terms.empty_rate_per_mile_cents != null ? `${usd(o.pay_terms.empty_rate_per_mile_cents)} / mi` : "—"}</span></div>
                <div className="dd-kv"><span>Worker class</span><span className="ih-num">{o.pay_terms.worker_class ?? "—"}</span></div>
                <div className="dd-kv"><span>Net pay floor</span><span className="ih-num">{o.pay_terms.net_pay_floor_pct != null ? `${o.pay_terms.net_pay_floor_pct}%` : "—"}</span></div>
                <div className="dd-kv"><span>Escrow target</span><span className="ih-num">{money(o.pay_terms.escrow_target_cents)}</span></div>
              </div>
            </CollapsibleProfileCard>

            <CollapsibleProfileCard scope={scope} cardId="compliance" title="Compliance">
              <div>
                <div className="dd-kv"><span>CDL expiration</span><span className="ih-num">{day(o.compliance.cdl_expires)}</span></div>
                <div className="dd-kv"><span>Medical card</span><span className="ih-num">{day(o.compliance.medical_card)}</span></div>
                <div className="dd-kv"><span>Annual MVR review</span><span className="ih-num">{day(o.compliance.mvr_review)}</span></div>
                <div className="dd-kv"><span>Drug screen, last</span><span className="ih-num">{day(o.compliance.drug_screen_last)}</span></div>
                <div className="dd-kv"><span>Hours violations, 90 days</span><span className="ih-num">{o.compliance.hos_violations_90d ? int(o.compliance.hos_violations_90d) : "None"}</span></div>
              </div>
            </CollapsibleProfileCard>
          </div>
        </div>
        {props.children}
      </div>
      )}
      <AddPayLineModal open={addPayOpen} onClose={() => setAddPayOpen(false)} operatingCompanyId={props.operatingCompanyId} driverId={props.driverId} driverName={o.driver.name} />
    </div>
  );
}
