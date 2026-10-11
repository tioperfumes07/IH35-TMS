#!/usr/bin/env node
// Lead 443.53 #1 (owner 2026-10-11 09:23 CT: "We have google in our app, get the addresses from there and fix the engine to parse
// the warehouse name, street address so this does not occur anymore").
// RULE: a booked stop with a facility name and a city ends the resolver with a STREET (Google's top result in its city / state,
// name need not match) — or with the recorded Google "no result" marker. Nothing else.
//   static (always): pickPlaceForFacility takes the top result in the stop's city + state (or zip) with no name-match filter;
//                    the place step stores source 'google_place' and records Google's place_id on the audit row; the
//                    no-street marker is the v3 Google marker (so the sweep re-asks Google once for every older stop).
//   live (DATABASE_URL, read-only): USMCA stops with a facility name + city, no house-numbered street, already attempted, and NOT
//                    carrying the v3 marker are printed; --strict-live fails on them (they clear on the stop-resolution sweep
//                    that runs ~3 min after each boot).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOW_OFFLINE_SKIP = "the enforced rule is static (resolver acceptance + Google no-result marker); the live part only lists stops awaiting the sweep and touches no money";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/telematics/stops-geocode-backfill.service.ts";
const GOOGLE = "apps/backend/src/integrations/google/google-places-client.ts";
const MARKER = "no_street_source_v3_google";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const sources = { service: read(SERVICE), google: read(GOOGLE) };

export function audit({ service, google }) {
  const out = [];
  const fn = (service.match(/export function pickPlaceForFacility\([\s\S]*?\n}\n/) || [])[0] ?? "";
  if (!fn) out.push(`${SERVICE}: pickPlaceForFacility missing`);
  const pred = (fn.match(/results\.find\(([\s\S]*?)\);\n\s*if \(!r\) return null;/) || [])[1];
  if (!pred) out.push(`${SERVICE}: pickPlaceForFacility must take the TOP qualifying result (results.find(...))`);
  else {
    if (/normName\(|\.name\b/.test(pred)) out.push(`${SERVICE}: the acceptance predicate must not require the place name to match (owner 443.53)`);
    if (!/stop\.city/.test(pred) || !/stop\.state/.test(pred)) out.push(`${SERVICE}: the acceptance predicate must require the stop's city + state`);
    if (!/looksLikeStreet\(x\.address_line1\)/.test(pred)) out.push(`${SERVICE}: the accepted result must carry a street`);
  }
  if (!service.includes(`NO_STREET_SOURCE_TRIED = "${MARKER}"`)) out.push(`${SERVICE}: the no-street marker must be "${MARKER}" (the recorded Google no-result)`);
  if (!/source: "google_place"/.test(service)) out.push(`${SERVICE}: a street taken from Google must be stored as geocode_source 'google_place'`);
  if (!/google_place_id: place\.result\.place_id/.test(service)) out.push(`${SERVICE}: Google's place_id must be recorded on the audit row`);
  if (!/place_id\?: string;\s*provider\?:/.test(google) || !/places\.id/.test(google)) out.push(`${GOOGLE}: AddressResult must carry Google's place_id (Text Search field mask places.id)`);
  return out;
}

const fail = (lines) => { console.error("verify-booked-stop-street-or-google-no-result FAIL"); for (const l of lines) console.error(`  - ${l}`); process.exit(1); };
const failures = audit(sources);
if (failures.length) fail(failures);

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...sources, service: sources.service.replace("((eq(x.city, stop.city)", "(normName(x.name ?? \"\") === want && (eq(x.city, stop.city)") },
    { ...sources, service: sources.service.replace("(eq(x.city, stop.city) && eq(x.state, stop.state))", "true") },
    { ...sources, service: sources.service.replace(`"${MARKER}"`, '"no_street_source_v2"') },
    { ...sources, service: sources.service.replace('source: "google_place"', 'source: "geocoder_place"') },
    { ...sources, service: sources.service.replace("google_place_id: place.result.place_id", "google_place_id: null") },
    { ...sources, google: sources.google.replace("place_id?: string", "placeid?: string") },
  ];
  const escaped = mutations.filter((m) => audit(m).length === 0).length;
  if (escaped) fail([`${escaped} planted mutation(s) escaped`]);
  console.log(`verify-booked-stop-street-or-google-no-result SELFTEST PASS ${mutations.length}/${mutations.length}`);
}

if (process.env.DATABASE_URL) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000, statement_timeout: 30_000 });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const rows = (await client.query(
      `SELECT l.load_number, s.sequence_number, s.facility_name, s.city, s.state, s.geocode_source, s.geocode_failure_reason
         FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
        WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL AND l.status <> 'cancelled' AND s.soft_deleted_at IS NULL
          AND nullif(trim(s.facility_name), '') IS NOT NULL AND nullif(trim(s.city), '') IS NOT NULL
          AND coalesce(s.address_line1, '') !~ '^\\s*[0-9]+[A-Za-z]?\\s+\\S'
          AND s.geocode_attempted_at IS NOT NULL
          AND s.geocode_failure_reason IS DISTINCT FROM $2
        ORDER BY l.load_number, s.sequence_number`, [USMCA, MARKER])).rows;
    const listed = (await client.query(
      `SELECT count(*)::int n FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
        WHERE l.operating_company_id = $1::uuid AND l.status <> 'cancelled' AND s.soft_deleted_at IS NULL AND s.geocode_failure_reason = $2`,
      [USMCA, MARKER])).rows[0].n;
    await client.query("ROLLBACK");
    console.log(`verify-booked-stop-street-or-google-no-result LIVE: ${rows.length} USMCA stop(s) with a facility + city, no street and no Google no-result; ${listed} recorded Google no-result`);
    for (const r of rows.slice(0, 25)) console.log(`  ${r.load_number} #${r.sequence_number} ${r.facility_name} (${r.city}, ${r.state}) ${r.geocode_source ?? "-"} ${r.geocode_failure_reason ?? "-"}`);
    if (rows.length && process.argv.includes("--strict-live")) fail([`${rows.length} booked stop(s) have a facility + city, no street and no recorded Google no-result`]);
  } finally {
    await client.end();
  }
}

console.log("verify-booked-stop-street-or-google-no-result PASS — Google's top result in the stop's city / state, or the recorded Google no-result");
