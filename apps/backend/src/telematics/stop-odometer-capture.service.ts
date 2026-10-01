/**
 * ROUND 304 (owner order, 2026-10-01) — STOP ODOMETER CAPTURE.
 *
 * Owner, verbatim: "measure the second a truck stops for more than two, three minutes ... register
 * the mileage it has ... record the miles or odometer each time it stops for more than three to
 * five minutes. Build the engine fully and completely done, fully wired, linked to every single
 * truck, to every single geofence, triggering automatically."
 *
 * WHY STOP DETECTION AND NOT GEOFENCE-ONLY. Measured live 2026-10-01: all 604 fuel-stop geofences
 * are Love's. There is not one Pilot, Flying J, TA or Petro fence. The owner's drivers fuel at all
 * of them. A fence-only capture misses every non-Love's fuel stop. Stop detection catches a stop
 * anywhere — fenced or not — and the fence, when there is one, becomes an ATTRIBUTE of the stop
 * rather than the trigger for it.
 *
 * NO NEW FEED IS NEEDED. telematics.vehicle_locations already carries, per unit per fix:
 * captured_at, lat, lng, speed_mph, engine_state, odometer_mi, city, state. Measured over the last
 * 24 h on USMCA: 9,082 fixes, 15 units, speed_mph and engine_state 100 % populated, mean gap
 * 126.8 s. At a 3-minute threshold and a ~2-minute sample interval a real stop always spans at
 * least two fixes, so dwell is measurable rather than inferred.
 *
 * THE ODOMETER PROBLEM, STATED HONESTLY. odometer_mi is present on only 1,880 of those 9,082 fixes
 * — 21 %. Measured over the same window, 154 of 237 stops (65 %) contain at least one odometer
 * reading inside the stop itself. telematics.odometer_readings is NOT the denser alternative: it
 * held 12 rows in 24 h, one per unit, because it is CC-3's once-daily 03:00 CT snapshot.
 * So this engine takes the nearest reading WITHIN A TOLERANCE and records how stale it was, and
 * returns null with a stated reason past that. It NEVER interpolates between two readings to
 * invent an odometer for the stop. An invented odometer propagates into PM due dates, settlement
 * miles and the integrity score, and is indistinguishable from a real one after the fact.
 */

export const STOP_MIN_DWELL_MINUTES = 3;
/** Nearest-odometer tolerance. Past this the stop is recorded WITHOUT an odometer. */
export const STOP_ODOMETER_TOLERANCE_MINUTES = 45;
/** Fixes at or below this are "stopped". Not > 0, because GPS jitter reports fractional speed. */
export const STOPPED_SPEED_MPH = 1;

export type PositionFix = {
  capturedAt: Date;
  lat: number | null;
  lng: number | null;
  speedMph: number | null;
  engineState: string | null;
  odometerMi: number | null;
  city: string | null;
  state: string | null;
};

export type StopEvent = {
  unitId: string;
  startedAt: Date;
  endedAt: Date;
  dwellMinutes: number;
  sampleCount: number;
  lat: number | null;
  lng: number | null;
  city: string | null;
  state: string | null;
  /** Odometer at the stop, or null when nothing was within tolerance. NEVER interpolated. */
  odometerMi: number | null;
  odometerReadAt: Date | null;
  /** How stale the reading was, in minutes. 0 means it was inside the stop. */
  odometerAgeMinutes: number | null;
  /** Always populated. Names where the odometer came from, or why there is none. */
  odometerNote: string;
};

function isStopped(fix: PositionFix): boolean {
  if (fix.speedMph !== null) return fix.speedMph <= STOPPED_SPEED_MPH;
  // No speed: engine off is a stop; anything else is unknown and NOT assumed stopped.
  return fix.engineState === "off";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Detect every stop of at least STOP_MIN_DWELL_MINUTES for one unit.
 * `fixes` must be that unit's fixes in ascending captured_at order.
 * Pure — no DB, no clock. The guard exercises every branch offline.
 */
export function detectStops(unitId: string, fixes: PositionFix[]): StopEvent[] {
  const stops: StopEvent[] = [];
  let run: PositionFix[] = [];

  const flush = () => {
    if (run.length === 0) return;
    const startedAt = run[0].capturedAt;
    const endedAt = run[run.length - 1].capturedAt;
    const dwellMinutes = (endedAt.getTime() - startedAt.getTime()) / 60_000;
    if (dwellMinutes >= STOP_MIN_DWELL_MINUTES) {
      const odoInside = run.filter((f) => f.odometerMi !== null);
      // Median, not max: a single corrupt spike inside the stop must not become the reading.
      const odo = median(odoInside.map((f) => f.odometerMi as number));
      const named = run.find((f) => f.city !== null) ?? run[0];
      stops.push({
        unitId,
        startedAt,
        endedAt,
        dwellMinutes: Number(dwellMinutes.toFixed(1)),
        sampleCount: run.length,
        lat: median(run.filter((f) => f.lat !== null).map((f) => Number(f.lat))),
        lng: median(run.filter((f) => f.lng !== null).map((f) => Number(f.lng))),
        city: named.city,
        state: named.state,
        odometerMi: odo,
        odometerReadAt: odoInside.length > 0 ? odoInside[0].capturedAt : null,
        odometerAgeMinutes: odoInside.length > 0 ? 0 : null,
        odometerNote:
          odoInside.length > 0
            ? `odometer read inside the stop (${odoInside.length} of ${run.length} fixes carried one)`
            : "no odometer on any fix inside this stop — nearest-reading attachment required",
      });
    }
    run = [];
  };

  for (const fix of fixes) {
    if (isStopped(fix)) run.push(fix);
    else flush();
  }
  flush();
  return stops;
}

/**
 * Attach the nearest odometer to a stop that had none inside it. `candidates` are that unit's
 * fixes that DO carry an odometer. Returns the stop unchanged when nothing is within tolerance —
 * it does not guess, and it does not interpolate between the two nearest readings.
 */
export function attachNearestOdometer(stop: StopEvent, candidates: PositionFix[]): StopEvent {
  if (stop.odometerMi !== null) return stop;

  const anchor = stop.startedAt.getTime();
  let best: PositionFix | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    if (c.odometerMi === null) continue;
    const delta = Math.abs(c.capturedAt.getTime() - anchor);
    if (delta < bestDelta) {
      best = c;
      bestDelta = delta;
    }
  }

  const ageMin = bestDelta / 60_000;
  if (best === null || ageMin > STOP_ODOMETER_TOLERANCE_MINUTES) {
    return {
      ...stop,
      odometerMi: null,
      odometerReadAt: null,
      odometerAgeMinutes: null,
      odometerNote:
        best === null
          ? "no odometer reading exists for this unit — stop recorded without one"
          : `nearest odometer is ${ageMin.toFixed(0)} min away, past the ` +
            `${STOP_ODOMETER_TOLERANCE_MINUTES} min tolerance — stop recorded WITHOUT an odometer ` +
            `rather than with a stale one`,
    };
  }

  return {
    ...stop,
    odometerMi: best.odometerMi,
    odometerReadAt: best.capturedAt,
    odometerAgeMinutes: Number(ageMin.toFixed(1)),
    odometerNote: `nearest odometer, ${ageMin.toFixed(1)} min from the stop start, inside the ${STOP_ODOMETER_TOLERANCE_MINUTES} min tolerance`,
  };
}

export type StopWithMiles = StopEvent & {
  /** Miles since the previous stop that had an odometer. Null when either end is missing. */
  milesSincePreviousStop: number | null;
  milesNote: string;
};

/**
 * Miles between consecutive stops, from odometer deltas only. `stops` ascending by startedAt.
 * A gap at either end yields null and says so — never a distance derived from GPS points when the
 * odometer is missing, because the two are different measurements and mixing them silently is how
 * settlement miles stop being defensible.
 */
export function milesBetweenStops(stops: StopEvent[]): StopWithMiles[] {
  let lastOdo: number | null = null;
  return stops.map((s) => {
    if (s.odometerMi === null) {
      return { ...s, milesSincePreviousStop: null, milesNote: "this stop has no odometer" };
    }
    if (lastOdo === null) {
      lastOdo = s.odometerMi;
      return { ...s, milesSincePreviousStop: null, milesNote: "first stop with an odometer in the window" };
    }
    const delta = s.odometerMi - lastOdo;
    lastOdo = s.odometerMi;
    if (delta < 0) {
      return {
        ...s,
        milesSincePreviousStop: null,
        milesNote: `odometer went BACKWARDS by ${Math.abs(delta).toFixed(1)} mi — held, not reported. ` +
          `Either a corrupt reading or a unit/vehicle id mix-up, and both need a person.`,
      };
    }
    return {
      ...s,
      milesSincePreviousStop: Number(delta.toFixed(1)),
      milesNote: "odometer delta from the previous stop that carried a reading",
    };
  });
}

/** Fixes for one unit over a window, ascending. Read-only; caller sets the RLS bypass. */
export function unitFixesSql(): string {
  return `
    SELECT captured_at, lat, lng, speed_mph, engine_state, odometer_mi, city, state
      FROM telematics.vehicle_locations
     WHERE unit_id = $1::uuid
       AND captured_at >= $2::timestamptz
       AND captured_at <= $3::timestamptz
     ORDER BY captured_at ASC
  `;
}

/**
 * Which geofence, if any, contains a stop. The fence is an ATTRIBUTE of the stop, never its
 * trigger — a stop outside every fence is still a stop and is still recorded.
 * Uses the fence's own enter_radius_m, falling back to radius_m; measured live, all 604 Love's
 * carry radius_m = 200.
 */
export function geofenceForStopSql(): string {
  return `
    SELECT g.id::text AS geofence_id, g.label, g.location_kind,
           COALESCE(g.enter_radius_m, g.radius_m)::float8 AS radius_m,
           (6371000 * 2 * asin(sqrt(
              power(sin(radians($2::numeric - g.center_lat) / 2), 2) +
              cos(radians(g.center_lat)) * cos(radians($2::numeric)) *
              power(sin(radians($3::numeric - g.center_lng) / 2), 2)
           ))) AS metres_from_centre
      FROM geo.geofences g
     WHERE g.operating_company_id = $1::uuid
       AND g.is_active
       AND g.center_lat IS NOT NULL AND g.center_lng IS NOT NULL
     ORDER BY metres_from_centre ASC
     LIMIT 1
  `;
}
