import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { V3Panel } from "../v3/V3Panel";
import { getUnit } from "../../api/mdata";
import { listAllDispatchLoads, type DispatchLoad } from "../../api/dispatch";
import { getPreSettlementForDriver } from "../../api/driverFinance";
import { listLatestPositions } from "../../api/telematics";
import { EntityLink } from "../shared/EntityLink";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { ListErrorState } from "../ListErrorState";
import { FleetTruck } from "../../pages/maintenance/components/FleetHealthLine";
import { formatDateUS, formatDateTimeUS } from "../../lib/formatDate";
import { formatUsdTable, formatUsdCentsTable } from "../../lib/money";
import { driverProfileTabHref } from "../../pages/drivers/driverProfileTabs";
import { settlementLabel } from "../../lib/settlementNumber";
import type { DriverProfileAggregate } from "../../pages/drivers/DriverProfilePage";
import type { DqfComplianceSummary } from "../../lib/driverDqf";

const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";

/** V3 overview composes existing readers; it never calculates pay or changes eligibility. */
export function DriverLiveOverview({ companyId, driverId, aggregate, dqf, dqfUnavailable, onReviewDqf }: {
  companyId: string; driverId: string; aggregate: DriverProfileAggregate; dqf: DqfComplianceSummary; dqfUnavailable: boolean;
  onReviewDqf: () => void;
}) {
  const navigate = useNavigate();
  const assignment = aggregate.current_assignment.currently_driving_truck as Record<string, unknown> | null;
  const currentLoad = aggregate.current_assignment.current_load as Record<string, unknown> | null;
  const unitId = text(assignment?.unit_id);
  const unit = useQuery({ queryKey: ["driver-live-overview", "unit", companyId, unitId], queryFn: () => getUnit(unitId, companyId), enabled: Boolean(companyId && unitId) });
  const positions = useQuery({ queryKey: ["telematics", "latest-positions", companyId], queryFn: () => listLatestPositions(companyId), enabled: Boolean(companyId && unitId), refetchInterval: 30_000 });
  const trips = useQuery({ queryKey: ["driver-live-overview", "trips", companyId, driverId], queryFn: () => listAllDispatchLoads({ operating_company_id: companyId, driver: driverId, scope: "board", view: "home", status: [] }), enabled: Boolean(companyId && driverId) });
  const pay = useQuery({ queryKey: ["driver-live-overview", "pre-settlement", companyId, driverId], queryFn: () => getPreSettlementForDriver(driverId, companyId), enabled: Boolean(companyId && driverId) });
  const position = positions.isError ? undefined : positions.data?.rows?.find((row) => row.unit_id === unitId);
  const settlement = pay.isError ? null : pay.data?.settlement;
  const date = (value: unknown) => text(value) ? formatDateUS(text(value)) : "Not recorded";
  const b1Expiration = aggregate.driver.has_b1_visa || /^b[- ]?1$/i.test(text(aggregate.driver.visa_type)) ? aggregate.driver.visa_expires_at || aggregate.driver.b1_visa_expires_date : null;
  const documents = [
    { id: "cdl", label: "CDL", expires: date(aggregate.driver.cdl_expires_at), state: aggregate.driver.cdl_expires_at ? "Date recorded" : "Add date", to: driverProfileTabHref(driverId, "Safety file") },
    { id: "medical", label: "DOT medical card", expires: aggregate.medical_card_unavailable ? "Unavailable" : date(aggregate.medical_card.expiration), state: aggregate.medical_card_unavailable ? "Source unavailable" : aggregate.medical_card.expiration ? "Date recorded" : "Add date", to: driverProfileTabHref(driverId, "Safety file") },
    { id: "visa", label: "B-1 visa", expires: date(b1Expiration), state: b1Expiration ? "Date recorded" : "Review credentials", to: driverProfileTabHref(driverId, "Edit") },
    { id: "contact", label: "Emergency contact", expires: "Not applicable", state: aggregate.driver.emergency_contact_name && (aggregate.driver.emergency_contact_phone_primary || aggregate.driver.emergency_contact_phone_alternate) ? "Name and phone recorded" : "Add contact", to: driverProfileTabHref(driverId, "Edit") },
    { id: "dqf", label: "Qualification file", expires: "Review checklist", state: dqfUnavailable ? "Source unavailable" : dqf.label, to: driverProfileTabHref(driverId, "Safety file") },
  ];
  const tripColumns: ParityColumn<DispatchLoad>[] = [
    { key: "status", label: "Trip", render: (row) => row.id === currentLoad?.load_id ? "Now" : "Assigned" },
    { key: "load_number", label: "Load", render: (row) => <EntityLink kind="load" id={row.id} label={row.load_number} /> },
    { key: "lane", label: "Lane", render: (row) => `${[row.pickup_city, row.pickup_state].filter(Boolean).join(", ") || "Not recorded"} → ${[row.delivery_city, row.delivery_state].filter(Boolean).join(", ") || "Not recorded"}`, sortValue: (row) => row.pickup_city },
    { key: "pickup_scheduled_at", label: "Pickup", render: (row) => date(row.pickup_scheduled_at) },
    { key: "delivery_scheduled_at", label: "Delivery", render: (row) => date(row.delivery_scheduled_at) },
    { key: "rate_total_cents", label: "Booked rate", render: (row) => <EntityLink kind="load" id={row.id} label={formatUsdCentsTable(row.rate_total_cents)} /> },
  ];
  return <section aria-label="Driver live overview" className="min-w-0 space-y-3 py-3">
    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <V3Panel title="Live unit" headerRight={unitId ? <EntityLink kind="unit" id={unitId} label={text(assignment?.unit_number) || "Assigned unit"} /> : <span>No current truck assignment</span>}>
        <div className="flex flex-wrap items-center gap-2 px-3 pt-2 text-xs">
          <span>{unit.isError ? "Unit details unavailable" : [unit.data?.make, unit.data?.model, unit.data?.year].map(text).filter(Boolean).join(" · ")}</span>
        </div>
        <div className="space-y-2 p-3">
          <div className="flex flex-wrap items-center justify-center gap-4 overflow-hidden bg-slate-100 p-3 [&>svg]:h-20 [&>svg]:w-52"><FleetTruck row={{ state: "none" }} /><span className="text-xs font-semibold tabular-nums">{position?.speed_mph != null ? <EntityLink kind="unit" id={unitId} label={`${position.speed_mph.toLocaleString("en-US")} mph`} /> : "Speed unavailable"}</span></div>
          <p className="text-xs text-slate-600">{position ? `Last reported ${formatDateTimeUS(position.captured_at)} · heading ${position.heading_deg == null ? "unavailable" : `${position.heading_deg}°`}` : positions.isError ? "Position source unavailable." : positions.isFetching ? "Loading last reported position…" : "No position reported for this assignment."}</p>
          {position ? <p className="text-xs text-slate-600">Location: {Number.isFinite(position.lat) && Number.isFinite(position.lng) ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : "Unavailable"}. Speed is the last reported value, not a current movement assertion.</p> : null}
        </div>
      </V3Panel>
      <V3Panel title="Open pre-settlement" onViewAll={() => navigate(driverProfileTabHref(driverId, "Settlements"))}>
        <div className="space-y-2 p-3 text-xs">
          {pay.isError ? <ListErrorState title="Couldn't load open pre-settlement" status={0} onRetry={() => void pay.refetch()} /> : pay.isPending ? <p>Loading open pre-settlement…</p> : settlement ? <>
            <EntityLink kind="settlement" id={settlement.id} label={settlementLabel(settlement)} />
            <div className="text-xs font-semibold"><EntityLink kind="settlement" id={settlement.id} label={`${formatUsdTable(settlement.gross_pay)} gross`} /></div>
            <p><EntityLink kind="settlement" id={settlement.id} label={`${formatUsdTable(settlement.deductions_total)} deductions · ${formatUsdTable(settlement.net_pay)} net`} /></p>
            <p>{date(settlement.period_start)} – {date(settlement.period_end)}</p>
            <div className="flex flex-wrap gap-2">{pay.data?.legs?.map((leg) => <EntityLink key={leg.load_id} kind="load" id={leg.load_id} label={leg.load_number} />)}</div>
          </> : <p>No open pre-settlement for this driver.</p>}
        </div>
      </V3Panel>
    </div>
    <div className="grid min-w-0 items-start gap-3 xl:grid-cols-2">
      <V3Panel title="Trip — current and assigned" onViewAll={() => navigate(driverProfileTabHref(driverId, "Loads"))}>
        {trips.isError ? <ListErrorState title="Couldn't load assigned trips" status={0} onRetry={() => void trips.refetch()} /> : <ParityTable columns={tripColumns} rows={trips.data?.loads ?? []} rowKey={(row) => row.id} loading={trips.isPending} emptyText="No live assigned loads." />}
      </V3Panel>
      <V3Panel title="Documents" onViewAll={() => navigate(driverProfileTabHref(driverId, "Documents"))}>
        <ParityTable rows={documents} rowKey={(row) => row.id} columns={[
          { key: "label", label: "Document", render: (row) => row.id === "dqf" ? <button type="button" className="underline" onClick={onReviewDqf}>{row.label}</button> : <Link to={row.to}>{row.label}</Link> },
          { key: "expires", label: "Expires" }, { key: "state", label: "State", render: (row) => row.id === "dqf" ? <button type="button" className="underline" onClick={onReviewDqf}>{row.state}</button> : <Link to={row.to}>{row.state}</Link> },
        ]} />
        <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-600">Recorded dates do not certify validity. Missing information is reviewed in the source file; this display never blocks dispatch, booking, settlement or pay.</p>
      </V3Panel>
    </div>
  </section>;
}
