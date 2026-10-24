import { settlementLabel } from "../../lib/settlementNumber";
import { formatPersonName } from "../../lib/formatPersonName";
import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { TourMilesPanel } from "./TourMilesPanel";
import { closeTour, getTourReadout, getTourReadoutForLoad, type TourReadout } from "../../api/tourReadout";
import { userFacingApiError } from "../../lib/api-error-message";
import { useToast } from "../Toast";
import { EntityLink } from "../shared/EntityLink";
import { ParityTable } from "../parity/ParityTable";
import { formatMoneyCents } from "./constants";

// LDT-5 · Pre-Settlement = the open TOUR this load is on (render § Pre-Settlement, owner 2026-09-05 23:06Z
// "i love the designs"; 2026-09-06 01:4xZ "we are missing the Close button"). One readout
// (GET /api/v1/loads/:id/tour-readout) feeds this tab, the Costs footer and the Settlement tab.
// Per-leg NB · TR · SB Revenue · Costs · Driver pay · Margin, tour totals, Costs on this tour, Ready to close?
// checklist in English, and "Close tour → Settlement (human confirms)". No tour → the tab says WHY.
const DASH = "—";
const money = (c: number | null | undefined, cur = "USD") => (c == null ? DASH : formatMoneyCents(c, cur));
const pct = (p: number | null | undefined) => (p == null ? DASH : `${p.toFixed(1)}%`);
const miles = (m: number | null | undefined) => (m == null ? DASH : m.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
// REG-033(b) (owner 2026-09-09): the pre-settlement must be scoped to THIS tour's number AND dates.
// Format a date-only / timestamp string as MM/DD/YYYY without a Date() timezone shift.
const fmtDate = (d: string | null | undefined): string | null => {
  if (!d) return null;
  const [y, m, day] = d.slice(0, 10).split("-");
  return y && m && day ? `${m}/${day}/${y}` : d.slice(0, 10);
};
const periodLabel = (t: TourReadout["tour"]): string | null => {
  if (!t) return null;
  if (t.period_start || t.period_end) return `${fmtDate(t.period_start) ?? "…"} – ${fmtDate(t.period_end) ?? "open"}`;
  return t.trip_started_at ? `started ${fmtDate(t.trip_started_at)}` : null;
};

/** Keyed by a load (drawer) OR by a settlement (Load costs board → Pre-Settlement tab, LDT-TABS). Same readout either way. */
export function TourPreSettlementTab({ loadId, settlementId, operatingCompanyId, currencyCode = "USD" }: { loadId?: string; settlementId?: string; operatingCompanyId: string; currencyCode?: "USD" | "MXN" }) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [popup, setPopup] = useState<null | { title: string; body: ReactNode }>(null);
  const [confirming, setConfirming] = useState(false);
  const navigate = useNavigate();
  const readyRef = useRef<HTMLDivElement | null>(null);
  const q = useQuery({
    queryKey: ["tour-readout", settlementId ? "settlement" : "load", operatingCompanyId, settlementId ?? loadId],
    queryFn: () => (settlementId ? getTourReadout(settlementId, operatingCompanyId) : getTourReadoutForLoad(loadId!, operatingCompanyId)),
    enabled: Boolean(settlementId || loadId),
  });
  const close = useMutation({
    meta: { loads: true },
    mutationFn: () => closeTour(q.data!.tour!.settlement_id, operatingCompanyId),
    onSuccess: async () => { pushToast("Tour closed — settlement is now frozen", "success"); setConfirming(false); await qc.invalidateQueries({ queryKey: ["tour-readout"] }); await qc.invalidateQueries({ queryKey: ["load-costs"] }); },
    onError: (e) => pushToast(userFacingApiError(e, "Could not close the tour."), "error"),
  });

  if (q.isLoading) return <p className="ldt-muted" data-testid="tour-presettlement-loading">Loading the tour…</p>;
  if (q.isError) return <div className="ldt-note bad" data-testid="tour-presettlement-error">Couldn't load the tour readout — {userFacingApiError(q.error, "error")}. <button type="button" className="ldt-link" onClick={() => void q.refetch()}>Retry</button></div>;
  const r: TourReadout | undefined = q.data;
  if (!r) return null;
  if (!r.tour) return <div className="ldt-note warn" data-testid="tour-presettlement-empty">{r.reason ?? "This load is not on a tour."}</div>;

  const t = r.tour; const totals = r.totals!;
  const thisLeg = r.legs.find((l) => l.is_this_load);
  const sb = r.legs.find((l) => l.trip_type === "SB");
  const okCount = r.ready.filter((x) => x.ok).length;
  const allOk = r.ready.length > 0 && okCount === r.ready.length;
  const activeLegs = r.legs.filter((l) => !l.is_cancelled);
  const nbLeg = activeLegs.find((l) => l.trip_type === "NB") ?? activeLegs[0];
  const lastLeg = activeLegs[activeLegs.length - 1];
  const podLeg = activeLegs.find((l) => l.is_delivered && l.pod_count === 0) ?? activeLegs.find((l) => l.pod_count === 0) ?? lastLeg;
  const payLeg = activeLegs.find((l) => l.driver_pay_cents <= 0) ?? lastLeg;
  const loadUrl = (id: string | undefined, tab?: "Documents" | "Costs") => (id ? `/dispatch/loads/${encodeURIComponent(id)}${tab ? `?tab=${tab}` : ""}` : "/dispatch");
  /** 443.269-A 3c — where every readiness row goes. */
  const readyTarget = (key: string): { kind: string; title: string; go: () => void } => {
    switch (key) {
      case "has_nb":
        return { kind: "nb-load", title: `Open the NB load ${nbLeg?.load_number ?? ""}`, go: () => navigate(loadUrl(nbLeg?.load_id)) };
      case "sb_delivered":
        return { kind: "truck-line-assign", title: `Assign / attach the SB return load (Truck Line, ${t.unit_number ?? "this truck"})`, go: () => navigate(`/dispatch?view=truck-line${t.unit_number ? `&q=${encodeURIComponent(t.unit_number)}` : ""}`) };
      case "pods":
        return { kind: "pod-documents", title: `POD documents for load ${podLeg?.load_number ?? ""} (view + upload)`, go: () => navigate(loadUrl(podLeg?.load_id, "Documents")) };
      case "costs_complete":
        return { kind: "tour-costs", title: "The costs on these loads (account · vendor · receipt)", go: () => setPopup({ title: "Costs on this tour", body: <CostsPop r={r} cur={currencyCode} /> }) };
      case "driver_pay":
        return { kind: "driver-bills", title: `Driver bills for the tour (load ${payLeg?.load_number ?? ""})`, go: () => navigate(loadUrl(payLeg?.load_id, "Costs")) };
      case "real_miles":
        return { kind: "miles-panel", title: "Our database miles, Google shortest + practical, real driven, and which one the bill uses", go: () => setPopup({ title: "Miles on this tour", body: <TourMilesPanel legs={r.legs} operatingCompanyId={operatingCompanyId} /> }) };
      default:
        return { kind: "tour", title: "Open the pre-settlement", go: () => navigate(`/driver-finance/settlements?settlement_id=${encodeURIComponent(t.settlement_id)}`) };
    }
  };
  const unpostedDraftExpenses = r.costs.filter(
    (c) =>
      c.kind === "expense" &&
      (c.posting_status === "unposted" || String(c.document_status ?? "").toLowerCase() === "draft")
  );

  return <div className="ldt-body" data-testid="tour-presettlement-tab" data-surface="load-detail">
    <div className="ldt-rowbar">
      <span>Pre-Settlement <EntityLink kind="settlement" id={t.settlement_id} label={settlementLabel(t)} />
        {periodLabel(t) ? <> · <span className="ldt-k" data-testid="tour-presettlement-dates">{periodLabel(t)}</span></> : null}{" "}
        · {r.legs.map((l) => `${l.trip_type ?? "leg"} ${l.load_number}${l.is_this_load ? " (this load)" : ""}`).join(" · ")}{sb ? "" : " · SB —"} · {t.driver_name ?? "driver"}{t.unit_number ? ` · ${t.unit_number}` : ""}</span>
      <span className={`ldt-pill ${t.is_open ? "warn" : "ok"}`} data-testid="tour-state-chip">{t.is_open ? "open · nothing posted" : `closed · ${t.status}`}</span>
    </div>

    {unpostedDraftExpenses.length > 0 ? (
      <div className="ldt-note warn" data-testid="presettlement-unposted-draft-expense-flag" role="status">
        {unpostedDraftExpenses.length} draft / unposted expense{unpostedDraftExpenses.length === 1 ? "" : "s"} on this tour — post or void before close.
      </div>
    ) : null}

    {/* Per-leg readout — the same numbers the Costs footer and Settlement tab show */}
    <div className="ldt-card" data-testid="tour-legs">
      <ParityTable rows={r.legs} rowKey={l => l.load_id} rowTestId={() => "tour-leg"} appearance="board"
        onRowClick={l => setPopup({ title: `Leg ${l.trip_type ?? ""} · load ${l.load_number}`, body: <LegPop leg={l} cur={currencyCode} /> })}
        columns={[
          { key: "type", label: "Leg", sortable: true, sortValue: l => l.trip_type ?? "", render: l => l.trip_type ?? DASH },
          { key: "load", label: "Load Number", sortable: true, sortValue: l => l.load_number, render: l => <EntityLink kind="load" id={l.load_id} label={l.load_number} /> },
          { key: "lane", label: "Lane", sortable: true, sortValue: l => l.lane, render: l => l.lane || DASH },
          { key: "pickup", label: "Pickup date", sortable: true, sortValue: l => l.pickup_date ?? "", render: l => fmtDate(l.pickup_date) || DASH },
          { key: "delivery", label: "Delivery date", sortable: true, sortValue: l => l.delivery_date ?? "", render: l => fmtDate(l.delivery_date) || DASH },
          { key: "status", label: "Status", sortable: true, sortValue: l => l.status, render: l => l.status },
          { key: "excluded", label: "Excluded from totals", sortable: true, sortValue: l => Number(Boolean(l.is_cancelled)), render: l => l.is_cancelled ? "Yes" : "No" },
          { key: "revenue", label: "Revenue", sortable: true, sortValue: l => l.revenue_cents, render: l => money(l.revenue_cents, currencyCode) },
          { key: "costs", label: "Costs", sortable: true, sortValue: l => l.costs_cents, render: l => money(l.costs_cents, currencyCode) },
          { key: "driver_pay", label: "Driver pay", sortable: true, sortValue: l => l.driver_pay_cents, render: l => money(l.driver_pay_cents, currencyCode) },
          { key: "margin", label: "Margin", sortable: true, sortValue: l => l.margin_cents, render: l => money(l.margin_cents, currencyCode) },
          { key: "margin_pct", label: "Margin %", sortable: true, sortValue: l => l.margin_pct ?? -Infinity, render: l => <span data-testid="tour-leg-margin-pct">{pct(l.margin_pct)}</span> },
          { key: "practical", label: "Practical miles", sortable: true, sortValue: l => l.miles_practical ?? -Infinity, render: l => miles(l.miles_practical) },
          { key: "real", label: "Real miles", sortable: true, sortValue: l => l.miles_real ?? -Infinity, render: l => miles(l.miles_real) },
        ]}
        footerCells={{ type: <span data-testid="tour-totals">Tour so far</span>, revenue: money(totals.revenue_cents, currencyCode), costs: money(totals.costs_cents, currencyCode), driver_pay: money(totals.driver_pay_cents, currencyCode), margin: money(totals.margin_cents, currencyCode), margin_pct: <span data-testid="tour-totals-margin-pct">{pct(totals.margin_pct)}</span>, practical: miles(totals.miles_practical), real: miles(totals.miles_real) }} />
      {!sb ? <p className="ldt-muted">SB — awaiting return load to Laredo</p> : null}

    </div>

    <div className="ldt-grid2">
      {/* Costs on this tour */}
      <div className="ldt-card" data-testid="tour-costs">
        <div className="ldt-ch"><span>Costs on this tour</span><button type="button" className="ldt-link ldt-open" data-testid="tour-entries-button" onClick={() => setPopup({ title: "Costs on this tour", body: <CostsPop r={r} cur={currencyCode} /> })}>{r.costs.length} entries ↗</button></div>
        <div className="ldt-rows">
          {r.costs.slice(0, 8).map((c) => <div key={`${c.kind}:${c.id}`} className="ldt-row"><span><span className="ldt-k">{c.number}</span> · {c.category ?? "no account"} · {c.vendor_name ?? "no vendor"}<span className="ldt-sub">load {c.load_number ?? DASH} · {c.kind} · {c.posting_status}{c.receipt_count ? ` · ${c.receipt_count} receipt${c.receipt_count === 1 ? "" : "s"}` : " · no receipt"}</span></span><span className="ldt-m">{money(c.amount_cents, currencyCode)}</span></div>)}
          {r.costs.length > 8 ? <div className="ldt-row"><span className="ldt-muted">… {r.costs.length - 8} more — open ↗</span><span /></div> : null}
          {r.costs.length === 0 ? <div className="ldt-row"><span className="ldt-muted">No costs on this tour yet.</span><span /></div> : null}
          <div className="ldt-row tot"><span>{r.costs.length} entries</span><span className="ldt-m">{money(totals.costs_cents, currencyCode)}</span></div>
        </div>
      </div>

      {/* LEAD 443.269-A item 3 — Ready to close?: a compact 2-column list (label · value, 32px rows, panel = content
          width). EVERY row goes somewhere (readyTarget). At N of N the Close button is ENABLED and opens Settlement Close
          for this driver/tour; below that each failing row is the link to the screen that fixes it, and the header
          jumps to the first failing check. */}
      <div className="ldt-card w-fit max-w-full self-start" data-testid="tour-ready" ref={readyRef}>
        <button
          type="button"
          className="ldt-ch w-full cursor-pointer text-left"
          data-testid="tour-ready-header"
          title={allOk ? "Every check passes" : "Jump to the first failing check"}
          onClick={() => {
            const first = readyRef.current?.querySelector<HTMLElement>('[data-ok="false"]');
            first?.scrollIntoView({ block: "nearest" });
            first?.focus();
          }}
        >
          <span>Ready to close?</span>
          <span className="ldt-open" data-testid="tour-ready-count">{okCount} of {r.ready.length}</span>
        </button>
        <div className="grid grid-cols-[max-content_max-content] gap-x-4 px-3 py-1" data-testid="tour-ready-list">
          {r.ready.map((x) => {
            const target = readyTarget(x.key);
            return (
              <button
                key={x.key}
                type="button"
                className="col-span-2 grid h-8 grid-cols-subgrid items-center text-left text-xs hover:bg-[var(--ldt-paper)] focus:bg-[var(--ldt-paper)]"
                data-testid={`tour-ready-${x.key}`}
                data-ok={x.ok}
                data-target={target.kind}
                title={target.title}
                onClick={target.go}
              >
                <span className="text-[var(--ldt-ink)] underline-offset-2 hover:underline">{x.label}</span>
                <span><span className={`ldt-pill ${x.ok ? "ok" : x.hard ? "bad" : "warn"}`}>{x.ok ? (x.detail === "yes" ? "yes" : x.detail) : x.detail}</span></span>
              </button>
            );
          })}
        </div>
        <div className="ldt-actions" style={{ padding: 10 }}>
          {t.is_open ? (
            <>
              {/* 443.293-B — ONE close wizard (SettlementCloseArrivalPage). Primary CTA on the Dispatch
                  tour / Pre-Settlement tab. Tour-close below stays a separate engine (freeze tour). */}
              <Link
                className="ldt-btn p"
                data-testid="tour-open-settlement-close"
                to={`/driver-finance/settlement-close?driver_id=${encodeURIComponent(t.driver_id)}&settlement_id=${encodeURIComponent(t.settlement_id)}`}
                title="Opens the same 7-step Settlement Close wizard for this driver's open tour"
              >
                Close settlement
              </Link>
              {/* 443.269-A 3b: enabled at N of N (all hard checks pass ⇒ can_close); the close engine still refuses
                  server-side while blocked, and a human confirms the soft items by name. */}
              <button type="button" className="ldt-btn g" data-testid="tour-close-button" disabled={!r.can_close || close.isPending} title={r.can_close ? "Closes the tour — a human confirms on the next step" : r.close_blockers.join(" · ")} onClick={() => setConfirming(true)}>
                Close tour → Settlement (human confirms)
              </button>
            </>
          ) : <span className="ldt-pill ok">Closed {t.trip_closed_at ? `· ${t.trip_closed_at.slice(0, 16).replace("T", " ")}` : ""} — see Settlement</span>}
          {!r.can_close && t.is_open ? <span className="ldt-bad-text" data-testid="tour-close-blockers">{r.close_blockers.join(" · ")}</span> : null}
        </div>
      </div>
    </div>

    {thisLeg && thisLeg.miles_shortest == null ? <p className="ldt-note warn"><span className="ldt-live">LIVE</span> Load {thisLeg.load_number} has no short-route miles — the driver pay line falls back to the stored bill; law says short miles pay the driver (LDT-3).</p> : null}

    {confirming ? <div className="ldt-modal-backdrop" onClick={() => setConfirming(false)} data-testid="tour-close-confirm">
      <div className="ldt-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="ldt-modal-head"><span className="ldt-modal-title">Close tour {settlementLabel(t)} → Settlement</span><button type="button" className="ldt-btn g" onClick={() => setConfirming(false)} aria-label="Close">×</button></div>
        <div className="ldt-modal-body">
          <p>This closes the tour for <b>{t.driver_name ? formatPersonName(t.driver_name) : "the driver"}</b>: the driver settlement freezes with {r.legs.length} leg{r.legs.length === 1 ? "" : "s"} ({r.legs.map((l) => l.load_number).join(", ")}), earnings and escrow lines are written, and the company settlement for the period is closed alongside. Nothing posts to the general ledger here — posting happens at pay-run close.</p>
          {r.soft_warnings.length ? <div className="ldt-note warn"><b>You are confirming these open items by name:</b><ul style={{ margin: "6px 0 0 16px" }}>{r.soft_warnings.map((w) => <li key={w}>{w}</li>)}</ul></div> : <div className="ldt-note">Every readiness item is satisfied.</div>}
          <div className="ldt-actions">
            <button type="button" className="ldt-btn p" data-testid="tour-close-confirm-button" disabled={close.isPending} onClick={() => close.mutate()}>{close.isPending ? "Closing…" : "Yes — close the tour"}</button>
            <button type="button" className="ldt-btn g" onClick={() => setConfirming(false)}>Not yet</button>
          </div>
        </div>
      </div>
    </div> : null}

    {popup ? <div className="ldt-modal-backdrop" onClick={() => setPopup(null)} data-testid="tour-popup">
      <div className="ldt-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="ldt-modal-head"><span className="ldt-modal-title">{popup.title}</span><button type="button" className="ldt-btn g" onClick={() => setPopup(null)} aria-label="Close">×</button></div>
        <div className="ldt-modal-body">{popup.body}</div>
      </div>
    </div> : null}
  </div>;
}

function LegPop({ leg, cur }: { leg: TourReadout["legs"][number]; cur: string }) {
  return <div className="ldt-rows">
    {([["Load", <EntityLink kind="load" id={leg.load_id} label={leg.load_number} />], ["Leg", leg.trip_type ?? DASH], ["Lane", leg.lane || DASH], ["Status", `${leg.status}${leg.is_delivered ? " · delivered" : ""}`],
      ["Revenue (rate)", money(leg.revenue_cents, cur)], ["Costs", `${money(leg.costs_cents, cur)} · ${leg.cost_count} entries`], ["Driver pay", money(leg.driver_pay_cents, cur)], ["Margin", money(leg.margin_cents, cur)], ["Margin %", pct(leg.margin_pct)],
      ["Practical · short · deadhead · real miles", `${miles(leg.miles_practical)} · ${miles(leg.miles_shortest)} · ${miles(leg.miles_deadhead)} · ${miles(leg.miles_real)}`], ["PODs on file", String(leg.pod_count)]] as Array<[string, ReactNode]>).map(([k, v]) => <div key={k} className="ldt-row"><span>{k}</span><span className="ldt-m">{v}</span></div>)}
    <div className="ldt-row"><span /><span className="ldt-m"><Link className="ldt-link" to={`/dispatch/loads/${leg.load_id}?tab=Costs`}>open the load's costs ↗</Link></span></div>
  </div>;
}

function CostsPop({ r, cur }: { r: TourReadout; cur: string }) {
  // LEAD 443.269-A item 2 — this list is READ-ONLY by design: a tour's entries are the costs posted on its loads
  // (expenses / bills through their own engines), never a second writer here. Say so, and link to where each is made.
  const legs = r.legs.filter((l) => !l.is_cancelled);
  return <div className="ldt-rows ldt-rows-4">
    <div className="ldt-note" data-testid="tour-entries-readonly">
      Entries are read-only here — a tour's costs are the expenses and bills on its loads. Add or fix one on the load:{" "}
      {legs.map((l, i) => <span key={l.load_id}>{i ? " · " : ""}<Link className="ldt-link" data-testid="tour-entries-add-link" to={`/dispatch/loads/${encodeURIComponent(l.load_id)}?tab=Costs`}>+ Add on load {l.load_number}</Link></span>)}
    </div>
    <div className="ldt-row head"><span>Number · vendor · category</span><span>Load</span><span>State</span><span className="ldt-m">Amount</span></div>
    {r.costs.map((c) => <div key={`${c.kind}:${c.id}`} className="ldt-row"><span><EntityLink kind={c.kind} id={c.id} label={c.number} /> · {c.vendor_name ?? "no vendor"} · {c.category ?? "no account"}</span><span className="ldt-k">{c.load_number ?? DASH}</span><span><span className={`ldt-pill ${c.receipt_count ? "ok" : "warn"}`}>{c.posting_status}{c.receipt_count ? "" : " · no receipt"}</span></span><span className="ldt-m">{money(c.amount_cents, cur)}</span></div>)}
    <div className="ldt-row tot"><span>{r.costs.length} entries</span><span /><span /><span className="ldt-m">{money(r.totals?.costs_cents ?? 0, cur)}</span></div>
  </div>;
}
