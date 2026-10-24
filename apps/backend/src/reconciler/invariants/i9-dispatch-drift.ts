import { canonicalActiveLoadWhereClause } from "../../dispatch/canonical-active-load-set.js";
import type { Invariant, Queryable, ReconcilerException } from "../types.js";

/**
 * LEAD 443.327 — DISPATCH DRIFT (owner 10-24 2:43 PM CT): "a pop up message should appear in dispatch, accounting,
 * anywhere in the app every 30 minutes if there is a drift … like the Infante issue where he was assigned to a load going
 * to New Jersey, but he was in Colorado … also if there is no address or no amount etc every 20-30 minutes until it is
 * updated." Measured that day: T177 (Jorge Luis Infante Corona) in transit on 13690 Fort Morgan CO -> Laredo TX while
 * 13693 Laredo -> Edison NJ was assigned to him with no pickup or delivery date — no distance rule can judge a stop
 * that has no time, so a missing date is itself drift.
 *
 * Four breaches on every load in the canonical active set (imported, never restated):
 *   truck_cannot_make_next_stop  the unit's live Samsara position (integrations.samsara_vehicle_positions, fresh < 3 h)
 *                                is > 75 mi (great circle) from the next stop not yet arrived, and either that stop's
 *                                appointment has passed or reaching it needs > 600 mi per 24 h (a legal solo day is ~550)
 *   stop_no_date                 a stop not yet arrived with no appointment and no scheduled time
 *   stop_no_street_address       a stop whose address has no street number or that geocoded only to a city centre
 *   load_no_amount               no active charge line, or active charge lines summing to $0.00
 * Read-only. No repair engine: the dispatcher fixes the load; the breach clears on the next run.
 */
const INVARIANT_ID = "I9";
const OWNER_SEAT = "CC-3";
const FAR_MILES = 75;
const MAX_MILES_PER_DAY = 600;
const FRESH_HOURS = 3;

export type I9Field = "truck_cannot_make_next_stop" | "stop_no_date" | "stop_no_street_address" | "load_no_amount";

type Row = {
  load_id: string;
  load_number: string;
  load_created_at: string;
  unit_number: string | null;
  charge_cents: string | null;
  active_charges: string;
  next_stop_label: string | null;
  next_stop_due_at: string | null;
  miles_to_next_stop: string | null;
  position_at: string | null;
  undated_stops: string | null;
  streetless_stops: string | null;
};

export const I9_SQL = `
  WITH live AS (
    SELECT l.id, l.load_number, l.created_at, l.assigned_unit_id
      FROM mdata.loads l
     WHERE l.operating_company_id = $1::uuid
       AND l.soft_deleted_at IS NULL
       AND l.is_sample_data IS NOT TRUE
       AND ${canonicalActiveLoadWhereClause("l")}
  )
  SELECT lv.id::text AS load_id,
         lv.load_number,
         lv.created_at::text AS load_created_at,
         u.unit_number,
         ch.cents::text AS charge_cents,
         ch.n::text AS active_charges,
         ns.label AS next_stop_label,
         ns.due_at::text AS next_stop_due_at,
         CASE WHEN p.lat IS NOT NULL AND ns.latitude IS NOT NULL THEN
           round((3958.8 * 2 * asin(sqrt(
             power(sin(radians(ns.latitude - p.lat) / 2), 2) +
             cos(radians(p.lat)) * cos(radians(ns.latitude)) * power(sin(radians(ns.longitude - p.lng) / 2), 2))))::numeric, 1)::text
         END AS miles_to_next_stop,
         p.recorded_at::text AS position_at,
         nd.labels AS undated_stops,
         na.labels AS streetless_stops
    FROM live lv
    LEFT JOIN mdata.units u ON u.id = lv.assigned_unit_id
    LEFT JOIN LATERAL (
      SELECT count(*) AS n, coalesce(sum(c.amount_cents), 0) AS cents
        FROM dispatch.load_charge_lines c
       WHERE c.load_id = lv.id AND c.operating_company_id = $1::uuid AND c.is_active = true
    ) ch ON true
    LEFT JOIN LATERAL (
      SELECT s.latitude::double precision AS latitude, s.longitude::double precision AS longitude,
             coalesce(s.appointment_start_at, s.scheduled_arrival_at) AS due_at,
             initcap(s.stop_type::text) || ' ' || coalesce(nullif(btrim(s.city), ''), '?') || ', ' || coalesce(s.state, '?') AS label
        FROM mdata.load_stops s
       WHERE s.load_id = lv.id AND s.soft_deleted_at IS NULL AND s.actual_arrival_at IS NULL
       ORDER BY s.sequence_number
       LIMIT 1
    ) ns ON true
    LEFT JOIN LATERAL (
      SELECT vp.lat::double precision AS lat, vp.lng::double precision AS lng, vp.recorded_at
        FROM integrations.samsara_vehicle_positions vp
       WHERE vp.unit_uuid = lv.assigned_unit_id
         AND vp.operating_company_id = $1::uuid
         AND vp.recorded_at > now() - interval '${FRESH_HOURS} hours'
       ORDER BY vp.recorded_at DESC
       LIMIT 1
    ) p ON true
    LEFT JOIN LATERAL (
      SELECT string_agg(initcap(s.stop_type::text) || ' ' || coalesce(nullif(btrim(s.city), ''), '?'), '; ' ORDER BY s.sequence_number) AS labels
        FROM mdata.load_stops s
       WHERE s.load_id = lv.id AND s.soft_deleted_at IS NULL AND s.actual_arrival_at IS NULL
         AND s.appointment_start_at IS NULL AND s.scheduled_arrival_at IS NULL
    ) nd ON true
    LEFT JOIN LATERAL (
      SELECT string_agg(initcap(s.stop_type::text) || ' ' || coalesce(nullif(btrim(s.city), ''), '?'), '; ' ORDER BY s.sequence_number) AS labels
        FROM mdata.load_stops s
       WHERE s.load_id = lv.id AND s.soft_deleted_at IS NULL
         AND (s.address_line1 IS NULL OR s.address_line1 !~ '^\\s*[0-9]+[A-Za-z]?\\s+\\S'
              OR s.geocode_precision = 'locality')
    ) na ON true
   ORDER BY lv.load_number
`;

function cannotMake(row: Row, nowMs: number): { miles: number; perDay: number | null } | null {
  if (row.miles_to_next_stop == null || row.next_stop_due_at == null) return null;
  const miles = Number(row.miles_to_next_stop);
  if (!(miles > FAR_MILES)) return null;
  const hoursLeft = (Date.parse(row.next_stop_due_at) - nowMs) / 3_600_000;
  if (hoursLeft <= 0) return { miles, perDay: null };
  const perDay = (miles / hoursLeft) * 24;
  return perDay > MAX_MILES_PER_DAY ? { miles, perDay } : null;
}

function dueLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "2-digit", day: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" });
  return ` (due ${date} ${time} CT)`;
}

function exception(row: Row, field: I9Field, reason: string, since: string, sinceSource: string, amountCents?: number): ReconcilerException {
  return {
    key: `${INVARIANT_ID}/load/${row.load_id}/${field}`,
    invariant: INVARIANT_ID,
    entity_type: "load",
    entity_id: row.load_id,
    entity_label: row.load_number,
    field,
    reason,
    since,
    since_source: sinceSource,
    owner_seat: OWNER_SEAT,
    repair_engine: null,
    ...(amountCents !== undefined ? { amount_cents: amountCents, amount_source: "dispatch.load_charge_lines (active)" } : {}),
  };
}

export function i9ExceptionsForRow(row: Row, nowMs: number = Date.now()): ReconcilerException[] {
  const out: ReconcilerException[] = [];
  const far = cannotMake(row, nowMs);
  if (far) {
    const truck = row.unit_number ?? "The truck";
    out.push(exception(row, "truck_cannot_make_next_stop",
      far.perDay == null
        ? `${truck} is ${Math.round(far.miles).toLocaleString("en-US")} miles from ${row.next_stop_label}${dueLabel(row.next_stop_due_at)} and that appointment has passed — check the assignment or the stop times.`
        : `${truck} is ${Math.round(far.miles).toLocaleString("en-US")} miles from ${row.next_stop_label}${dueLabel(row.next_stop_due_at)}; making it needs ${Math.round(far.perDay).toLocaleString("en-US")} miles a day — check the assignment.`,
      row.position_at ?? row.load_created_at, "integrations.samsara_vehicle_positions.recorded_at"));
  }
  if (row.undated_stops) {
    out.push(exception(row, "stop_no_date", `No appointment date or time on: ${row.undated_stops}.`, row.load_created_at, "mdata.loads.created_at"));
  }
  if (row.streetless_stops) {
    out.push(exception(row, "stop_no_street_address", `No street address on: ${row.streetless_stops}.`, row.load_created_at, "mdata.loads.created_at"));
  }
  if (Number(row.active_charges ?? 0) === 0 || Number(row.charge_cents ?? 0) === 0) {
    out.push(exception(row, "load_no_amount", "The load has no rate — no active charge, or the charges total $0.00.", row.load_created_at, "mdata.loads.created_at", Number(row.charge_cents ?? 0)));
  }
  return out;
}

export const i9DispatchDrift: Invariant = {
  id: INVARIANT_ID,
  title: "A dispatched load can be reached in time and carries dates, street addresses and a rate",
  ownerSeat: OWNER_SEAT,
  repairEngine: null,
  async detect(client: Queryable, operatingCompanyId: string) {
    const res = await client.query<Row>(I9_SQL, [operatingCompanyId]);
    const now = Date.now();
    return res.rows.flatMap((r) => i9ExceptionsForRow(r, now));
  },
};
