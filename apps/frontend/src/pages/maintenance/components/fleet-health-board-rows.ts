// Board 43 row rules — verbatim port of the renderVals script in
// docs/design/v3/maintenance-vehicle-graphics/Main.dc.html (25,000-mile PM, 400 mi/day, palette C, styleOf, day()).
// Live inputs only: a truck with no PM schedule / last-PM baseline is "none" — never a guessed position.
import type { FleetHealthRow } from "./fleet-health-source";

const PM = 25000;
const PER_DAY = 400;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (d: number) => {
  const t = new Date();
  t.setDate(t.getDate() + d);
  return `${MONTHS[t.getMonth()]} ${t.getDate()}`;
};
/** Board palette per state: [cab, highlight, road, status bg, status fg, status word]. */
const C = {
  ok: ["#1F8A4C", "#3FB070", "#2E9E5E", "#E3F4EA", "#14532D", "Healthy"],
  soon: ["#C76A0A", "#E9932F", "#D97B16", "#FDF0DC", "#7A3E04", "PM soon"],
  over: ["#C0262D", "#E24C52", "#C0262D", "#FBE3E4", "#7F1D1D", "PM overdue"],
  shop: ["#2456C7", "#4C7BE6", "#2F63D6", "#E2EAFB", "#1E3A8A", "In shop"],
  none: ["#5B6B7E", "#8496AA", "#5B6B7E", "#E6EAF0", "#1E293B", "Enter last PM"],
} as const;
export type K = keyof typeof C;
export type BoardRow = {
  id: string; unit: string; make: string; odo: string; loc: string; cab: string; road: string; stBg: string; stFg: string;
  status: string; body: "aero" | "classic" | "sloped"; moving: boolean; alert: boolean; aria: string; fillW: number;
  sinceLabel: string; leftLabel: string; leftColor: string; nextPm: string; k: K; pmHref: string;
};

const styleOf = (mk: string): BoardRow["body"] => (/389/.test(mk) ? "classic" : /VOLVO|CASCADIA/.test(mk) ? "sloped" : "aero");

export function toBoardRow(r: FleetHealthRow, link: (href: string) => string): BoardRow {
  const known = Boolean(r.pm_schedule_id && r.miles_left != null && !r.pm_baseline_absent && r.state !== "shop");
  const interval = r.pm_interval && r.pm_interval > 0 ? r.pm_interval : PM;
  const left = known ? Number(r.miles_left) : 0;
  const since = known ? interval - left : 0;
  const days = Math.round(left / PER_DAY);
  const k: K = r.state === "shop" ? "shop" : !known ? "none" : left < 0 ? "over" : days <= 14 ? "soon" : "ok";
  const c = C[k];
  const make = [r.make, r.model].filter(Boolean).join(" ").toUpperCase() || "MAKE / MODEL NOT ON FILE";
  const year = r.year != null ? String(r.year) : "year not on file";
  const loc = [r.telemetry_city, r.telemetry_state].filter(Boolean).join(" ") || r.formatted_location || "Location unavailable";
  return {
    id: r.unit_id, unit: r.unit_number, make,
    odo: (r.odometer_mi != null ? `${fmt(Number(r.odometer_mi))} mi · ` : "no odometer · ") + year,
    loc, cab: c[0], road: c[2], stBg: c[3], stFg: c[4], status: c[5], body: r.body_style ?? styleOf(make),
    moving: r.speed_mph != null && Number(r.speed_mph) > 3, alert: k === "over" || k === "soon" || k === "shop",
    aria: `${r.unit_number} ${make}, ${c[5]}`,
    fillW: known ? Math.max(8, Math.min(600, Math.round((since / interval) * 600))) : 0,
    sinceLabel: known ? `${fmt(since)} mi since PM` : "Last PM not entered",
    leftLabel: !known ? "" : left < 0 ? `${fmt(-left)} over` : `${fmt(left)} to go`,
    leftColor: !known ? "#5B6B7E" : left < 0 ? "#C0262D" : days <= 14 ? "#C76A0A" : "#1F8A4C",
    nextPm: !known ? "—" : left < 0 ? "Overdue" : dayLabel(days), k,
    pmHref: link(r.pm_schedule_id ? `/maintenance/pm-schedule?schedule_id=${encodeURIComponent(r.pm_schedule_id)}` : `/maintenance/pm-schedule?unit_id=${encodeURIComponent(r.unit_id)}&create=1`),
  };
}

