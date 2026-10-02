/**
 * ROUND 326.5 — DriverDetail board, Overview (docs/design/boards/driver-customers-vendors/DriverDetail.dc.html):
 * identity header + Edit / Add payment / Run settlement, one tab strip, seven tiles across, then settlements (line
 * haul / additional / deductions), additional payments, complaints, reports & damage on the left; integrity against
 * the fleet, trucks he has held, pay terms and compliance on the right. GET /api/v1/mdata/boards/drivers/:id/overview.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AddPayLineModal } from "../driver-finance/AddPayLineModal";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, apiRequest } from "../../api/client";
import { formatDateUS } from "../../lib/formatDate";
import { ListErrorState } from "../ListErrorState";
import { EntityLink, resolveEntityRoute } from "../shared/EntityLink";
import "../../design/ih35-design-tokens.css";
import "./party-board.css";

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
const money = (c: number | null | undefined) => (c ? usd(c) : "—");
const int = (n: number) => n.toLocaleString("en-US");
const day = (d: string | null | undefined) => (d ? formatDateUS(d) : "—");
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

/** The board's tab strip — Overview is this screen; every other tab opens the existing tab / sub-view it names. */
export const DRIVER_DETAIL_TABS = (id: string): Array<{ label: string; to: string }> => [
  { label: "Overview", to: `/drivers/${id}` },
  { label: "Settlements", to: `/drivers/${id}?tab=operations&op=settlement-history` },
  { label: "Additional payments", to: `/drivers/${id}?tab=settlements` },
  { label: "Cash advances", to: `/drivers/${id}?tab=operations&op=debt-history` },
  { label: "Pay & escrow", to: `/drivers/${id}?tab=operations&op=escrow-history` },
  { label: "Loads", to: `/drivers/${id}?tab=loads` },
  { label: "Fuel", to: `/drivers/${id}?tab=operations&op=fuel-history` },
  { label: "Reports & damage", to: `/drivers/${id}?tab=operations&op=maintenance-assignments` },
  { label: "Complaints", to: `/safety/complaints?driver_id=${id}` },
  { label: "Safety & accidents", to: `/drivers/${id}?tab=operations&op=accident-history` },
  { label: "Documents", to: `/drivers/${id}?tab=documents` },
  { label: "Driver disputes", to: `/drivers/disputes?driver_id=${id}` },
];

const kindTone = (k: string) => (/detention|layover|wait|late|damage/i.test(k) ? "amber" : /refus|accident/i.test(k) ? "red" : /bonus|report|mechanical/i.test(k) ? "navy" : "");
const fmtIntegrity = (i: Integrity, v: number | null) => (v == null ? "—" : i.money ? usd(v) : `${v}${i.unit ?? ""}`);

export function DriverOverviewBoard(props: { operatingCompanyId: string; driverId: string }) {
  const [addPayOpen, setAddPayOpen] = useState(false);
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["driver-overview", props.operatingCompanyId, props.driverId],
    queryFn: () => apiRequest<Overview>(`/api/v1/mdata/boards/drivers/${props.driverId}/overview?operating_company_id=${props.operatingCompanyId}`),
  });
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
    { label: "Complaints", value: int(t.complaints_90d), sub: `fleet avg ${t.fleet_complaints_avg_90d} · 90 days`, tone: t.complaints_90d > t.fleet_complaints_avg_90d && t.complaints_90d > 0 ? "amber" : "" },
    { label: "Integrity", value: flagged ? "Flagged" : "Clear", sub: `${int(t.integrity_flags_90d)} flags · 90 days`, tone: flagged ? "amber" : "navy" },
  ];

  return (
    <div className="pb" data-testid="driver-overview-board">
      <div className="dd-head">
        <div className="pb-head-row">
          <div className="dd-id">
            <div className="dd-avatar" aria-hidden="true">{initials(o.driver.name)}</div>
            <div>
              <div className="pb-title">{o.driver.name}</div>
              <div className="pb-sub">
                Unit {o.driver.unit ?? "—"} · {o.driver.phone ?? "no phone"} · CDL {o.driver.cdl ?? "—"} · hired {day(o.driver.hire_date)} · {o.driver.pay_basis ?? "no rate card"}
              </div>
            </div>
            <span className="dd-pill">{o.driver.status}</span>
          </div>
          <div className="pb-head-actions">
            <button type="button" className="dd-btn" onClick={() => navigate(`/drivers/${o.driver.id}?tab=profile`)}>Edit</button>
            {/* ROUND 288.3 item 3: Add payment adds ONE extra-pay line through the pay-line engine (no longer the creator). */}
            <button type="button" className="dd-btn" onClick={() => setAddPayOpen(true)} data-testid="driver-add-payment">Add payment</button>
            <button type="button" className="dd-btn dd-btn--primary" onClick={runSettlement}>Run settlement</button>
          </div>
        </div>
        <nav className="dd-tabs" aria-label="Driver">
          {DRIVER_DETAIL_TABS(o.driver.id).map((tab, i) => (
            <Link key={tab.label} className="pb-tab" to={tab.to} aria-current={i === 0 ? "page" : undefined}>{tab.label}</Link>
          ))}
        </nav>
      </div>

      <div className="dd-body">
        <div className="dd-kpis" data-testid="driver-overview-kpis">
          {tiles.map((k) => (
            <div key={k.label} className={`pb-kpi${k.tone ? ` dd-kpi--${k.tone}` : ""}`}>
              <div className="ih-hd">{k.label}</div>
              <div className="dd-kpi-v">{k.value}</div>
              <div className="dd-kpi-sub">{k.sub}</div>
            </div>
          ))}
        </div>

        <div className="dd-cols">
          <div className="dd-col">
            <div className="pb-card">
              <div className="dd-card-head">
                <div className="dd-card-title">Settlements</div>
                <Link className="pb-link" to={`/drivers/${o.driver.id}?tab=operations&op=settlement-history`}>All {int(o.settlement_count)} →</Link>
              </div>
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
                        <td className="ih-num">{money(s.line_haul_cents)}</td>
                        <td className="ih-num">{s.additional_cents ? usd(s.additional_cents) : <span className="ih-empty">—</span>}</td>
                        <td className="ih-num">{money(s.deductions_cents)}</td>
                        <td className="ih-num pb-strong">{money(s.net_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="pb-foot">
                      <td colSpan={2}>{int(o.settlements.length)} settlements</td>
                      <td className="ih-num">{int(sum("loads"))}</td>
                      <td className="ih-num">{int(sum("miles"))}</td>
                      <td className="ih-num">{money(sum("line_haul_cents"))}</td>
                      <td className="ih-num">{money(sum("additional_cents"))}</td>
                      <td className="ih-num">{money(sum("deductions_cents"))}</td>
                      <td className="ih-num">{money(sum("net_cents"))}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            <div className="pb-card">
              <div className="dd-card-head">
                <div>
                  <div className="dd-card-title">Additional payments</div>
                  <div className="dd-card-sub">Anything paid outside line haul — it rides the settlement, it never becomes a separate cheque</div>
                </div>
                <button type="button" className="dd-add" onClick={runSettlement}>+ Add</button>
              </div>
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
                        <td className="ih-num pb-strong">{usd(p.amount_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="pb-foot">
                      <td colSpan={6}>{int(o.additional.length)} payments, last 90 days</td>
                      <td className="ih-num">{money(t.additional_pay_cents)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            <div className="pb-card">
              <div className="dd-card-head">
                <div>
                  <div className="dd-card-title">Complaints against the driver</div>
                  <div className="dd-card-sub">Late, refused to roll, service failure — logged with who raised it and what it cost</div>
                </div>
                <button type="button" className="dd-add" onClick={() => navigate(`/safety/complaints?driver_id=${o.driver.id}`)}>+ Log complaint</button>
              </div>
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
                        <td className={`ih-num${c.cost_cents ? " dd-red" : ""}`}>{money(c.cost_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="pb-foot">
                      <td colSpan={6}>{int(o.complaints.length)} complaints, 90 days · fleet average {t.fleet_complaints_avg_90d}</td>
                      <td className="ih-num">{money(o.complaints.reduce((s, c) => s + (c.cost_cents ?? 0), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            <div className="pb-card">
              <div className="dd-card-head"><div className="dd-card-title">Reports &amp; damage he filed</div></div>
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
                        <td className="ih-num">{money(r.cost_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="dd-col">
            <div className="pb-card">
              <div className="dd-card-head">
                <div className="dd-card-title">Integrity</div>
                <span className={`dd-tag ${flagged ? "dd-tag--amber" : "dd-tag--navy"}`}>{flagged ? "Flagged" : "Clear"}</span>
              </div>
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
            </div>

            <div className="pb-card">
              <div className="dd-card-head">
                <div>
                  <div className="dd-card-title">Trucks he has held</div>
                  <div className="dd-card-sub">How damage gets pinned on the right man when trucks rotate</div>
                </div>
              </div>
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
            </div>

            <div className="pb-card">
              <div className="dd-card-head"><div className="dd-card-title">Pay terms</div></div>
              <div>
                <div className="dd-kv"><span>Pay basis</span><span className="ih-num">{o.pay_terms.basis ?? "No rate card"}</span></div>
                <div className="dd-kv"><span>Rate</span><span className="ih-num">{o.pay_terms.rate_per_mile_cents != null ? `${usd(o.pay_terms.rate_per_mile_cents)} / mi` : o.pay_terms.flat_per_load_cents != null ? `${usd(o.pay_terms.flat_per_load_cents)} / load` : "—"}</span></div>
                <div className="dd-kv"><span>Empty miles</span><span className="ih-num">{o.pay_terms.empty_rate_per_mile_cents != null ? `${usd(o.pay_terms.empty_rate_per_mile_cents)} / mi` : "—"}</span></div>
                <div className="dd-kv"><span>Worker class</span><span className="ih-num">{o.pay_terms.worker_class ?? "—"}</span></div>
                <div className="dd-kv"><span>Net pay floor</span><span className="ih-num">{o.pay_terms.net_pay_floor_pct != null ? `${o.pay_terms.net_pay_floor_pct}%` : "—"}</span></div>
                <div className="dd-kv"><span>Escrow target</span><span className="ih-num">{money(o.pay_terms.escrow_target_cents)}</span></div>
              </div>
            </div>

            <div className="pb-card">
              <div className="dd-card-head"><div className="dd-card-title">Compliance</div></div>
              <div>
                <div className="dd-kv"><span>CDL expiration</span><span className="ih-num">{day(o.compliance.cdl_expires)}</span></div>
                <div className="dd-kv"><span>Medical card</span><span className="ih-num">{day(o.compliance.medical_card)}</span></div>
                <div className="dd-kv"><span>Annual MVR review</span><span className="ih-num">{day(o.compliance.mvr_review)}</span></div>
                <div className="dd-kv"><span>Drug screen, last</span><span className="ih-num">{day(o.compliance.drug_screen_last)}</span></div>
                <div className="dd-kv"><span>Hours violations, 90 days</span><span className="ih-num">{o.compliance.hos_violations_90d ? int(o.compliance.hos_violations_90d) : "None"}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <AddPayLineModal open={addPayOpen} onClose={() => setAddPayOpen(false)} operatingCompanyId={props.operatingCompanyId} driverId={props.driverId} driverName={o.driver.name} />
    </div>
  );
}
