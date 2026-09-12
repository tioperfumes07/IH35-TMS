import { settlementLabel } from "../../lib/settlementNumber";
import { useQuery } from "@tanstack/react-query";
import { getTourReadout, getTourReadoutForLoad, type TourReadout } from "../../api/tourReadout";
import { userFacingApiError } from "../../lib/api-error-message";
import { EntityLink } from "../shared/EntityLink";
import { ParityTable } from "../parity/ParityTable";
import { formatMoneyCents } from "./constants";

// LDT-6 · Settlement (render § Settlement): while the tour is open — one sentence + the shape it will take;
// when closed — Driver settlement (loaded × rate · empty × rate · gross · escrow · recoveries · net) and
// Company settlement (revenue · costs · driver pay · factoring · margin · $/mi practical AND real), FROZEN:
// no editable field, corrections are a reversing entry. Numbers come from the same readout as Pre-Settlement.
const DASH = "—";
// REG-033(b) (owner 2026-09-09): the settlement must be scoped to THIS tour's number AND dates.
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
const money = (c: number | null | undefined, cur = "USD") => (c == null ? DASH : formatMoneyCents(c, cur));
const miles = (m: number | null | undefined) => (m == null ? DASH : m.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const rate = (c: number | null | undefined) => (c == null ? DASH : `$${(c / 100).toFixed(4)}`);
const perMile = (c: number | null | undefined) => (c == null ? "—/mi" : `$${(c / 100).toFixed(2)}/mi`);

/** Keyed by a load (drawer) OR by a settlement (Load costs board → Settlement tab, LDT-TABS). Same readout either way. */
export function TourSettlementTab({ loadId, settlementId, operatingCompanyId, currencyCode = "USD" }: { loadId?: string; settlementId?: string; operatingCompanyId: string; currencyCode?: "USD" | "MXN" }) {
  const q = useQuery({
    queryKey: ["tour-readout", settlementId ? "settlement" : "load", operatingCompanyId, settlementId ?? loadId],
    queryFn: () => (settlementId ? getTourReadout(settlementId, operatingCompanyId) : getTourReadoutForLoad(loadId!, operatingCompanyId)),
    enabled: Boolean(settlementId || loadId),
  });
  if (q.isLoading) return <p className="ldt-muted" data-testid="tour-settlement-loading">Loading the settlement…</p>;
  if (q.isError) return <div className="ldt-note bad" data-testid="tour-settlement-error">Couldn't load the settlement — {userFacingApiError(q.error, "error")}. <button type="button" className="ldt-link" onClick={() => void q.refetch()}>Retry</button></div>;
  const r: TourReadout | undefined = q.data;
  if (!r) return null;
  if (!r.tour || !r.driver_settlement || !r.company_settlement || !r.totals) return <div className="ldt-note warn" data-testid="tour-settlement-empty">{r.reason ?? "This load is not on a tour, so there is no settlement to show yet."}</div>;
  const t = r.tour; const ds = r.driver_settlement; const cs = r.company_settlement; const tot = r.totals;
  const bills = ds.driver_bills;
  const grossFromBills = bills.reduce((s, b) => s + b.gross_amount_cents, 0);
  const gross = ds.gross_cents || grossFromBills;
  // OWNER-LIVE-DEFECT-2026-09-08 (Jorge, live walkthrough of S-13644): for a CLOSED settlement,
  // ds.net_cents is driver_finance.driver_settlements.net_pay — the stored, authoritative figure
  // the close engine computed as gross - deductions + reimbursements — it already has
  // reimbursements baked in. The render below used to add reimbursements_cents to `net` a SECOND
  // time unconditionally, so this card showed net_pay + reimbursements twice for every closed
  // settlement. Live proof: S-13644's net_pay is $1,802.86 (queried live, Neon
  // tiny-field-89581227/br-fancy-credit-akjnd07a) but this card rendered $2,015.11 — exactly
  // $1,802.86 + $212.25 (reimbursements_cents) double-added. For an OPEN settlement `net` here
  // never included reimbursements, so it still needs the one addition below. `netTotal` is the
  // single, correct, once-added figure for both states.
  const net = t.is_open ? gross - ds.escrow_cents - ds.recoveries_cents : ds.net_cents;
  const netTotal = t.is_open ? net + (ds.reimbursements_cents || 0) : net;

  // REG-024 (owner 2026-09-10: "render EXACTLY like the AlwaysTrack company/driver settlement PDFs").
  // The AlwaysTrack Company Settlement is four sections — CUSTOMER CHARGES · DRIVER PAYMENT · FUEL +
  // EXPENSES · REVENUE (a P&L waterfall with a % and a per-practical-mile column). Every figure below
  // is DERIVED from the same buildTourReadout the two cards already use — never a second sum, never a
  // fabricated number: a figure the readout doesn't carry (fuel gallons/MPG, the quick-pay fee) renders
  // a dash, exactly like the board's own untracked-mileage cells.
  const liveLegs = r.legs.filter((l) => !l.is_cancelled);
  const isFuel = (c: TourReadout["costs"][number]) => /fuel|diesel|\bdef\b|reefer/i.test(`${c.category ?? ""} ${c.vendor_name ?? ""}`);
  const fuelCosts = r.costs.filter(isFuel);
  const otherCosts = r.costs.filter((c) => !isFuel(c));
  const fuelTotal = fuelCosts.reduce((s, c) => s + c.amount_cents, 0);
  const otherTotal = otherCosts.reduce((s, c) => s + c.amount_cents, 0);
  const invoicedCents = cs.revenue_cents;
  const chargeMiles = liveLegs.reduce((s, l) => s + (l.miles_practical ?? 0), 0);
  const totalMiles = tot.miles_practical || chargeMiles;
  // per practical mile, dollars, 3 decimals (AlwaysTrack "p/m") — dash when there are no miles to divide by.
  const pm = (c: number) => (totalMiles > 0 ? `${(c / 100 / totalMiles).toFixed(3)} p/m` : DASH);
  const pct = (c: number) => (invoicedCents > 0 ? `${((c / invoicedCents) * 100).toFixed(2)}%` : DASH);
  const legRate = (l: TourReadout["legs"][number]) => (l.miles_practical && l.miles_practical > 0 ? l.revenue_cents / 100 / l.miles_practical : null);
  const waterfall: Array<{ label: string; amount_cents: number; sign: -1 | 1 }> = [
    { label: "Invoiced", amount_cents: invoicedCents, sign: 1 },
    { label: "Driver salary", amount_cents: tot.driver_pay_cents, sign: -1 },
    { label: "Fuel", amount_cents: fuelTotal, sign: -1 },
    { label: "Company expenses", amount_cents: otherTotal, sign: -1 },
  ];

  return <div className="ldt-body" data-testid="tour-settlement-tab" data-surface="load-detail" data-frozen={!t.is_open}>
    <div className="ldt-rowbar">
      <span>Settlement <EntityLink kind="settlement" id={t.settlement_id} label={settlementLabel(t)} />{periodLabel(t) ? <> · <span className="ldt-k" data-testid="tour-settlement-dates">{periodLabel(t)}</span></> : null} · {t.driver_name ?? "driver"} · <b>{t.is_open ? "open" : t.status}</b>{t.is_open ? " — fills when the tour closes; the figures below are the shape it will take from today's readout." : ` — closed ${t.trip_closed_at ? t.trip_closed_at.slice(0, 16).replace("T", " ") : ""}; frozen.`}</span>
      <span className={`ldt-pill ${t.is_open ? "warn" : "ok"}`} data-testid="tour-settlement-state">{t.is_open ? "open · pre-settlement" : `${t.status}${t.paid_at ? " · paid" : ""}`}</span>
    </div>

    <div className="ldt-grid2">
      <div className="ldt-card" data-testid="driver-settlement-card">
        <div className="ldt-ch"><span>Driver settlement {t.is_open ? "(on close)" : ""}</span><span className="ldt-open">{bills.length} bill{bills.length === 1 ? "" : "s"}</span></div>
        <div className="ldt-rows">
          <ParityTable rows={bills} rowKey={b => b.id} tableTestId="settlement-driver-bills" emptyText="No driver bill on this tour yet." columns={[
            { key: "load", label: "Load Number", sortable: true, sortValue: b => b.load_number ?? "", render: b => <EntityLink kind="load" id={b.load_id} label={b.load_number ?? "Load"} /> },
            { key: "basis", label: "Miles basis", sortable: true, sortValue: b => b.miles_basis_type ?? "", render: b => b.miles_basis_type ?? DASH },
            { key: "loaded_miles", label: "Loaded miles", sortable: true, sortValue: b => b.miles_basis ?? -Infinity, render: b => miles(b.miles_basis) },
            { key: "loaded_rate", label: "Loaded rate", sortable: true, sortValue: b => b.rate_per_mile_cents ?? -Infinity, render: b => rate(b.rate_per_mile_cents) },
            { key: "loaded_pay", label: "Loaded pay", sortable: true, sortValue: b => b.loaded_pay_cents ?? -Infinity, render: b => money(b.loaded_pay_cents, currencyCode) },
            { key: "empty_miles", label: "Empty miles", sortable: true, sortValue: b => b.miles_deadhead ?? -Infinity, render: b => miles(b.miles_deadhead) },
            { key: "empty_rate", label: "Empty rate", sortable: true, sortValue: b => b.rate_empty_per_mile_cents ?? -Infinity, render: b => rate(b.rate_empty_per_mile_cents) },
            { key: "empty_pay", label: "Empty pay", sortable: true, sortValue: b => b.deadhead_pay_cents ?? -Infinity, render: b => money(b.deadhead_pay_cents, currencyCode) },
          ]} />
          <div className="ldt-row tot"><span>Gross</span><span className="ldt-m" data-testid="driver-gross">{money(gross, currencyCode)}</span></div>
          <div className="ldt-row"><span>Escrow contribution<span className="ldt-sub">$25 per load, capped at $2,500 on account</span></span><span className="ldt-m">−{money(ds.escrow_cents, currencyCode)}</span></div>
          <div className="ldt-row"><span>Recoveries (fuel overage / damage / fees)</span><span className="ldt-m">−{money(ds.recoveries_cents, currencyCode)}</span></div>
          {ds.reimbursements_cents ? <div className="ldt-row"><span>Reimbursements to the driver</span><span className="ldt-m">+{money(ds.reimbursements_cents, currencyCode)}</span></div> : null}
          <div className="ldt-row big"><span>Net pay · 5% floor respected</span><span className="ldt-m" data-testid="driver-net">{money(netTotal, currencyCode)}</span></div>
        </div>
        {ds.lines.length ? <div style={{ padding: "0 10px 10px" }}>
          <div className="ldt-muted" style={{ margin: "8px 0 4px" }}>Settlement lines · every line carries its GL account (owner ruling 2026-09-06)</div>
          <div className="ldt-rows ldt-rows-4">
            {ds.lines.map((l) => <div key={l.id} className="ldt-row"><span>{l.description ?? l.line_type}<span className="ldt-sub">{l.line_type} · load {l.load_number ?? DASH}</span></span><span className="ldt-k">{l.account_label ?? <span className="ldt-pill bad">no account</span>}</span><span><span className={`ldt-pill ${l.approval_status === "approved" ? "ok" : "warn"}`}>{l.approval_status ?? "pending"}</span></span><span className="ldt-m">{money(l.amount_cents, currencyCode)}</span></div>)}
          </div>
        </div> : null}
        <div className="ldt-actions" style={{ padding: "0 10px 10px" }}>
          <a className="ldt-btn g" href={`${ds.pdf_path}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`} target="_blank" rel="noopener" data-testid="settlement-pdf-link">Settlement PDF</a>
          <EntityLink kind="settlement" id={t.settlement_id} label="Open settlement" />
        </div>
      </div>

      <div className="ldt-card" data-testid="company-settlement-card">
        <div className="ldt-ch">
          <span>Company settlement {t.is_open ? "(on close)" : ""}</span>
          <span className="ldt-open" data-testid="company-settlement-number">
            {cs.id && cs.display_id ? (
              <EntityLink kind="company_settlement" id={cs.id} label={cs.display_id} />
            ) : (
              "not opened yet"
            )}
            {cs.status ? ` · ${cs.status}` : ""}
          </span>
        </div>
        <div className="ldt-rows">
          <div className="ldt-row"><span>Revenue ({r.legs.length} load{r.legs.length === 1 ? "" : "s"} so far)</span><span className="ldt-m">{money(cs.revenue_cents, currencyCode)}</span></div>
          <div className="ldt-row"><span>Costs ({r.costs.length} entries)</span><span className="ldt-m">−{money(cs.costs_cents, currencyCode)}</span></div>
          <div className="ldt-row"><span>Driver pay</span><span className="ldt-m">−{money(cs.driver_pay_cents, currencyCode)}</span></div>
          <div className="ldt-row"><span>Factoring<span className="ldt-sub">{cs.factoring.factored_invoices ? `${cs.factoring.factored_invoices} invoice(s) factored · face ${money(cs.factoring.face_cents, currencyCode)}` : "not factored"}{cs.factoring.broker_advance_applied_cents ? ` · broker advance applied ${money(cs.factoring.broker_advance_applied_cents, currencyCode)}` : ""}</span></span><span className="ldt-m">{cs.factoring.factored_invoices ? "see Factoring tab" : "−$0.00"}</span></div>
          <div className="ldt-row big"><span>Margin</span><span className="ldt-m" data-testid="company-margin">{money(cs.margin_cents, currencyCode)}</span></div>
          <div className="ldt-row"><span>Margin %</span><span className="ldt-m">{tot.margin_pct == null ? DASH : `${tot.margin_pct.toFixed(1)}%`}</span></div>
          <div className="ldt-row"><span>Per practical mile</span><span className="ldt-m">{perMile(tot.per_mile_practical_cents)}</span></div>
          <div className="ldt-row"><span>Per real mile</span><span className="ldt-m">{perMile(tot.per_mile_real_cents)}</span></div>
        </div>
      </div>
    </div>

    {/* REG-024 — AlwaysTrack Company Settlement parity: CUSTOMER CHARGES · FUEL + EXPENSES · REVENUE. */}
    <div className="ldt-card" data-testid="settlement-customer-charges">
      <div className="ldt-ch"><span>Customer charges</span><span className="ldt-open">{liveLegs.length} load{liveLegs.length === 1 ? "" : "s"}</span></div>
      <div className="ldt-rows">
        <ParityTable rows={liveLegs} rowKey={l => l.load_id} tableTestId="settlement-customer-charges-table" emptyText="No loads on this tour yet." columns={[
          { key: "load", label: "Load Number", sortable: true, sortValue: l => l.load_number ?? "", render: l => <EntityLink kind="load" id={l.load_id} label={l.load_number ?? "Load"} /> },
          { key: "lane", label: "Lane", sortable: true, sortValue: l => l.lane, render: l => <span className="ldt-sub">{l.lane || DASH}</span> },
          { key: "desc", label: "Description", sortable: false, render: () => "Line haul" },
          { key: "miles", label: "Miles", sortable: true, sortValue: l => l.miles_practical ?? -Infinity, render: l => miles(l.miles_practical) },
          { key: "rate", label: "Rate", sortable: true, sortValue: l => legRate(l) ?? -Infinity, render: l => { const rt = legRate(l); return rt == null ? DASH : `$${rt.toFixed(3)}`; } },
          { key: "amount", label: "Amount", sortable: true, sortValue: l => l.revenue_cents, render: l => money(l.revenue_cents, currencyCode) },
        ]} footerCells={{
          load: () => <span className="ldt-sub" data-testid="customer-charges-total-label">Total line haul</span>,
          miles: () => <span data-testid="customer-charges-total-miles">{miles(chargeMiles)}</span>,
          rate: () => <span>{chargeMiles > 0 ? `$${(invoicedCents / 100 / chargeMiles).toFixed(3)}` : DASH}</span>,
          amount: () => <span className="ldt-m" data-testid="customer-charges-total-amount">{money(invoicedCents, currencyCode)}</span>,
        }} />
      </div>
    </div>

    <div className="ldt-card" data-testid="settlement-fuel-expenses">
      <div className="ldt-ch"><span>Fuel &amp; expenses</span><span className="ldt-open">{r.costs.length} entr{r.costs.length === 1 ? "y" : "ies"}</span></div>
      <div className="ldt-rows">
        <ParityTable rows={r.costs} rowKey={c => `${c.kind}:${c.id}`} tableTestId="settlement-fuel-expenses-table" emptyText="No fuel or expenses recorded on this tour." columns={[
          { key: "date", label: "Date", sortable: true, sortValue: c => c.date ?? "", render: c => fmtDate(c.date) ?? DASH },
          { key: "kind", label: "Kind", sortable: true, sortValue: c => isFuel(c) ? "Fuel" : "Expense", render: c => isFuel(c) ? "Fuel" : "Expense" },
          { key: "vendor", label: "Vendor", sortable: true, sortValue: c => c.vendor_name ?? "", render: c => c.vendor_name ?? DASH },
          { key: "load", label: "Load Number", sortable: true, sortValue: c => c.load_number ?? "", render: c => c.load_number ?? DASH },
          { key: "category", label: "Category", sortable: true, sortValue: c => c.category ?? "", render: c => c.category ?? DASH },
          { key: "amount", label: "Amount", sortable: true, sortValue: c => c.amount_cents, render: c => money(c.amount_cents, currencyCode) },
        ]} footerCells={{
          date: () => <span className="ldt-sub" data-testid="fuel-expenses-total-label">Fuel {money(fuelTotal, currencyCode)} · expenses {money(otherTotal, currencyCode)}</span>,
          amount: () => <span className="ldt-m" data-testid="fuel-expenses-total-amount">{money(fuelTotal + otherTotal, currencyCode)}</span>,
        }} />
      </div>
    </div>

    <div className="ldt-card" data-testid="settlement-revenue-waterfall">
      <div className="ldt-ch"><span>Revenue</span><span className="ldt-open">% of invoiced · per practical mile</span></div>
      <div className="ldt-rows">
        {waterfall.map((w) => (
          <div className="ldt-row" key={w.label} data-testid={`revenue-row-${w.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <span>{w.label}<span className="ldt-sub">{pct(w.amount_cents)} · {pm(w.amount_cents)}</span></span>
            <span className="ldt-m">{w.sign === -1 ? "−" : ""}{money(w.amount_cents, currencyCode)}</span>
          </div>
        ))}
        <div className="ldt-row big" data-testid="revenue-row-net">
          <span>Net revenue<span className="ldt-sub">{pct(tot.margin_cents)} · {pm(tot.margin_cents)}</span></span>
          <span className="ldt-m" data-testid="revenue-net-amount">{money(tot.margin_cents, currencyCode)}</span>
        </div>
        <div className="ldt-row"><span>Miles ({miles(totalMiles)} practical)<span className="ldt-sub">M.P.G. not tracked on-screen — see the fuel card</span></span><span className="ldt-m">{DASH}</span></div>
      </div>
    </div>

    <p className={`ldt-note ${t.is_open ? "" : "warn"}`}>{t.is_open ? "Open tour: nothing here has posted to the general ledger. Close the tour from the Pre-Settlement tab — a human confirms." : "Closed = frozen: no editable field; corrections are a reversing entry. Both readouts are the Pre-Settlement rows, closed."}</p>
  </div>;
}
