/**
 * ROUND 8.4 / UI-F11125 — Truck service map board-identical rebuild.
 * Board: docs/design/v3/maintenance-vehicle-graphics/TruckProfile.dc.html
 * Geometry: 990×520 top-down/side SVG, Barlow chrome chips (ODOMETER · NOW · Driver · Load),
 * numbered system cards. Live engines only — never board sample tread/miles.
 */
import type { CSSProperties } from "react";
import {Link, useLocation} from "react-router-dom";
import { currentOriginHref, withReturnContext } from "../../../lib/returnContext";
import { EntityLink } from "../../../components/shared/EntityLink";
import { truckProfileBoardSvgHtml } from "./truckProfileBoardSvg";

export type TruckServiceMapState = "ok" | "soon" | "defect" | "none";

export type TruckServiceMapSystem = {
  n: number;
  name: string;
  detail: string;
  state: TruckServiceMapState;
  href?: string;
};

const STATE_LABEL: Record<TruckServiceMapState, string> = {
  ok: "OK",
  soon: "DUE SOON",
  defect: "DEFECT",
  none: "NO RECORD",
};

/** Board 44 state colours (numbered circles, legend dots, SVG callouts). */
const STATE_HEX: Record<TruckServiceMapState, string> = { ok: "#1F8A4C", soon: "#C76A0A", defect: "#C0262D", none: "#8A97A8" };
const STATE_PILL: Record<TruckServiceMapState, { bg: string; fg: string }> = {
  ok: { bg: "#DDF3E6", fg: "#1F6B3A" },
  soon: { bg: "#FDEBD3", fg: "#8A4B06" },
  defect: { bg: "#FBE1E1", fg: "#8E1B20" },
  none: { bg: "#EEF1F5", fg: "#5B6B7E" },
};

const CHIP_LABEL: CSSProperties = {
  fontFamily: "'Barlow Semi Condensed', Inter, ui-sans-serif, system-ui, sans-serif",
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: "0.12em",
  color: "#5B6B7E",
  textTransform: "uppercase",
};

const CHIP_VALUE: CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontWeight: 600,
  fontSize: 22,
  color: "#14213D",
  lineHeight: 1.15,
};

function pmState(milesRemaining: number | null): TruckServiceMapState {
  if (milesRemaining == null || Number.isNaN(milesRemaining)) return "none";
  if (milesRemaining < 0) return "defect";
  if (milesRemaining <= 5_000) return "soon";
  return "ok";
}

function formatMiles(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `${Math.abs(Number(n)).toLocaleString("en-US")} mi`;
}

function formatOdometer(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-US");
}

function dash(v: unknown): string {
  if (v == null || v === "") return "—";
  return String(v);
}

/** Build service-map systems from the unit profile aggregate — live engines only. */
export function buildTruckServiceMapSystems(input: {
  unitId: string;
  nextPmDue: Record<string, unknown>;
  openWoTotal: number;
  activeFaultCount: number;
  compliance: Record<string, unknown> | null | undefined;
}): TruckServiceMapSystem[] {
  const systems: TruckServiceMapSystem[] = [];
  let n = 1;

  const pmEntries = Object.entries(input.nextPmDue ?? {});
  if (pmEntries.length === 0) {
    systems.push({
      n: n++,
      name: "Engine · PM clock",
      detail: "No PM schedule on file for this unit",
      state: "none",
      href: `/maintenance/pm-schedule?unit_id=${encodeURIComponent(input.unitId)}&create=1`,
    });
  } else {
    for (const [key, raw] of pmEntries.slice(0, 6)) {
      const row = (raw ?? {}) as Record<string, unknown>;
      const miles =
        row.miles_remaining == null || row.miles_remaining === ""
          ? null
          : Number(row.miles_remaining);
      const label = key.replace(/_/g, " ");
      const last = row.last_done_odometer == null ? "—" : formatMiles(Number(row.last_done_odometer));
      const rem = miles == null ? "—" : formatMiles(miles);
      systems.push({
        n: n++,
        name: /engine|pm/i.test(label) ? `Engine · ${label}` : label,
        detail: `Remaining ${rem} · last @ ${last}`,
        state: pmState(miles),
        href: `/maintenance/pm-schedule?unit_id=${encodeURIComponent(input.unitId)}`,
      });
    }
  }

  systems.push({
    n: n++,
    name: "Open work orders",
    detail:
      input.openWoTotal > 0
        ? `${input.openWoTotal} open WO${input.openWoTotal === 1 ? "" : "s"}`
        : "No open work orders",
    state: input.openWoTotal > 0 ? "soon" : "ok",
    href: `/maintenance/work-orders?unit_id=${encodeURIComponent(input.unitId)}`,
  });

  systems.push({
    n: n++,
    name: "Active faults",
    detail:
      input.activeFaultCount > 0
        ? `${input.activeFaultCount} active fault code${input.activeFaultCount === 1 ? "" : "s"}`
        : "No active fault codes",
    state: input.activeFaultCount > 0 ? "defect" : "ok",
    href: `/fleet/units/${encodeURIComponent(input.unitId)}#faults`,
  });

  const comp = input.compliance ?? {};
  const annual =
    (comp.annual_inspection_expires_on as string | null | undefined) ??
    (comp.dot_expires_on as string | null | undefined) ??
    null;
  systems.push({
    n: n++,
    name: "Annual DOT · tractor",
    detail: annual ? `Valid through ${annual}` : "No inspection date on file",
    state: annual ? "ok" : "none",
    href: `/compliance?unit_id=${encodeURIComponent(input.unitId)}`,
  });

  return systems;
}

export function TruckServiceMap(props: {
  unitId: string;
  unitNumber: string;
  nextPmDue: Record<string, unknown>;
  openWoTotal: number;
  activeFaultCount: number;
  compliance?: Record<string, unknown> | null;
  /** Live Samsara / position aggregate (board ODOMETER · NOW chips). */
  samsara?: Record<string, unknown> | null;
  latestPosition?: Record<string, unknown> | null;
  currentDriver?: Record<string, unknown> | null;
  currentLoad?: Record<string, unknown> | null;
  /** Board 44 caption — the unit's own make · model · year (never the board's Peterbilt specimen). */
  makeModelYear?: string | null;
  /** Board 44 header + map caption — the trailer actually attached, when the profile has one. */
  trailerLabel?: string | null;
}) {
  const { pathname, search: locSearch } = useLocation();
  const originHref = currentOriginHref(pathname, locSearch);
  const fleetHref = (target: string) => withReturnContext(target, originHref);
  const systems = buildTruckServiceMapSystems({
    unitId: props.unitId,
    nextPmDue: props.nextPmDue,
    openWoTotal: props.openWoTotal,
    activeFaultCount: props.activeFaultCount,
    compliance: props.compliance,
  });

  const parsed = (props.samsara?.raw_payload_parsed as Record<string, unknown> | undefined) ?? {};
  const odometerRaw =
    parsed.odometer_miles ??
    props.latestPosition?.odometer_mi ??
    props.latestPosition?.book_odometer_mi ??
    null;
  const odometer =
    odometerRaw == null || odometerRaw === "" ? null : Number(odometerRaw);

  const speed = props.latestPosition?.speed_mph != null ? Number(props.latestPosition.speed_mph) : null;
  const engineState = props.latestPosition?.engine_state != null ? String(props.latestPosition.engine_state) : "";
  const placeBits = [
    props.latestPosition?.reverse_geocode != null ? String(props.latestPosition.reverse_geocode) : "",
    props.latestPosition?.city != null ? String(props.latestPosition.city) : "",
    props.latestPosition?.state != null ? String(props.latestPosition.state) : "",
  ].filter(Boolean);
  const place = placeBits[0] || (props.latestPosition?.lat != null && props.latestPosition?.lng != null
    ? `${props.latestPosition.lat}, ${props.latestPosition.lng}`
    : "");
  let nowLabel = "—";
  if (place || engineState || speed != null) {
    const motion =
      speed != null && speed > 3
        ? "Rolling"
        : /on|idle|moving/i.test(engineState)
          ? engineState
          : speed != null
            ? "Stopped"
            : "—";
    nowLabel = place ? `${motion} · ${place}` : motion;
  }

  const driverName = dash(props.currentDriver?.name);
  const driverId = props.currentDriver?.id != null ? String(props.currentDriver.id) : null;
  const loadNumber = dash(props.currentLoad?.load_number);

  const svgHtml = truckProfileBoardSvgHtml(props.unitId, {
    unitNumber: props.unitNumber,
    caption: props.makeModelYear ? `${props.makeModelYear.toUpperCase()} · seen from above, nose right` : undefined,
    trailerCaption: props.trailerLabel ? `Trailer ${props.trailerLabel}` : undefined,
    callouts: systems.slice(0, 4).map((x) => x.state),
  });
  const loadId = props.currentLoad?.id != null ? String(props.currentLoad.id) : null;
  const subtitle = [props.trailerLabel ? `tractor + trailer ${props.trailerLabel}` : "tractor", driverName !== "—" ? driverName : null, loadNumber !== "—" ? `load ${loadNumber}` : null].filter(Boolean).join(" · ");

  // Board 44 — docs/design/v3/maintenance-vehicle-graphics/TruckProfile.dc.html: back link, unit title + subtitle,
  // ODOMETER · SAMSARA and NOW tiles, tall New work order; then the white service-map card beside a 380px column of
  // numbered system cards (circle in state colour, name/detail, state pill). All values live; missing stays "—".
  return (
    <section className="flex min-w-0 flex-col gap-[18px] rounded-[14px] bg-[#E9EDF2] p-4" data-testid="truck-service-map" aria-label="Truck service map">
      <div className="flex flex-wrap items-end justify-between gap-4" data-testid="truck-service-map-body">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Link to={fleetHref("/maintenance/fleet-table?view=health")} className="text-section-header font-bold tracking-[.14em] text-[#4A5A70] no-underline">‹ FLEET HEALTH LINE</Link>
          <div className="flex min-w-0 flex-wrap items-baseline gap-3.5">
            <h2 className="m-0 text-page-title font-extrabold leading-none text-[#14213D]">{props.unitNumber}</h2>
            <span className="text-xs text-[#4A5A70]" data-testid="truck-service-map-subtitle">
              {subtitle}
              {driverId ? <> · <EntityLink kind="driver" id={driverId} label="driver profile" /></> : null}
              {loadId ? <> · <EntityLink kind="load" id={loadId} label="open load" /></> : null}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5" data-testid="truck-service-map-header-chips">
          <div className="flex flex-col gap-0.5 rounded-xl bg-white px-4 py-2.5 shadow-[0_1px_0_#D5DCE5]" data-testid="truck-service-map-odometer">
            <span style={CHIP_LABEL}>Odometer · Samsara</span>
            <span style={CHIP_VALUE}>{formatOdometer(odometer)}</span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-xl bg-white px-4 py-2.5 shadow-[0_1px_0_#D5DCE5]" data-testid="truck-service-map-now">
            <span style={CHIP_LABEL}>Now</span>
            <span className="text-xs font-bold" style={{ color: nowLabel === "—" ? "#5B6B7E" : "#1F8A4C" }}>{nowLabel}</span>
          </div>
          <span className="sr-only" data-testid="truck-service-map-driver">{driverName}</span>
          <span className="sr-only" data-testid="truck-service-map-load">{loadNumber === "—" ? "—" : String(loadNumber)}</span>
          <Link
            to={`/maintenance/work-orders?unit_id=${encodeURIComponent(props.unitId)}&create=1`}
            className="inline-flex h-16 items-center rounded-xl bg-[#14213D] px-[22px] text-xs font-semibold text-white"
            data-testid="truck-service-map-new-wo"
          >
            New work order
          </Link>
        </div>
      </div>

      <div className="grid min-w-0 gap-[18px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-2.5 rounded-[18px] bg-white p-5 shadow-[0_1px_0_#D5DCE5]">
          <div className="flex flex-wrap justify-between gap-2 text-section-header font-bold tracking-[.12em] text-[#5B6B7E]" data-testid="truck-service-map-legend">
            <span>SERVICE MAP · SELECT A SYSTEM</span>
            <span className="flex flex-wrap gap-3">
              {(["ok", "soon", "defect", "none"] as const).map((k) => (
                <span key={k} className="inline-flex items-center gap-1"><span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: STATE_HEX[k] }} />{STATE_LABEL[k]}</span>
              ))}
            </span>
          </div>
          <div className="min-w-0 overflow-hidden" data-testid="truck-service-map-board-svg" dangerouslySetInnerHTML={{ __html: svgHtml }} />
        </div>

        <ul className="m-0 flex min-w-0 list-none flex-col gap-2.5 p-0" data-testid="truck-service-map-systems">
          {systems.map((sys) => {
            const body = (
              <span className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-white px-3.5 py-2.5 text-left shadow-[0_1px_0_#D5DCE5]">
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full text-xs font-extrabold text-white" style={{ background: STATE_HEX[sys.state] }}>{sys.n}</span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-xs font-bold text-[#14213D]">{sys.name}</span>
                  <span className="text-xs text-[#4A5A70]">{sys.detail}</span>
                </span>
                <span className="rounded-full px-[9px] py-[3px] text-section-header font-bold" style={{ background: STATE_PILL[sys.state].bg, color: STATE_PILL[sys.state].fg }}>{STATE_LABEL[sys.state]}</span>
              </span>
            );
            return (
              <li key={sys.n}>
                {sys.href ? <Link to={sys.href} className="block no-underline hover:opacity-95" data-testid={`truck-service-map-system-${sys.n}`}>{body}</Link> : body}
              </li>
            );
          })}
          <li className="text-xs text-[#5B6B7E]">
            Live PM / work order / fault / compliance for {props.unitNumber}; missing readings stay —.{" "}
            <Link to={fleetHref(`/maintenance/pm-schedule?unit_id=${encodeURIComponent(props.unitId)}`)} className="font-semibold text-[#14213D] underline">Open PM schedules →</Link>
          </li>
        </ul>
      </div>
    </section>
  );
}
