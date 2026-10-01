/**
 * ROUND 304 (owner order, 2026-10-01) — ONE MEASURED DEFINITION OF THE LIVE FLEET.
 *
 * Owner, verbatim: "make sure we are only getting data from the trucks we have. We only have 14
 * GPS units, I believe, 122 and 124, or 120 and 122. Those do not have, I don't think they have
 * GPS."
 *
 * He was right about the count and right that two of 120/122/124 are dark. Measured live on
 * 2026-10-01 00:4x UTC against production, USMCA:
 *   43 unit rows attached to the company. 14 reporting GPS inside 24 h:
 *     T124 T148 T152 T156 T163 T164 T168 T170 T171 T173 T174 T175 T176 T177
 *   T120  0 pings/24 h, last GPS 2026-04-13, odometer 60,217
 *   T122  0 pings/24 h, last GPS 2026-09-26, odometer 927,437
 *   T124  543 pings/24 h — T124 DOES have GPS; 120 and 122 are the dark ones.
 *
 * WHY THIS FILE EXISTS. Two defects it replaces:
 *
 * 1. A HARDCODED FLEET SIZE. verify-assignment-coverage-excludes-test-units.mjs asserts
 *    `rows.length !== 16` against a STALE-LITERAL-OK comment. The real number of GPS-reporting
 *    trucks is 14. A literal cannot track a fleet that buys and sells trucks; every engine that
 *    needs "the fleet" must MEASURE it, and the measurement must be in exactly one place.
 *
 * 2. REAL TRUCKS MISCLASSIFIED AS TEST DATA. That same file freezes
 *    KNOWN_TEST_UNIT_NUMBERS = ["T120","T149","T150","T151","USMCA-001"] and calls them "coder
 *    test artifacts ... never real trucks". Measured against production, four of those five are
 *    real trucks that went dark:
 *      T149 odometer 547,039, GPS history to 2024-08-04
 *      T150 odometer 518,230, GPS history to 2024-11-06
 *      T151 odometer 467,351, GPS history to 2024-11-06
 *      T120 odometer  60,217, GPS history to 2026-04-13
 *    A coder fixture does not carry a six-figure odometer and two years of real GPS. Excluding
 *    them as "test" hides four of the owner's own trucks from every coverage report. USMCA-001
 *    (no samsara_vehicle_id, no GPS ever, no odometer ever) is the only one of the five that
 *    behaves like a placeholder.
 *
 * THE DISCRIMINATOR, and it is evidence, not a name: a unit is a REAL TRUCK if it has ever
 * produced telemetry — any GPS fix or any odometer reading. Whether it is reporting TODAY is a
 * separate question with a separate answer. Those two questions got conflated into a unit-number
 * allowlist, and an allowlist of names is exactly what the linkage law forbids for routing.
 *
 * NEVER classify by unit_number string matching. mdata.units.is_sample_data is the only
 * authority on sample rows, and telemetry history is the only authority on whether a truck is real.
 */

/** How recent a GPS fix must be for a unit to count as REPORTING. */
export const LIVE_FLEET_GPS_WINDOW_HOURS = 24;

/** Beyond this with no fix, a real truck is DARK and someone must look at the device. */
export const DARK_UNIT_ALERT_HOURS = 72;

export type FleetClass =
  /** Real truck, GPS inside the window. Counts toward the live fleet. */
  | "reporting"
  /** Real truck (has telemetry history) with no fix inside the window. Real, but not reporting. */
  | "dark"
  /** mdata.units.is_sample_data = true. Never real, never counted, never written to. */
  | "sample"
  /** No telemetry of any kind, ever. A roster placeholder, not a truck. */
  | "no_telemetry_ever";

export type FleetUnitFacts = {
  unitId: string;
  unitNumber: string;
  isSampleData: boolean;
  /** Most recent GPS fix, or null if there has never been one. */
  lastGpsAt: Date | null;
  /** Any odometer reading ever seen for this unit. Evidence the truck is real. */
  everHadOdometer: boolean;
};

export type ClassifiedUnit = FleetUnitFacts & {
  fleetClass: FleetClass;
  /** Plain-words reason. Never omitted — an unexplained classification is not reviewable. */
  reason: string;
  hoursSinceGps: number | null;
};

/**
 * Classify ONE unit from evidence. Pure: no DB, no clock reads beyond the `now` passed in, so the
 * guard can test every branch without a database.
 */
export function classifyFleetUnit(facts: FleetUnitFacts, now: Date): ClassifiedUnit {
  const hoursSinceGps =
    facts.lastGpsAt === null
      ? null
      : (now.getTime() - facts.lastGpsAt.getTime()) / 3_600_000;

  if (facts.isSampleData) {
    return {
      ...facts,
      fleetClass: "sample",
      hoursSinceGps,
      reason: "mdata.units.is_sample_data = true — sample row, excluded from every fleet figure",
    };
  }

  if (facts.lastGpsAt === null && !facts.everHadOdometer) {
    return {
      ...facts,
      fleetClass: "no_telemetry_ever",
      hoursSinceGps,
      reason:
        "no GPS fix and no odometer reading, ever — a roster placeholder, not a truck. Not counted, " +
        "and NOT called a test artifact: that is a classification only is_sample_data may make.",
    };
  }

  if (hoursSinceGps !== null && hoursSinceGps <= LIVE_FLEET_GPS_WINDOW_HOURS) {
    return {
      ...facts,
      fleetClass: "reporting",
      hoursSinceGps,
      reason: `GPS fix ${hoursSinceGps.toFixed(1)} h ago, inside the ${LIVE_FLEET_GPS_WINDOW_HOURS} h window`,
    };
  }

  return {
    ...facts,
    fleetClass: "dark",
    hoursSinceGps,
    reason:
      hoursSinceGps === null
        ? "has odometer history but no GPS fix on record — a real truck whose GPS has never reported"
        : `REAL TRUCK, GPS DARK for ${hoursSinceGps.toFixed(1)} h. It has telemetry history, so it is ` +
          `not test data and must never be filtered out as such — the device or the vehicle needs attention.`,
  };
}

/** The live fleet: real trucks reporting inside the window. This is the number engines use. */
export function liveFleet(units: ClassifiedUnit[]): ClassifiedUnit[] {
  return units.filter((u) => u.fleetClass === "reporting");
}

/** Real trucks that have gone quiet — the operational alert list, never silently dropped. */
export function darkUnits(units: ClassifiedUnit[]): ClassifiedUnit[] {
  return units.filter((u) => u.fleetClass === "dark");
}

/**
 * SQL for the facts above, for one operating company. Read-only. The caller sets the RLS bypass.
 * Deliberately returns FACTS, not a classification — the classification is the pure function
 * above so it is testable without a database.
 */
export function fleetUnitFactsSql(): string {
  return `
    SELECT
      u.id::text                                   AS unit_id,
      u.unit_number                                AS unit_number,
      coalesce(u.is_sample_data, false)            AS is_sample_data,
      (SELECT max(v.captured_at)
         FROM telematics.vehicle_locations v
        WHERE v.unit_id = u.id)                    AS last_gps_at,
      (EXISTS (SELECT 1 FROM telematics.vehicle_locations v
                WHERE v.unit_id = u.id AND v.odometer_mi IS NOT NULL)
       OR EXISTS (SELECT 1 FROM telematics.odometer_readings o
                WHERE o.unit_id = u.id))           AS ever_had_odometer
    FROM mdata.units u
    WHERE u.currently_leased_to_company_id = $1::uuid
       OR u.owner_company_id = $1::uuid
  `;
}
