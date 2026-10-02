/**
 * ONE ARRIVAL DETECTOR — shared contract for the five arrival guards (CC-3 queue 6, E-09 retirement, 2026-10-02).
 *
 * A load-stop arrival is exactly one thing: the geofence detector's 'entered' event on the stop's own bound fence
 * (bindLoadToGeofences -> label load-<id>-stop-<seq>, centred on mdata.load_stops.latitude/longitude), stamped on
 * mdata.load_stops.actual_arrival_at in the same transaction, counted per poll as arrivals_triggered, and pushed to the
 * driver as "Arrived at stop?". The second, 250 ft per-fix detector that wrote dispatch.stop_arrivals (read by nothing)
 * is retired and must never come back.
 */
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

export const PATHS = {
  retired: "apps/backend/src/telematics/arrival-detection.service.ts",
  detector: "apps/backend/src/telematics/geofence-detector.service.ts",
  cron: "apps/backend/src/integrations/samsara/samsara-positions.service.ts",
  projector: "apps/backend/src/integrations/samsara/webhook-projectors/vehicle-projector.ts",
  binding: "apps/backend/src/dispatch/geofences/load-geofence-binding.service.ts",
};

export const read = (p) => readFileSync(p, "utf8");

/** No second detector: the retired file is gone, nothing inserts into dispatch.stop_arrivals, no 250 ft radius. */
export function checkNoSecondDetector({ retiredExists, backendSources }) {
  const problems = [];
  if (retiredExists) problems.push(`${PATHS.retired} is back — arrivals have ONE detector (the stop's fence).`);
  for (const [file, src] of Object.entries(backendSources)) {
    if (/INSERT\s+INTO\s+dispatch\.stop_arrivals/i.test(src)) problems.push(`${file}: INSERT INTO dispatch.stop_arrivals — the retired second arrival path.`);
    if (/\bARRIVAL_RADIUS_FEET\b|processArrivalDetectionsForGpsPoint/.test(src)) problems.push(`${file}: names the retired 250 ft detector.`);
  }
  return problems;
}

export function backendSourcesNaming(pattern) {
  let out = "";
  try {
    out = execFileSync("git", ["grep", "-l", "-E", pattern, "--", "apps/backend/src", ":!*.test.ts", ":!**/__tests__/**"], { encoding: "utf8" });
  } catch { /* git grep exits 1 on no match */ }
  return Object.fromEntries(out.trim().split("\n").filter(Boolean).map((f) => [f, read(f)]));
}

/** Both poll paths run the fence detector on every persisted point and count the stops it stamped. */
export function checkPollPathCountsFenceArrivals(cron) {
  const problems = [];
  const fenceCalls = (cron.match(/processGeofenceDetectionsForGpsPoint\(/g) ?? []).length;
  const counted = (cron.match(/\.stop_arrivals_stamped\b/g) ?? []).length;
  if (fenceCalls < 2) problems.push(`${PATHS.cron}: ${fenceCalls} fence-detector call(s); both poll paths (locations + stats) must run it.`);
  if (counted < 2) problems.push(`${PATHS.cron}: arrivals_triggered must count stop_arrivals_stamped on both poll paths (found ${counted}).`);
  if (/processArrivalDetectionsForGpsPoint|detectArrivalsForIngestedPoint/.test(cron)) problems.push(`${PATHS.cron}: still calls the retired 250 ft detector.`);
  return problems;
}

/** The fence stamp is tenant-scoped, never overwrites evidence, counts, and prompts the driver. */
export function checkFenceStampContract(detector) {
  const problems = [];
  // Arrival AND departure stamps both carry the tenant / own-truck predicates.
  for (const [needle, what] of [
    ["g.operating_company_id = $2::uuid", "fence tenant predicate"],
    ["l.operating_company_id = $2::uuid", "load tenant predicate"],
    ["AND l.assigned_unit_id = $3::uuid", "stamp only the truck's own load"],
  ]) {
    if (detector.split(needle).length - 1 < 2) problems.push(`${PATHS.detector}: ${what} must guard both the arrival and departure stamp (${needle}).`);
  }
  const need = [
    ["AND ls.actual_arrival_at IS NULL", "never overwrite arrival evidence"],
    ["g.label = 'load-' || l.id::text || '-stop-' || ls.sequence_number::text", "stop matched by its bound fence"],
    ["stopArrivalsStamped += 1", "arrival counted"],
    ["options.notifyDriver", "driver arrival prompt"],
  ];
  for (const [needle, what] of need) if (!detector.includes(needle)) problems.push(`${PATHS.detector}: missing ${what} (${needle}).`);
  return problems;
}

/** The webhook path prompts the driver from the same fence event (it used to call the retired detector for that). */
export function checkProjectorPromptsFromFence(projector) {
  const problems = [];
  if (/processArrivalDetectionsForGpsPoint/.test(projector)) problems.push(`${PATHS.projector}: still calls the retired 250 ft detector.`);
  if (!/processGeofenceDetectionsForGpsPoint\([\s\S]*?\},\s*\{[\s\S]*?notifyDriver:\s*notifyDriverWebPush/.test(projector)) {
    problems.push(`${PATHS.projector}: the fence detector call must pass notifyDriver: notifyDriverWebPush (the arrival prompt).`);
  }
  return problems;
}

/** A stop's fence is centred on the stop's OWN booked coordinate (0 of the live dispatch stops carry location_id). */
export function checkFenceUsesStopsOwnCoordinate(binding) {
  const problems = [];
  for (const needle of ["ls.latitude::double precision AS lat", "ls.longitude::double precision AS lng", "loadStopFenceLabel(loadId, stop.sequence)"]) {
    if (!binding.includes(needle)) problems.push(`${PATHS.binding}: missing ${needle} — the fence must sit on the stop's own coordinate.`);
  }
  return problems;
}

/** One transition per real entry: one evaluation per fence label, out-of-order fixes absorbed, binds serialised. */
export function checkNoDuplicateTransitions(detector, binding) {
  const problems = [];
  if (!/SELECT DISTINCT ON \(g\.label\)/.test(detector)) problems.push(`${PATHS.detector}: evaluate each fence LABEL once (duplicated stop fences wrote 2 transitions)`);
  if (!/occurred_at BETWEEN \$5::timestamptz - interval '5 minutes' AND \$5::timestamptz \+ interval '5 minutes'/.test(detector))
    problems.push(`${PATHS.detector}: an out-of-order fix must not write the same transition twice`);
  if (!/pg_advisory_xact_lock\(hashtext\(\$1 \|\| ':' \|\| \$2\)\)/.test(binding)) problems.push(`${PATHS.binding}: stop-fence binds must be serialised per company + label`);
  return problems;
}

export function report(label, problems, selftest) {
  if (selftest) {
    const { name, run } = selftest;
    const caught = run();
    if (caught.failed) { console.error(`${label} selftest FAIL — mutation survived: ${caught.failed}`); process.exit(1); }
    console.log(`${label} selftest: ${caught.count}/${caught.count} mutations caught (${name})`);
  }
  if (problems.length) { console.error(`${label}: FAIL\n  ${problems.join("\n  ")}`); process.exit(1); }
  console.log(`${label}: OK`);
}

/** Run each [name, mutatedSource] through check; every one must produce a problem. */
export function mutations(check, list) {
  for (const [name, src] of list) if (check(src).length === 0) return { failed: name, count: list.length };
  return { failed: null, count: list.length };
}

export { existsSync };
