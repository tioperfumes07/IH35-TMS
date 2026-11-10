/**
 * ROUND 8.4 / UI-F11125 — Truck service map board-identical rebuild.
 * Board: docs/design/v3/maintenance-vehicle-graphics/TruckProfile.dc.html
 * Geometry: 990×520 top-down/side SVG, Barlow chrome chips (ODOMETER · NOW · Driver · Load),
 * numbered system cards. Live engines only — never board sample tread/miles.
 */
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { BoardSection } from "../../../components/v3/BoardSection";
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

const STATE_CHIP: Record<TruckServiceMapState, string> = {
  ok: "bg-emerald-50 text-emerald-800 border-emerald-200",
  soon: "bg-amber-50 text-amber-900 border-amber-200",
  defect: "bg-red-50 text-red-800 border-red-200",
  none: "bg-slate-50 text-slate-600 border-slate-200",
};

const STATE_DOT: Record<TruckServiceMapState, string> = {
  ok: "bg-emerald-600",
  soon: "bg-amber-500",
  defect: "bg-red-600",
  none: "bg-slate-400",
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

function HeaderChip({
  label,
  value,
  valueStyle,
  testId,
}: {
  label: string;
  value: string;
  valueStyle?: CSSProperties;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        background: "#FFFFFF",
        borderRadius: 12,
        padding: "10px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        boxShadow: "0 1px 0 #D5DCE5",
        minWidth: 0,
      }}
    >
      <span style={CHIP_LABEL}>{label}</span>
      <span style={{ ...CHIP_VALUE, ...valueStyle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </span>
    </div>
  );
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
}) {
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
  const loadNumber = dash(props.currentLoad?.load_number);

  const svgHtml = truckProfileBoardSvgHtml(props.unitId);

  return (
    <BoardSection title="SERVICE MAP · SELECT A SYSTEM" testId="truck-service-map">
      <div className="space-y-3 px-3 py-3" data-testid="truck-service-map-body" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
        {/* Board header chips — TruckProfile.dc.html */}
        <div
          className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
          data-testid="truck-service-map-header-chips"
        >
          <HeaderChip
            label="Odometer · Samsara"
            value={formatOdometer(odometer)}
            testId="truck-service-map-odometer"
          />
          <HeaderChip
            label="Now"
            value={nowLabel}
            valueStyle={{
              fontFamily: "Barlow, Inter, ui-sans-serif, system-ui, sans-serif",
              fontWeight: 700,
              fontSize: 18,
              color: nowLabel === "—" ? "#5B6B7E" : "#1F8A4C",
            }}
            testId="truck-service-map-now"
          />
          <HeaderChip label="Driver" value={driverName} testId="truck-service-map-driver" />
          <HeaderChip label="Load" value={loadNumber === "—" ? "—" : String(loadNumber)} testId="truck-service-map-load" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[#64748B]" data-testid="truck-service-map-legend">
            <span className="mr-2 inline-flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-full ${STATE_DOT.ok}`} aria-hidden /> OK
            </span>
            <span className="mr-2 inline-flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-full ${STATE_DOT.soon}`} aria-hidden /> DUE SOON
            </span>
            <span className="mr-2 inline-flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-full ${STATE_DOT.defect}`} aria-hidden /> DEFECT
            </span>
            <span className="inline-flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-full ${STATE_DOT.none}`} aria-hidden /> NO RECORD
            </span>
          </p>
          <Link
            to={`/maintenance/work-orders?unit_id=${encodeURIComponent(props.unitId)}&create=1`}
            className="rounded-sm border border-[#C6D1DC] bg-white px-3 py-1.5 text-xs font-semibold text-[#14314F] hover:bg-[#F6F9FB]"
            data-testid="truck-service-map-new-wo"
          >
            New work order
          </Link>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
          <div
            className="min-w-0 flex-[1.4] overflow-hidden rounded-sm border border-[#E8EDF2] bg-[#F6F9FB]"
            data-testid="truck-service-map-board-svg"
            // Board SVG is static illustration; numbered cards to the right carry live state.
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />

          <ul className="min-w-0 flex-1 space-y-2" data-testid="truck-service-map-systems">
            {systems.map((sys) => {
              const body = (
                <div className="flex items-start gap-2 rounded-sm border border-[#E8EDF2] bg-white px-2.5 py-2">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 text-xs font-bold text-slate-800">
                    {sys.n}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-[#0F1B2D]">{sys.name}</span>
                      <span
                        className={`inline-flex rounded-sm border px-1.5 py-0.5 text-section-header font-semibold uppercase tracking-wide ${STATE_CHIP[sys.state]}`}
                      >
                        {STATE_LABEL[sys.state]}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-[#64748B]">{sys.detail}</div>
                  </div>
                </div>
              );
              if (!sys.href) return <li key={sys.n}>{body}</li>;
              return (
                <li key={sys.n}>
                  <Link to={sys.href} className="block hover:opacity-95" data-testid={`truck-service-map-system-${sys.n}`}>
                    {body}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="text-xs text-[#64748B]">
          System states and service history bind to live PM / WO / fault / compliance for {props.unitNumber}. Missing
          readings stay as —, never board samples.{" "}
          <Link
            to={`/maintenance/pm-schedule?unit_id=${encodeURIComponent(props.unitId)}`}
            className="font-semibold text-[#14314F] underline"
          >
            Open PM schedules →
          </Link>
        </p>
      </div>
    </BoardSection>
  );
}
