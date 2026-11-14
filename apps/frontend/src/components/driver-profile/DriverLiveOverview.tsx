import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { currentOriginHref, withReturnContext } from "../../lib/returnContext";
import { V3Panel } from "../v3/V3Panel";
import { getUnit } from "../../api/mdata";
import { listAllDispatchLoads, type DispatchLoad } from "../../api/dispatch";
import { getPreSettlementForDriver } from "../../api/driverFinance";
import { listLatestPositions } from "../../api/telematics";
import { EntityLink } from "../shared/EntityLink";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { ListErrorState } from "../ListErrorState";
import { FleetTruck } from "../../pages/maintenance/components/FleetHealthLine";
import { readFleetHealth } from "../../pages/maintenance/components/fleet-health-source";
import { formatQuantityTable, formatUsdTable } from "../../lib/money";
import { driverProfileTabHref } from "../../pages/drivers/driverProfileTabs";
import type { DriverProfileAggregate } from "../../pages/drivers/DriverProfilePage";
import type { DqfComplianceSummary } from "../../lib/driverDqf";

const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";
/** Board 11 date cells: calendar MM-DD-YYYY (date-only, never shifted to Central); "—" when not recorded. */
const boardDate = (value: unknown) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(value)); return m ? `${m[2]}-${m[3]}-${m[1]}` : "—"; };
/** Board 11 trip dates: MM-DD (the Dates column is a lane window, the year lives on the load). */
const tripDate = (value: unknown) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(text(value)); return m ? `${m[1]}-${m[2]}` : "—"; };
const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export const headingCardinal = (deg: number | null | undefined) => deg == null || !Number.isFinite(Number(deg)) ? null : CARDINALS[Math.round((((Number(deg) % 360) + 360) % 360) / 45) % 8];
const todayIso = () => new Date().toISOString().slice(0, 10);
/** Board money cells print plain numbers (2 decimals, thousands) — the panel title carries the unit. */
const plainMoney = (cents: unknown) => { const n = Number(cents); return Number.isFinite(n) ? (n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"; };
/** Share of the current Mon–Sun pay week elapsed (America/Chicago) — the bar under "Pay this week". */
export function payWeekElapsed(now = new Date()) {
  const ct = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const dow = (ct.getDay() + 6) % 7;
  return Math.min(1, Math.max(0, (dow * 24 + ct.getHours() + ct.getMinutes() / 60) / (7 * 24)));
}

/** V3 overview composes existing readers; it never calculates pay or changes eligibility. */
export function DriverLiveOverview({ companyId, driverId, aggregate, dqf, dqfUnavailable, onReviewDqf }: {
  companyId: string; driverId: string; aggregate: DriverProfileAggregate; dqf: DqfComplianceSummary; dqfUnavailable: boolean;
  onReviewDqf: () => void;
}) {
  const { pathname, search } = useLocation();
  const liveOriginHref = currentOriginHref(pathname, search);
  const liveHref = (target: string) => withReturnContext(target, liveOriginHref);
  const assignment = aggregate.current_assignment.currently_driving_truck as Record<string, unknown> | null;
  const currentLoad = aggregate.current_assignment.current_load as Record<string, unknown> | null;
  const unitId = text(assignment?.unit_id);
  const unit = useQuery({ queryKey: ["driver-live-overview", "unit", companyId, unitId], queryFn: () => getUnit(unitId, companyId), enabled: Boolean(companyId && unitId) });
  const positions = useQuery({ queryKey: ["telematics", "latest-positions", companyId], queryFn: () => listLatestPositions(companyId), enabled: Boolean(companyId && unitId), refetchInterval: 30_000 });
  const trips = useQuery({ queryKey: ["driver-live-overview", "trips", companyId, driverId], queryFn: () => listAllDispatchLoads({ operating_company_id: companyId, driver: driverId, scope: "board", view: "home", status: [] }), enabled: Boolean(companyId && driverId) });
  const pay = useQuery({ queryKey: ["driver-live-overview", "pre-settlement", companyId, driverId], queryFn: () => getPreSettlementForDriver(driverId, companyId), enabled: Boolean(companyId && driverId) });
  const health = useQuery({ queryKey: ["maintenance", "fleet-health", companyId], queryFn: () => readFleetHealth(companyId), enabled: Boolean(companyId && unitId), staleTime: 60_000 });
  const position = positions.isError ? undefined : positions.data?.rows?.find((row) => row.unit_id === unitId);
  const unitHealth = health.isError ? undefined : health.data?.units?.find((row) => row.unit_id === unitId);
  const settlement = pay.isError ? null : pay.data?.settlement;
  // ROW 167: these are CALENDAR dates (CDL / medical / visa expiry) -- date-only, never shifted to Central.
  const today = todayIso();
  const dated = (value: unknown, missing: string) => {
    const iso = text(value).slice(0, 10);
    if (!iso) return { state: missing, tone: "missing" as const };
    return iso < today ? { state: "Expired — not blocking", tone: "missing" as const } : { state: "Valid", tone: "ok" as const };
  };
  const b1Expiration = aggregate.driver.has_b1_visa || /^b[- ]?1$/i.test(text(aggregate.driver.visa_type)) ? aggregate.driver.visa_expires_at || aggregate.driver.b1_visa_expires_date : null;
  const license = (aggregate.license ?? {}) as Record<string, unknown>;
  const cdlLabel = ["CDL", text(license.state ?? aggregate.driver.cdl_state), text(license.class_label ?? aggregate.driver.cdl_class)].filter(Boolean).join(" · ");
  const contactOk = Boolean(aggregate.driver.emergency_contact_name && (aggregate.driver.emergency_contact_phone_primary || aggregate.driver.emergency_contact_phone_alternate));
  const cdl = dated(aggregate.driver.cdl_expires_at, "Add date — not blocking");
  const medical = aggregate.medical_card_unavailable ? { state: "Source unavailable", tone: "unknown" as const } : dated(aggregate.medical_card.expiration, "Add — not blocking");
  const visa = dated(b1Expiration, "Add date — not blocking");
  const documents = [
    { id: "cdl", label: cdlLabel, expiresLabel: boardDate(aggregate.driver.cdl_expires_at), ...cdl, to: driverProfileTabHref(driverId, "Safety file") },
    { id: "medical", label: "DOT medical card", expiresLabel: aggregate.medical_card_unavailable ? "Unavailable" : boardDate(aggregate.medical_card.expiration), ...medical, to: driverProfileTabHref(driverId, "Safety file") },
    { id: "visa", label: "B-1 visa", expiresLabel: boardDate(b1Expiration), ...visa, to: driverProfileTabHref(driverId, "Edit") },
    { id: "contact", label: "Emergency contact", expiresLabel: "—", state: contactOk ? "Recorded" : "Add — not blocking", tone: contactOk ? "ok" as const : "missing" as const, to: driverProfileTabHref(driverId, "Edit") },
    { id: "dqf", label: "Qualification file", expiresLabel: "Review checklist", state: dqfUnavailable ? "Source unavailable" : dqf.label, tone: "unknown" as const, to: driverProfileTabHref(driverId, "Safety file") },
  ] as const;
  // DP3 — board Trip table: state dot + Now/Booked ahead, Load, Lane, Dates (MM-DD → MM-DD), Rate (plain number).
  const tripColumns: ParityColumn<DispatchLoad>[] = [
    { key: "status", label: "", sortValue: (row) => row.id === currentLoad?.load_id ? 0 : 1, exportValue: (row) => row.id === currentLoad?.load_id ? "Now" : "Booked ahead", render: (row) => { const now = row.id === currentLoad?.load_id; return <span className="inline-flex items-center gap-2 whitespace-nowrap"><span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${now ? "bg-blue-600" : "bg-slate-400"}`} />{now ? "Now" : "Booked ahead"}</span>; } },
    { key: "load_number", label: "Load", render: (row) => <EntityLink kind="load" id={row.id} label={row.load_number} /> },
    { key: "lane", label: "Lane", render: (row) => `${[row.pickup_city, row.pickup_state].filter(Boolean).join(", ") || "Not recorded"} → ${[row.delivery_city, row.delivery_state].filter(Boolean).join(", ") || "Not recorded"}`, sortValue: (row) => row.pickup_city },
    {
      key: "dates",
      label: "Dates",
      sortable: true,
      sortValue: (row) => text(row.pickup_scheduled_at),
      exportValue: (row) => `${boardDate(row.pickup_scheduled_at)} → ${boardDate(row.delivery_scheduled_at)}`,
      render: (row) => <span className="whitespace-nowrap tabular-nums">{`${tripDate(row.pickup_scheduled_at)} → ${tripDate(row.delivery_scheduled_at)}`}</span>,
    },
    { key: "rate_total_cents", label: "Rate", render: (row) => <EntityLink kind="load" id={row.id} label={plainMoney(row.rate_total_cents)} /> },
  ];
  const statusDot = (tone: "ok" | "missing" | "unknown") => (
    <span
      aria-hidden
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        display: "inline-block",
        background: tone === "ok" ? "#15803D" : tone === "missing" ? "#B45309" : "#94A3B8",
        flexShrink: 0,
      }}
    />
  );
  const unitNumber = text(assignment?.unit_number) || text(unit.data?.unit_number) || "Assigned unit";
  const unitTitle = unitId
    ? `${[unitNumber, [unit.data?.make, unit.data?.model].map(text).filter(Boolean).join(" "), text(unit.data?.year)].filter(Boolean).join(" · ")} — live`
    : "No current truck assignment";
  const speed = position?.speed_mph ?? unitHealth?.speed_mph ?? null;
  const cardinal = headingCardinal(position?.heading_deg);
  const where = unitHealth?.formatted_location || [unitHealth?.telemetry_city, unitHealth?.telemetry_state].filter(Boolean).join(", ") || null;
  const odo = unitHealth?.odometer_mi ?? null;
  const unitFooter = [where ?? "Location unavailable", cardinal ? `heading ${cardinal}` : "heading unavailable", odo == null ? "odo unavailable" : `odo ${Math.round(Number(odo)).toLocaleString("en-US")}`].join(" · ") + " ·";
  const deductions = Number(settlement?.deductions_total ?? 0);
  const elapsed = payWeekElapsed();
  return <section aria-label="Driver live overview" className="min-w-0 space-y-3 py-3">
    {/* DP2 — Live unit wider; pay panel compact (board asymmetric widths). */}
    <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(220px,1fr)]">
      <V3Panel title={unitTitle} testId="driver-live-unit" viewAllHref={unitId ? liveHref(`/fleet/units/${encodeURIComponent(unitId)}`) : undefined}>
        <div className="px-3.5 pb-3 pt-2" data-testid="driver-live-unit-road">
          <div className="flex justify-center pb-1 text-page-title font-semibold tabular-nums text-slate-900" data-testid="driver-live-unit-speed">
            {speed != null && unitId ? <EntityLink kind="unit" id={unitId} label={`${formatQuantityTable(speed, 0)} mph`} /> : <span className="text-xs font-normal text-slate-500">{positions.isError ? "Position source unavailable" : positions.isFetching ? "Loading last reported position…" : "Speed unavailable"}</span>}
          </div>
          <div className="relative flex h-[68px] items-center justify-center overflow-hidden bg-slate-200/70" title={position ? "Speed is the last reported value, not a current movement assertion." : undefined}>
            <span aria-hidden className="absolute inset-x-0 top-1/2 h-0 -translate-y-1/2 border-t-[3px] border-dashed border-white" style={{ borderImage: "repeating-linear-gradient(90deg,#fff 0 28px,transparent 28px 46px) 3" }} />
            <span className="relative [&>svg]:h-[68px] [&>svg]:w-[180px]"><FleetTruck row={{ state: "ok" }} /></span>
          </div>
          <p className="pt-2.5 text-right text-xs text-slate-500" data-testid="driver-live-unit-footer">{unitFooter}</p>
        </div>
      </V3Panel>
      <V3Panel title="Pay this week · open pre-settlement" viewAllHref={liveHref(driverProfileTabHref(driverId, "Settlements"))}>
        <div className="space-y-1.5 p-3 text-xs">
          {pay.isError ? <ListErrorState title="Couldn't load open pre-settlement" status={0} onRetry={() => void pay.refetch()} /> : pay.isPending ? <p>Loading open pre-settlement…</p> : settlement ? <>
            <div className="text-page-title font-bold tabular-nums leading-none text-slate-900">
              <EntityLink kind="settlement" id={settlement.id} label={formatUsdTable(settlement.net_pay)} />
            </div>
            <p className="text-slate-500" data-testid="driver-pay-line">
              {Number(settlement.gross_pay) === Number(settlement.net_pay) ? "gross" : `${formatUsdTable(settlement.gross_pay)} gross`} · {deductions === 0 ? "0" : formatUsdTable(deductions)} deductions{pay.data?.legs?.length ? <> · loads {pay.data.legs.map((leg, i) => <span key={leg.load_id}>{i ? ", " : ""}<EntityLink kind="load" id={leg.load_id} label={leg.load_number} /></span>)}</> : null}
            </p>
            <div role="progressbar" aria-label="Pay week elapsed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(elapsed * 100)} className="h-1.5 w-[260px] max-w-full rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-[#14314F]" style={{ width: `${Math.round(elapsed * 100)}%` }} />
            </div>
          </> : <p>No open pre-settlement for this driver.</p>}
        </div>
      </V3Panel>
    </div>
    <div className="grid min-w-0 items-start gap-3 xl:grid-cols-2">
      <V3Panel title="Trip — now and booked ahead" viewAllHref={liveHref(driverProfileTabHref(driverId, "Loads"))}>
        {trips.isError ? <ListErrorState title="Couldn't load assigned trips" status={0} onRetry={() => void trips.refetch()} /> : <ParityTable appearance="board" panel columns={tripColumns} rows={trips.data?.loads ?? []} rowKey={(row) => row.id} loading={trips.isPending} emptyText="No live assigned loads." />}
      </V3Panel>
      <V3Panel title="Documents" viewAllHref={liveHref(driverProfileTabHref(driverId, "Documents"))}>
        <ParityTable
          appearance="board"
          panel
          rows={[...documents]}
          rowKey={(row) => row.id}
          columns={[
            { key: "label", label: "Document", className: "text-left", render: (row) => row.id === "dqf" ? <button type="button" className="underline" onClick={onReviewDqf}>{row.label}</button> : <Link to={row.to}>{row.label}</Link> },
            { key: "expiresLabel", label: "Expires", className: "text-left", render: (row) => <span className="tabular-nums">{row.expiresLabel}</span> },
            {
              key: "state",
              label: "State",
              className: "text-left",
              render: (row) => (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                  {statusDot(row.tone)}
                  {row.id === "dqf" ? <button type="button" className="underline" onClick={onReviewDqf}>{row.state}</button> : <Link to={row.to}>{row.state}</Link>}
                </span>
              ),
            },
          ]}
        />
        <p className="border-t border-slate-200 px-3.5 py-2 text-xs text-slate-500">Missing dates never block dispatch, booking, settlement or pay (owner rule 10-22).</p>
      </V3Panel>
    </div>
  </section>;
}
