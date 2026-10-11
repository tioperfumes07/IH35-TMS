#!/usr/bin/env node
/**
 * verify-stops-resolve-samsara-no-zip-fence — ROUND 443.38 (owner 2026-10-11 00:30 CT), CC-2.
 *
 * A booked stop resolves: existing location with a street > the owner's Samsara address (street + its own geofence,
 * samsara_address_id) > the owner-file street > zip / city center with NO fence. Never a fence around a zip center;
 * never 'rooftop' without a street.
 *
 * STATIC — apps/backend/src/telematics/stops-geocode-backfill.service.ts:
 *   RULE 1 — the resolver calls matchSamsaraAddressForStop and ensureSamsaraAddressLocation (Samsara before any geocode).
 *   RULE 2 — unstamped coordinates are not a rooftop pin (hasPickerCoordinates requires a geocode_source).
 *   RULE 3 — the zip / city center branch stamps 'locality' with zip_center / city_center and draws no fence.
 * LIVE (read-only, USMCA) — rows created at/after CUTOFF (the fix; rows before it are corrected under AUTH-409):
 *   RULE 4 — no ACTIVE geo.geofences row hangs on an mdata.locations row with no street.
 *   RULE 5 — no load stop is geocode_precision 'rooftop' without a street (house-numbered address_line1).
 * STATIC (443.41):
 *   RULE 6 — book-load.service.ts: a historical_backfill booking enqueues no dispatch.load.dispatched (no packet, email or
 *            driver notice) and does not call autoCreateGeofencesForLoad.
 *   RULE 7 — auto-geofence.service.ts skips (never fences / never pushes to Samsara) a stop with no street address.
 * LIVE (443.41):
 *   RULE 8 — no ACTIVE auto_dispatch customer_site fence created at/after AUTO_FENCE_CUTOFF whose label has no street.
 * --selftest exercises every rule.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const REQUIRES_LIVE_DB = "zip-center fences and false rooftops are rows — fails closed without a database";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-stops-resolve-samsara-no-zip-fence";
const RESOLVER = "apps/backend/src/telematics/stops-geocode-backfill.service.ts";
const BOOK_LOAD = "apps/backend/src/dispatch/book-load.service.ts";
const AUTO_FENCE = "apps/backend/src/telematics/auto-geofence.service.ts";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
export const CUTOFF = "2026-10-11T06:30:00Z";
// RULE 8 counts fences drawn after the 443.41 fix is live; the ones before it are retired under AUTH-413.
export const AUTO_FENCE_CUTOFF = "2026-10-11T08:00:00Z";

export function staticFailures(src) {
  const out = [];
  if (!/matchSamsaraAddressForStop\(/.test(src) || !/ensureSamsaraAddressLocation\(/.test(src))
    out.push(`RULE 1 ${RESOLVER}: the resolver no longer tries the owner's Samsara address before geocoding`);
  const picker = src.match(/const hasPickerCoordinates\s*=\s*([^;]+);/);
  if (!picker || !/geocode_source/.test(picker[1]))
    out.push(`RULE 2 ${RESOLVER}: unstamped stop coordinates are treated as a rooftop pin again`);
  const zip = src.match(/\(d\) no street, no Samsara address[\s\S]*?\n {8}return;\n {6}\}/);
  if (!zip || !/geocode_precision='locality'/.test(zip[0]) || !/zip_center/.test(zip[0]) || /INSERT INTO geo\.geofences/.test(zip[0]))
    out.push(`RULE 3 ${RESOLVER}: the zip / city center branch is missing, mislabelled, or draws a fence`);
  return out;
}

export function sideEffectFailures(bookLoad, autoFence) {
  const out = [];
  if (!/if \(source === "historical_backfill"\) \{[\s\S]{0,600}dispatch\.historical_backfill_distribution_skipped[\s\S]{0,400}\} else await enqueueOutboxEvent\(\s*client,\s*"dispatch\.load\.dispatched"/.test(bookLoad))
    out.push(`RULE 6 ${BOOK_LOAD}: a historical_backfill booking dispatches the load (packet / email / driver notice) again`);
  if (!/if \(source !== "historical_backfill"\) \{\s*void autoCreateGeofencesForLoad\(/.test(bookLoad))
    out.push(`RULE 6 ${BOOK_LOAD}: a historical_backfill booking draws customer-site fences / pushes to Samsara again`);
  if (!/reason: "no_street_address"/.test(autoFence) || !/for \(const stop of stops\) \{\s*\/\/ 443\.38[\s\S]{0,400}address_line1/.test(autoFence))
    out.push(`RULE 7 ${AUTO_FENCE}: a stop with no street address can be fenced and pushed to Samsara`);
  return out;
}

export function liveFailures({ zipFences, falseRooftops, autoZipFences = [] }) {
  const out = [];
  for (const f of zipFences) out.push(`RULE 4 geofence ${f.id} (${f.label ?? "?"}) is active on location ${f.location_id} which has no street`);
  for (const f of autoZipFences) out.push(`RULE 8 customer-site fence ${f.id} (${f.label ?? "?"}) is active with no street (auto_dispatch, zip / city center)`);
  for (const s of falseRooftops) out.push(`RULE 5 stop ${s.id} on load ${s.load_number} is 'rooftop' with no street (address_line1 ${JSON.stringify(s.address_line1)})`);
  return out;
}

async function measure(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const zipFences = (await client.query(
      `SELECT g.id::text, g.label, g.location_ref_id::text AS location_id
         FROM geo.geofences g JOIN mdata.locations l ON l.id = g.location_ref_id
        WHERE g.operating_company_id = $1::uuid AND g.is_active AND g.created_at >= $2::timestamptz
          AND g.samsara_address_id IS NULL AND nullif(trim(l.address_line1), '') IS NULL`, [USMCA, CUTOFF])).rows;
    const falseRooftops = (await client.query(
      `SELECT s.id::text, l.load_number, s.address_line1
         FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
        WHERE l.operating_company_id = $1::uuid AND s.updated_at >= $2::timestamptz AND s.soft_deleted_at IS NULL
          AND lower(coalesce(s.geocode_precision,'')) = 'rooftop'
          AND coalesce(s.address_line1,'') !~ '^\\s*[0-9]+[A-Za-z]?\\s+\\S'`, [USMCA, CUTOFF])).rows;
    const autoZipFences = (await client.query(
      `SELECT id::text, label FROM geo.geofences
        WHERE operating_company_id = $1::uuid AND is_active AND source = 'auto_dispatch' AND location_kind = 'customer_site'
          AND created_at >= $2::timestamptz AND coalesce(label,'') !~ '^\\s*[0-9]+[A-Za-z]?\\s+\\S'`, [USMCA, AUTO_FENCE_CUTOFF])).rows;
    await client.query("ROLLBACK");
    return { zipFences, falseRooftops, autoZipFences };
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = readFileSync(resolve(ROOT, RESOLVER), "utf8");
  const bookLoad = readFileSync(resolve(ROOT, BOOK_LOAD), "utf8");
  const autoFence = readFileSync(resolve(ROOT, AUTO_FENCE), "utf8");
  if (process.argv.includes("--selftest")) {
    const cases = [
      ["the shipped resolver passes", staticFailures(src).length === 0],
      ["a resolver without the Samsara step fails", staticFailures(src.replace(/matchSamsaraAddressForStop\(/g, "x(")).some((x) => x.startsWith("RULE 1"))],
      ["unstamped coordinates as rooftop fails", staticFailures(src.replace(/const hasPickerCoordinates\s*=\s*[^;]+;/, "const hasPickerCoordinates = stop.latitude != null;")).some((x) => x.startsWith("RULE 2"))],
      ["a fence in the zip branch fails", staticFailures(src.replace("geocode_precision='locality', geocode_attempted_at=now(),", "geocode_precision='locality' /* INSERT INTO geo.geofences */, geocode_attempted_at=now(),")).some((x) => x.startsWith("RULE 3"))],
      ["the shipped booking + auto-fence pass", sideEffectFailures(bookLoad, autoFence).length === 0],
      ["a backfill booking that dispatches fails", sideEffectFailures(bookLoad.replace("dispatch.historical_backfill_distribution_skipped", "x"), autoFence).some((x) => x.startsWith("RULE 6"))],
      ["an unconditional auto-fence hook fails", sideEffectFailures(bookLoad.replace('if (source !== "historical_backfill") {', "{"), autoFence).some((x) => x.startsWith("RULE 6"))],
      ["an auto-fence without the street check fails", sideEffectFailures(bookLoad, autoFence.replace('reason: "no_street_address"', 'reason: "x"')).some((x) => x.startsWith("RULE 7"))],
      ["an active zip-center customer-site fence fails", liveFailures({ zipFences: [], falseRooftops: [], autoZipFences: [{ id: "g", label: "Laredo, TX, US" }] }).some((x) => x.startsWith("RULE 8"))],
      ["live clean passes", liveFailures({ zipFences: [], falseRooftops: [] }).length === 0],
      ["a zip-center fence fails", liveFailures({ zipFences: [{ id: "g", label: "Laredo", location_id: "l" }], falseRooftops: [] }).some((x) => x.startsWith("RULE 4"))],
      ["a false rooftop fails", liveFailures({ zipFences: [], falseRooftops: [{ id: "s", load_number: "1", address_line1: null }] }).some((x) => x.startsWith("RULE 5"))],
    ];
    for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, pass]) => !pass).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const failures = [...staticFailures(src), ...sideEffectFailures(bookLoad, autoFence)];
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`${LABEL}: FAIL — DATABASE_URL not set (${REQUIRES_LIVE_DB})`);
    process.exit(1);
  }
  failures.push(...liveFailures(await measure(url)));
  if (failures.length) {
    console.error(`${LABEL}: FAIL\n` + failures.map((f) => `  ${f}`).join("\n"));
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — Samsara before geocode; no false rooftop, no zip-center fence since ${CUTOFF}`);
}
