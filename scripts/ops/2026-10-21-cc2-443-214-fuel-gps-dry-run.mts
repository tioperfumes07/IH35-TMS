/**
 * LEAD 443.214 (CC-2) — DRY RUN, READ-ONLY: every live USMCA fuel row → the truck at the pump by Samsara GPS and the load
 * that truck was running at the TRUE fill moment (the production rule loadAtTimeSql, imported, not re-typed).
 * True moment: Relay relay_created_at (+ station lat/lng) · statement imports' own transaction_at · WEX receipts adopted
 * by the statement → the WEX file's Tran Date + Tran Time (Central) · anything else is a settlement-typed DATE → HELD
 * fill_time_unknown (never matched against a placeholder time).
 * Truck: GPS within 0.3 mi (483 m) of the station coords, else GPS city+state = station city+state, ±20 min.
 *   1 candidate → it · several → the card unit only if it is among them · else HELD ambiguous (candidates listed) ·
 *   none → HELD no_gps_at_station.
 * Writes nothing. Output: ~/Downloads/10-21-2026-CC2-443214-FUEL-GPS-DRY-RUN.xlsx (+ .json beside it).
 * Run: node --env-file=$HOME/.ih35-gate.env node_modules/.bin/tsx scripts/ops/2026-10-21-cc2-443-214-fuel-gps-dry-run.mts [wex.csv]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import ExcelJS from "exceljs";
import { loadAtTimeSql } from "../../apps/backend/src/maintenance/driver-attribution.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const RADIUS_M = 483;
const WINDOW_MIN = 20;
const wexCsv = process.argv[2] ?? path.join(os.homedir(), "Downloads/TransactionReport-261021102759.csv");

type Wex = { at_local: string; city: string; state: string; unit: string };
function readWex(file: string): Map<string, Wex> {
  const out = new Map<string, Wex>();
  if (!fs.existsSync(file)) return out;
  const [head, ...rows] = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  const h = head!.split(",");
  const ix = (n: string) => h.indexOf(n);
  for (const r of rows) {
    const c = r.split(",");
    out.set(c[ix("Invoice")]!, { at_local: `${c[ix("Tran Date")]} ${c[ix("Tran Time")]}`, city: c[ix("City")]!.toUpperCase(), state: c[ix("State/ Prov")]!.toUpperCase(), unit: c[ix("Unit")]! });
  }
  return out;
}
/** "LOVES #787 TRAVEL STOP MOSHEIM, TN" → { city: "MOSHEIM", state: "TN" } (best effort; the last word(s) before ", ST"). */
function parseStation(city: string | null, state: string | null): { city: string | null; state: string | null } {
  if (!city) return { city: null, state };
  const m = city.toUpperCase().match(/(?:STOP|PLAZA|#\d+)?\s*([A-Z .'-]+?),\s*([A-Z]{2})$/);
  if (m) return { city: m[1]!.replace(/^.*TRAVEL STOP\s+/, "").trim(), state: m[2]! };
  return { city: city.toUpperCase().trim(), state: state?.toUpperCase() ?? null };
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
await c.query("SET LOCAL app.bypass_rls = 'lucia'");
const wex = readWex(wexCsv);
const rows = (await c.query(`
  SELECT f.id::text, f.transaction_reference AS ref, f.transaction_at, f.fuel_type::text, f.total_cost::text, f.source,
         f.location_city, f.location_state, f.unit_id::text AS card_unit_id, cu.unit_number AS card_unit,
         f.load_id::text AS cur_load_id, cl.load_number AS cur_load, f.notes,
         r.relay_created_at, r.location_latitude::float AS r_lat, r.location_longitude::float AS r_lng, r.location_city AS r_city, r.location_state AS r_state,
         r.location_name AS r_station
    FROM fuel.fuel_transactions f
    LEFT JOIN mdata.units cu ON cu.id = f.unit_id
    LEFT JOIN mdata.loads cl ON cl.id = f.load_id
    LEFT JOIN integrations.relay_fuel_transactions r ON r.id = f.relay_fuel_transaction_id
   WHERE f.operating_company_id = $1 AND f.voided_at IS NULL
   ORDER BY f.transaction_at, f.id`, [USMCA])).rows;

const out: Record<string, unknown>[] = [];
for (const f of rows) {
  const notes = String(f.notes ?? "");
  const wexInv = notes.match(/wex_inv(?:oice)?=(\d+)/)?.[1] ?? null;
  let moment: string | null = null, momentSource = "", sCity: string | null = null, sState: string | null = null, lat: number | null = null, lng: number | null = null, station = "";
  if (f.relay_created_at) { moment = new Date(f.relay_created_at).toISOString(); momentSource = "relay"; lat = f.r_lat; lng = f.r_lng; sCity = String(f.r_city ?? "").toUpperCase(); sState = String(f.r_state ?? "").toUpperCase(); station = f.r_station ?? ""; }
  else if (/443\.142 Dreamline statement|443\.202 England WEX statement/.test(notes)) { moment = new Date(f.transaction_at).toISOString(); momentSource = "statement_row"; ({ city: sCity, state: sState } = parseStation(f.location_city, f.location_state)); station = f.location_city ?? ""; }
  else if (wexInv && wex.has(wexInv)) {
    const w = wex.get(wexInv)!;
    moment = (await c.query<{ t: string }>(`SELECT ($1::timestamp AT TIME ZONE 'America/Chicago')::text AS t`, [w.at_local])).rows[0]!.t;
    momentSource = "wex_file"; sCity = w.city; sState = w.state; station = `${w.city}, ${w.state}`;
  } else { ({ city: sCity, state: sState } = parseStation(f.location_city, f.location_state)); station = f.location_city ?? ""; }

  const row: Record<string, unknown> = {
    fuel_id: f.id, ref: f.ref, wex_inv: wexInv, fuel_type: f.fuel_type, amount: f.total_cost, source: f.source,
    fill_ct: moment ? (await c.query<{ t: string }>(`SELECT to_char($1::timestamptz AT TIME ZONE 'America/Chicago','YYYY-MM-DD HH24:MI') AS t`, [moment])).rows[0]!.t : `${(await c.query<{ t: string }>(`SELECT to_char($1::timestamptz AT TIME ZONE 'America/Chicago','YYYY-MM-DD') AS t`, [f.transaction_at])).rows[0]!.t} (date only)`,
    moment_source: momentSource || "settlement_date_only", station, card_unit: f.card_unit, current_load: f.cur_load,
  };
  if (!moment) { Object.assign(row, { gps_unit: null, gps_candidates: null, engine_load: null, verdict: "HELD fill_time_unknown", change: "" }); out.push(row); continue; }

  const cand = (await c.query<{ unit_id: string; unit_number: string; dist_m: number | null; minutes_off: number }>(`
    SELECT v.unit_id::text, u.unit_number,
           min(CASE WHEN $4::float8 IS NULL THEN NULL ELSE 6371000 * 2 * asin(sqrt(power(sin(radians((v.lat::float8 - $4) / 2)), 2)
                + cos(radians($4)) * cos(radians(v.lat::float8)) * power(sin(radians((v.lng::float8 - $5) / 2)), 2))) END) AS dist_m,
           min(abs(extract(epoch FROM v.captured_at - $2::timestamptz)) / 60) AS minutes_off
      FROM telematics.vehicle_locations v JOIN mdata.units u ON u.id = v.unit_id
     WHERE v.operating_company_id = $1 AND v.captured_at BETWEEN $2::timestamptz - make_interval(mins => $3) AND $2::timestamptz + make_interval(mins => $3)
       AND (CASE WHEN $4::float8 IS NOT NULL
                 THEN 6371000 * 2 * asin(sqrt(power(sin(radians((v.lat::float8 - $4) / 2)), 2)
                      + cos(radians($4)) * cos(radians(v.lat::float8)) * power(sin(radians((v.lng::float8 - $5) / 2)), 2))) <= $6
                 ELSE upper(v.city) = $7 AND upper(v.state) = $8 END)
     GROUP BY 1, 2 ORDER BY minutes_off`, [USMCA, moment, WINDOW_MIN, lat, lng, RADIUS_M, sCity, sState])).rows;
  let truck: { unit_id: string; unit_number: string } | null = null, truckVerdict = "";
  if (cand.length === 1) { truck = cand[0]!; truckVerdict = "gps"; }
  else if (cand.length > 1) {
    const hit = cand.find((x) => x.unit_id === f.card_unit_id);
    if (hit) { truck = hit; truckVerdict = "gps_several_card_among"; } else truckVerdict = "HELD ambiguous";
  } else truckVerdict = "HELD no_gps_at_station";
  row.gps_unit = truck?.unit_number ?? null;
  row.gps_candidates = cand.map((x) => `${x.unit_number}${x.dist_m != null ? ` ${Math.round(x.dist_m)}m` : ""} ${Math.round(x.minutes_off)}min`).join("; ");
  row.card_vs_gps = truck ? (truck.unit_id === f.card_unit_id ? "same" : "DIFFERENT") : "";
  if (!truck) { Object.assign(row, { engine_load: null, verdict: truckVerdict, change: "" }); out.push(row); continue; }
  const l = (await c.query<{ load_number: string | null; load_id: string | null; pickup: string | null }>(`
    SELECT ll.load_number, ll.id::text AS load_id
      FROM (SELECT $2::uuid AS unit_id, $3::timestamptz AS at) x
      ${loadAtTimeSql("x.unit_id", "x.at", "lat")}
      LEFT JOIN mdata.loads ll ON ll.id = lat.load_id`, [USMCA, truck.unit_id, moment])).rows[0];
  row.engine_load = l?.load_number ?? null;
  row.verdict = !l?.load_id ? "HELD no_load_for_truck" : truckVerdict;
  row.change = l?.load_id && l.load_id !== f.cur_load_id ? `RE-POINT ${f.cur_load ?? "(none)"} → ${l.load_number}` : "";
  out.push(row);
}
await c.query("ROLLBACK");
await c.end();

const dir = path.join(os.homedir(), "Downloads");
const base = path.join(dir, "10-21-2026-CC2-443214-FUEL-GPS-DRY-RUN");
fs.writeFileSync(`${base}.json`, JSON.stringify(out, null, 1));
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("fuel vs GPS");
const cols = ["fill_ct", "moment_source", "station", "fuel_type", "amount", "ref", "wex_inv", "card_unit", "gps_unit", "card_vs_gps", "gps_candidates", "current_load", "engine_load", "verdict", "change", "source", "fuel_id"];
ws.columns = cols.map((k) => ({ header: k, key: k, width: Math.min(40, Math.max(10, k.length + 4)) }));
for (const r of out) ws.addRow(r);
ws.getRow(1).font = { bold: true };
await wb.xlsx.writeFile(`${base}.xlsx`);
const tally: Record<string, number> = {};
for (const r of out) { const k = `${r.moment_source} | ${String(r.verdict).split(" ")[0]}${r.change ? " | RE-POINT" : ""}`; tally[k] = (tally[k] ?? 0) + 1; }
console.log(JSON.stringify({ rows: out.length, tally, repoints: out.filter((r) => r.change).length, card_vs_gps_different: out.filter((r) => r.card_vs_gps === "DIFFERENT").length }, null, 1));
