/**
 * ROUND 8.4 / UI-F11125 — Truck service map (docs/design/v3/maintenance-vehicle-graphics/TruckProfile.dc.html).
 * Chrome + legend match the board. System cards bind to live PM / WO / fault / compliance only —
 * never the board's illustrative tread depths or sample mile windows.
 */
import { Link } from "react-router-dom";
import { BoardSection } from "../../../components/v3/BoardSection";

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
      name: "PM clock",
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
      const remain =
        miles == null
          ? "Miles remaining —"
          : miles < 0
            ? `${formatMiles(miles)} overdue`
            : `${formatMiles(miles)} to go`;
      systems.push({
        n: n++,
        name: `PM · ${label}`,
        detail: `${remain} · last at ${last}`,
        state: pmState(miles),
        href: `/maintenance/pm-schedule?unit_id=${encodeURIComponent(input.unitId)}`,
      });
    }
  }

  if (input.openWoTotal > 0 || input.activeFaultCount > 0) {
    const parts: string[] = [];
    if (input.openWoTotal > 0) parts.push(`${input.openWoTotal} open work order${input.openWoTotal === 1 ? "" : "s"}`);
    if (input.activeFaultCount > 0) {
      parts.push(`${input.activeFaultCount} active fault${input.activeFaultCount === 1 ? "" : "s"}`);
    }
    systems.push({
      n: n++,
      name: "Open defects",
      detail: parts.join(" · "),
      state: "defect",
      href: `/maintenance/work-orders?unit_id=${encodeURIComponent(input.unitId)}`,
    });
  }

  const dot = (input.compliance?.dot_inspection ?? null) as Record<string, unknown> | null;
  const nextDue = dot?.next_due == null || dot.next_due === "" ? null : String(dot.next_due);
  systems.push({
    n: n++,
    name: "Annual DOT · tractor",
    detail: nextDue ? `Next due ${nextDue}` : "No DOT inspection date on file",
    state: nextDue ? "ok" : "none",
    href: `/fleet/units/${encodeURIComponent(input.unitId)}#asset-compliance`,
  });

  return systems;
}

function TruckSideSilhouette({ systems }: { systems: TruckServiceMapSystem[] }) {
  // Numbered hotspots along a simple side-view tractor silhouette (design: "side view with numbered service points").
  const slots = [
    { x: 42, y: 38 },
    { x: 78, y: 28 },
    { x: 118, y: 36 },
    { x: 158, y: 30 },
    { x: 198, y: 40 },
    { x: 238, y: 34 },
    { x: 268, y: 48 },
    { x: 288, y: 62 },
  ];
  return (
    <svg
      viewBox="0 0 320 110"
      className="h-28 w-full max-w-md text-slate-700"
      role="img"
      aria-label="Unit side view with numbered service points"
      data-testid="truck-service-map-silhouette"
    >
      <rect x="8" y="48" width="170" height="36" rx="8" fill="currentColor" opacity="0.85" />
      <rect x="150" y="36" width="120" height="48" rx="6" fill="currentColor" opacity="0.7" />
      <rect x="20" y="40" width="48" height="22" rx="4" fill="#94a3b8" />
      <circle cx="48" cy="92" r="14" fill="#0f172a" />
      <circle cx="48" cy="92" r="6" fill="#cbd5e1" />
      <circle cx="120" cy="92" r="14" fill="#0f172a" />
      <circle cx="120" cy="92" r="6" fill="#cbd5e1" />
      <circle cx="220" cy="92" r="14" fill="#0f172a" />
      <circle cx="220" cy="92" r="6" fill="#cbd5e1" />
      <circle cx="260" cy="92" r="14" fill="#0f172a" />
      <circle cx="260" cy="92" r="6" fill="#cbd5e1" />
      {systems.slice(0, slots.length).map((sys, i) => {
        const slot = slots[i]!;
        return (
          <g key={sys.n}>
            <circle cx={slot.x} cy={slot.y} r="10" className="fill-white stroke-slate-800" strokeWidth="1.5" />
            <text
              x={slot.x}
              y={slot.y + 3.5}
              textAnchor="middle"
              className="fill-slate-900"
              style={{ fontSize: 10, fontWeight: 700 }}
            >
              {sys.n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function TruckServiceMap(props: {
  unitId: string;
  unitNumber: string;
  nextPmDue: Record<string, unknown>;
  openWoTotal: number;
  activeFaultCount: number;
  compliance?: Record<string, unknown> | null;
}) {
  const systems = buildTruckServiceMapSystems({
    unitId: props.unitId,
    nextPmDue: props.nextPmDue,
    openWoTotal: props.openWoTotal,
    activeFaultCount: props.activeFaultCount,
    compliance: props.compliance,
  });

  return (
    <BoardSection title="SERVICE MAP · SELECT A SYSTEM" testId="truck-service-map">
      <div className="space-y-3 px-3 py-3" data-testid="truck-service-map-body">
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

        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 rounded-sm border border-[#E8EDF2] bg-[#F6F9FB] p-3">
            <div className="mb-1 text-xs font-semibold text-[#0F1B2D]">{props.unitNumber}</div>
            <TruckSideSilhouette systems={systems} />
            <p className="mt-1 text-xs text-[#64748B]">
              Live PM, work orders, faults and DOT dates. Missing readings stay as —, never board samples.
            </p>
          </div>

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

        <div className="text-xs text-[#64748B]">
          <Link
            to={`/maintenance/pm-schedule?unit_id=${encodeURIComponent(props.unitId)}`}
            className="font-semibold text-[#14314F] underline"
          >
            Open {props.unitNumber} PM schedules →
          </Link>
        </div>
      </div>
    </BoardSection>
  );
}
