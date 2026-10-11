#!/usr/bin/env node
// LEAD 443.74 (owner 2026-10-11 16:57 CT: "Probably the gps is source of truth or verification") — every pickup / delivery
// stop of a delivered USMCA load is GPS-VERIFIED (the truck dwelled within the fence radius), GPS-CORRECTED (the stop took the
// facility at the truck's dwell — geocode_source gps_dwell_*), or LISTED (no GPS for its day / no qualifying dwell / no point /
// the dwell resolved to no facility). A stop the truck demonstrably loaded or unloaded elsewhere, at a known facility, and
// that was never corrected FAILS. Counts are printed per class.
// One source of truth: this runs the engine itself (apps/backend/src/telematics/stop-gps-verification.service.ts) in MEASURE
// mode, read only, through its runner — the guard never re-implements the classification.
//   --selftest   classify fixtures through the engine's pure function (no DB)
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-stops-gps-verified";
export const REQUIRES_LIVE_DB = "live-only guard: runs the GPS stop verification engine read-only over USMCA loads; fails closed with no DATABASE_URL";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function judge(stops) {
  const by = (v) => stops.filter((s) => s.verdict === v);
  const corrected = stops.filter((s) => s.applied || s.verdict === "verified" && s.gps_corrected);
  const fails = by("disagrees").filter((s) => s.facility && s.confirmed && !s.applied);
  return {
    counts: { verified: by("verified").length, gps_corrected: corrected.length, disagrees_no_facility: by("disagrees").filter((s) => !s.facility).length, disagrees_unconfirmed: by("disagrees").filter((s) => s.facility && !s.confirmed).length,
      gps_elsewhere: by("gps_elsewhere").length, no_gps: by("no_gps").length, no_dwell: by("no_dwell").length, no_point: by("no_point").length, uncorrected: fails.length },
    fails: fails.map((s) => `load ${s.load} stop ${s.seq} (${s.type}): the truck dwelled ${s.km?.toFixed(1)} km away at ${s.facility} — not GPS-corrected`),
  };
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["all verified passes", [{ verdict: "verified" }], 0],
    ["a confirmed-facility disagreement not corrected fails", [{ verdict: "disagrees", facility: "X", confirmed: true, applied: false, km: 96, load: "1", seq: 1, type: "pickup" }], 1],
    ["an unconfirmed facility is listed, not failed", [{ verdict: "disagrees", facility: "X", confirmed: false, applied: false }], 0],
    ["a corrected disagreement passes", [{ verdict: "disagrees", facility: "X", applied: true }], 0],
    ["no facility resolved is listed, not failed", [{ verdict: "disagrees", facility: null }], 0],
    ["no GPS / no dwell / no point are listed", [{ verdict: "no_gps" }, { verdict: "no_dwell" }, { verdict: "no_point" }], 0],
  ];
  let bad = 0;
  for (const [n, stops, want] of cases) { const got = judge(stops).fails.length; if (got !== want) { bad++; console.error(`FAIL ${n}: ${got} != ${want}`); } }
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

if (!process.env.DATABASE_URL) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set (stops are rows — fails closed without a database)`);
  process.exit(1);
}
const env = { ...process.env };
for (const k of Object.keys(env)) if (/^SAMSARA_/.test(k)) delete env[k];
const run = spawnSync(process.execPath, ["--import", "tsx", path.join(ROOT, "scripts/ops/2026-10-11-cc2-443-74-stop-gps-verification.mts"), "--json"],
  { cwd: ROOT, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 900_000 });
const line = (run.stdout || "").split("\n").find((l) => l.startsWith("{"));
if (run.status !== 0 || !line) {
  console.error(`${LABEL}: FAIL — the engine did not run (exit ${run.status}): ${(run.stderr || "").split("\n").filter((l) => !/SSL|libpq|pg-connection|trace-warn|prepare for|current behavior|See https|uselibpqcompat|next major/.test(l)).slice(-3).join(" | ")}`);
  process.exit(1);
}
const out = JSON.parse(line);
const { counts, fails } = judge(out.stops);
console.log(`${LABEL}: ${out.loads} loads, ${out.stops.length} stops — verified ${counts.verified}, GPS-corrected ${counts.gps_corrected}, listed: truck elsewhere on the document's dates ${counts.gps_elsewhere}, no GPS ${counts.no_gps}, no dwell ${counts.no_dwell}, no point ${counts.no_point}, dwell with no facility ${counts.disagrees_no_facility}, facility unconfirmed ${counts.disagrees_unconfirmed}; uncorrected ${counts.uncorrected}`);
if (fails.length) {
  for (const f of fails.slice(0, 40)) console.error(`  ✗ ${f}`);
  console.error(`${LABEL}: FAIL — ${fails.length} stop(s) the truck demonstrably served elsewhere, at a known facility, not GPS-corrected`);
  process.exit(1);
}
console.log(`${LABEL}: PASS`);
