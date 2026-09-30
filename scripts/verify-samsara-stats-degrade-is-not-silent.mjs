#!/usr/bin/env node
/**
 * GUARD: the Samsara stats fetch may degrade, but it may never degrade SILENTLY.
 *
 * WHY (measured live 2026-09-30 on telematics.vehicle_locations, rows written by this exact path,
 * raw_samsara_event_id LIKE 'cron:stats:%'):
 *     2026-08-25   4,645 rows   4,510 with odometer
 *     2026-08-26     779 rows     733 with odometer
 *     [12-day gap -- the feed was down entirely]
 *     2026-09-10   1,900 rows         0 with odometer
 *     2026-09-11   4,121 rows         0 with odometer
 *     2026-09-12   3,628 rows         0 with odometer   ... and every day since
 *
 * fetchSamsaraStatsPage asks for "gps,engineStates,obdOdometerMeters,fuelPercents,obdEngineSeconds"
 * and, on a 400, retries with "gps,engineStates" -- which carries NO odometer. The fallback is
 * CORRECT and stays: it keeps the dispatch board's live location working on accounts that lack the
 * OBD stats. What was wrong is that it said nothing. The feed came back on the degraded set and
 * odometer has been null for 35 days, so driven miles could not be computed and company-settlement
 * MPG has had no honest input since August. Nothing was broken loudly enough to notice.
 *
 * THE RULE: a degraded pull is a NAMED, RECORDED condition. Never a column that turns to null.
 *
 * Usage:  node scripts/verify-samsara-stats-degrade-is-not-silent.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-samsara-stats-degrade-is-not-silent";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT = "apps/backend/src/integrations/samsara/samsara-client.ts";
const SERVICE = "apps/backend/src/integrations/samsara/samsara-positions.service.ts";

export function assertDegradeIsNotSilent({ client, service }) {
  const problems = [];

  if (!/export const SAMSARA_STATS_TYPES_PRIMARY\b/.test(client) || !/export const SAMSARA_STATS_TYPES_DEGRADED\b/.test(client)) {
    problems.push(`${CLIENT}: the stats types sets are no longer named constants, so no caller can tell which one it got.`);
  }

  // SAMSARA CAPS THIS ENDPOINT AT FOUR TYPES. Proven live 2026-09-30: five types ->
  // HTTP 400 "Vehicle stats are currently restricted to 4 types.". Asking for five is what
  // collapsed the fetch to gps,engineStates and cost 35 days of odometer.
  const primary = client.match(/export const SAMSARA_STATS_TYPES_PRIMARY = "([^"]+)"/);
  if (primary) {
    const count = primary[1].split(",").filter(Boolean).length;
    if (count > 4) {
      problems.push(
        `${CLIENT}: SAMSARA_STATS_TYPES_PRIMARY asks for ${count} types. Samsara refuses more than 4 outright ` +
          `("Vehicle stats are currently restricted to 4 types.") and the whole request fails -- which is exactly ` +
          `how odometer went missing for 35 days.`
      );
    }
    if (!primary[1].includes("obdOdometerMeters")) {
      problems.push(
        `${CLIENT}: obdOdometerMeters is not in the PRIMARY types set. Odometer must never be the type that gets ` +
          `traded away -- driven miles, MPG, PM countdowns and engine-hour services all depend on it.`
      );
    }
  }
  const fuel = client.match(/export const SAMSARA_STATS_TYPES_FUEL = "([^"]+)"/);
  if (fuel && fuel[1].split(",").filter(Boolean).length > 4) {
    problems.push(`${CLIENT}: SAMSARA_STATS_TYPES_FUEL asks for more than 4 types; Samsara refuses the whole request.`);
  }
  if (!fuel) {
    problems.push(`${CLIENT}: the separate fuel types set is gone. Fuel does not fit in the same four as odometer -- it needs its own call.`);
  }
  if (!/obdOdometerMeters/.test(client)) {
    problems.push(`${CLIENT}: obdOdometerMeters is no longer requested at all. That IS the odometer -- without it driven miles and MPG are impossible.`);
  }
  if (!/typesUsed/.test(client)) {
    problems.push(`${CLIENT}: fetchSamsaraStatsPage no longer reports typesUsed, so a fallback is invisible again.`);
  }
  if (!/async listVehicleStatsWithMeta\(/.test(client)) {
    problems.push(`${CLIENT}: listVehicleStatsWithMeta is gone -- callers are back to a bare array with no way to know the pull was degraded.`);
  }
  if (!/=== SAMSARA_STATS_TYPES_DEGRADED/.test(client)) {
    problems.push(`${CLIENT}: the degraded flag is no longer derived from the types set actually served.`);
  }

  if (!/listVehicleStatsWithMeta\(\)/.test(service)) {
    problems.push(`${SERVICE}: the positions sync no longer pulls stats WITH META, so it cannot know the pull carried no odometer.`);
  }
  if (!/statsDegraded/.test(service)) {
    problems.push(`${SERVICE}: the degraded pull is no longer tracked.`);
  }
  if (!/if \(statsDegraded\)[\s\S]{0,600}?writeSyncLog\(/.test(service)) {
    problems.push(
      `${SERVICE}: a degraded pull no longer writes a sync log. It must be RECORDED, not logged and forgotten -- ` +
        `35 days of missing odometer is what silence costs here.`
    );
  }
  if (!/if \(statsDegraded\)[\s\S]{0,600}?success: false/.test(service)) {
    problems.push(`${SERVICE}: a degraded pull is recorded as a SUCCESS. A pull that cannot carry odometer is not a healthy sync.`);
  }

  return problems;
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

if (process.argv.includes("--selftest")) {
  const failures = [];
  const live = { client: read(CLIENT), service: read(SERVICE) };
  const expect = (name, mutated, needle) => {
    const problems = assertDegradeIsNotSilent(mutated);
    if (!problems.some((p) => p.includes(needle))) failures.push(`${name}: planted defect NOT caught (got: ${problems.join(" | ") || "none"})`);
  };

  const now = assertDegradeIsNotSilent(live);
  if (now.length) failures.push(`live: ${now.join(" | ")}`);

  // 1. THE REAL REGRESSION -- the service goes back to the bare array and cannot see the degrade.
  expect("service-blind-again", { ...live, service: live.service.replace(/listVehicleStatsWithMeta\(\)/g, "listVehicleStats()") }, "no longer pulls stats WITH META");
  // 2. The degrade is detected but not recorded.
  // Detected but not RECORDED: the flag survives, the sync-log write does not.
  expect(
    "degrade-not-recorded",
    { ...live, service: live.service.replace(/if \(statsDegraded\) \{[\s\S]*?\n  \}\n\n/, "if (statsDegraded) {\n    void statsTypesUsed;\n  }\n\n") },
    "no longer writes a sync log"
  );
  // 3. The odometer type is dropped from the request outright.
  expect("odometer-type-dropped", { ...live, client: live.client.replace(/obdOdometerMeters/g, "x") }, "no longer requested at all");
  // 4. typesUsed stops being reported.
  expect("types-not-reported", { ...live, client: live.client.replace(/typesUsed/g, "zzz") }, "no longer reports typesUsed");
  // 5. The meta method is removed.
  expect("meta-method-removed", { ...live, client: live.client.replace("async listVehicleStatsWithMeta(", "async removedMeta(") }, "listVehicleStatsWithMeta is gone");
  // 6. The named constants disappear.
  expect("constants-removed", { ...live, client: live.client.replace("export const SAMSARA_STATS_TYPES_PRIMARY", "const SAMSARA_STATS_TYPES_PRIMARY") }, "no longer named constants");
  // 7. THE ORIGINAL DEFECT, verbatim: five types in one request.
  expect(
    "five-types-again",
    { ...live, client: live.client.replace(/export const SAMSARA_STATS_TYPES_PRIMARY = "[^"]+"/, 'export const SAMSARA_STATS_TYPES_PRIMARY = "gps,engineStates,obdOdometerMeters,fuelPercents,obdEngineSeconds"') },
    "restricted to 4 types"
  );
  // 8. Odometer traded out of the primary set.
  expect(
    "odometer-traded-away",
    { ...live, client: live.client.replace(/export const SAMSARA_STATS_TYPES_PRIMARY = "[^"]+"/, 'export const SAMSARA_STATS_TYPES_PRIMARY = "gps,engineStates,fuelPercents,obdEngineSeconds"') },
    "not in the PRIMARY types set"
  );
  // 9. The fuel set is deleted, so fuel silently disappears.
  expect("fuel-set-removed", { ...live, client: live.client.replace("export const SAMSARA_STATS_TYPES_FUEL", "const REMOVED_FUEL") }, "separate fuel types set is gone");

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED (${failures.length})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} selftest 9/9 OK`);
  }
} else {
  const problems = assertDegradeIsNotSilent({ client: read(CLIENT), service: read(SERVICE) });
  if (problems.length) {
    console.error(`${LABEL} FAILED (${problems.length})`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
