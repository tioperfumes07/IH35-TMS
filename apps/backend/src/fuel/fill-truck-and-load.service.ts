import { appendCrudAudit } from "../audit/crud-audit.js";
import { resolveFuelLoadAtTime } from "./fuel-load-at-time.js";
import { carryFuelReceiptToLoad } from "./fuel-receipt-repoint.service.js";
import { applyReclassifyOnClient, moveExpenseFamilyToLoad, moveFuelReceiptDocumentToLoad } from "../accounting/reclassify/reclassify.service.js";

/**
 * LEAD 443.214 — FUEL FOLLOWS THE TRUCK AT THE PUMP. The ONE helper that decides, for a fuel fill, WHICH TRUCK was at the
 * pump and WHICH LOAD that truck was running (owner 10-21: "all wex transactions should be linked to a load, use samsara
 * locations, geofences, etc. ... check dates, and time should be in the reports").
 *
 * 1. MOMENT — the provider's real pump time: fuel_transactions.fill_moment_at (stamped by the statement engine on import /
 *    adoption), else the Relay transaction's relay_created_at, else a statement-imported row's own transaction_at. A
 *    settlement-typed row has only a DATE (07:00 CT placeholder) → time_unknown, HELD — never matched on a placeholder.
 * 2. STATION — coordinates: the row's station_lat/lng, else the Relay record's location, else the Love's store dictionary
 *    (every Love's store Relay has ever reported, by store number); without coordinates, the station's city + state.
 * 3. TRUCK — the unit Samsara put within 0.3 mi (city + state without coordinates) of the station within ±20 min. One
 *    candidate → it. Several → the card's unit only when it is one of them. Otherwise HELD with the candidates (never
 *    guessed). The card's unit label is a hint: when GPS disagrees, GPS wins and both are recorded.
 * 4. LOAD — THE one fuel-to-load rule (resolveFuelLoadAtTime) for that truck at that moment: the load it was running,
 *    else the NEXT load it runs (an empty move belongs to the trip it drives to), else HELD no_load.
 * Every move goes through carryFuelReceiptToLoad (the reclassify engine: fuel rows + expense document + GL load, audited,
 * amounts and accounts unchanged).
 */
export const FILL_GPS_RADIUS_M = 483;
export const FILL_GPS_WINDOW_MIN = 20;

type DbClient = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> };

export type FillFacts = {
  id: string;
  relay_id: string | null;
  card_unit_id: string | null;
  card_unit: string | null;
  driver_id: string | null;
  load_id: string | null;
  load_number: string | null;
  moment: string | null;
  moment_source: string | null;
  station_lat: number | null;
  station_lng: number | null;
  city: string | null;
  state: string | null;
  store_no: string | null;
  station: string;
};

export type GpsCandidate = { unit_id: string; unit_number: string; distance_m: number | null; minutes_off: number };

export type FillResolution = FillFacts & {
  truck_unit_id: string | null;
  truck_unit: string | null;
  truck_resolution: string;
  candidates: GpsCandidate[];
  engine_load_id: string | null;
  engine_load_number: string | null;
  load_resolution: string;
};

const STATEMENT_MARKERS = /443\.142 Dreamline statement|443\.202 England WEX statement/;

/** Pure: "LOVES #787 TRAVEL STOP MOSHEIM, TN" → store 787, city MOSHEIM, state TN. */
export function parseStationText(text: string | null, state: string | null): { store_no: string | null; city: string | null; state: string | null } {
  if (!text) return { store_no: null, city: null, state: state?.toUpperCase() ?? null };
  const up = text.toUpperCase();
  const store = up.match(/#\s*(\d{2,5})\b/)?.[1] ?? null;
  const m = up.match(/([A-Z][A-Z .'-]*?),\s*([A-Z]{2})\s*$/);
  if (m) {
    const city = m[1]!.replace(/^.*?(TRAVEL STOP|TRAVEL CENTER|TRUCK STOP|TRAVEL PLAZA)\s+/, "").trim();
    return { store_no: store, city, state: m[2]! };
  }
  return { store_no: store, city: up.replace(/^.*?#\s*\d+\s*/, "").trim() || up.trim(), state: state?.toUpperCase() ?? null };
}

/** Pure: pick the truck from the GPS candidates. */
export function pickFillTruck(candidates: GpsCandidate[], cardUnitId: string | null): { unit: GpsCandidate | null; resolution: string } {
  if (candidates.length === 1) return { unit: candidates[0]!, resolution: "gps" };
  if (candidates.length > 1) {
    const card = candidates.find((c) => c.unit_id === cardUnitId);
    return card ? { unit: card, resolution: "gps_card_among" } : { unit: null, resolution: "held_ambiguous" };
  }
  return { unit: null, resolution: "held_no_gps_at_station" };
}

export async function loadFillFacts(client: DbClient, companyId: string, fuelId: string): Promise<FillFacts | null> {
  const r = (await client.query<{
    id: string; relay_id: string | null; card_unit_id: string | null; card_unit: string | null; driver_id: string | null;
    load_id: string | null; load_number: string | null; transaction_at: string; notes: string | null; fill_moment_at: string | null;
    fill_moment_source: string | null; station_lat: string | null; station_lng: string | null; location_city: string | null;
    location_state: string | null; relay_created_at: string | null; r_lat: string | null; r_lng: string | null; r_city: string | null;
    r_state: string | null; r_store: string | null; r_name: string | null;
  }>(
    `SELECT f.id::text, f.relay_fuel_transaction_id::text AS relay_id, COALESCE(f.card_unit_id, f.unit_id)::text AS card_unit_id,
            cu.unit_number AS card_unit, f.driver_id::text, f.load_id::text, l.load_number::text, f.transaction_at::text, f.notes,
            f.fill_moment_at::text, f.fill_moment_source, f.station_lat::text, f.station_lng::text, f.location_city, f.location_state,
            r.relay_created_at::text, r.location_latitude::text AS r_lat, r.location_longitude::text AS r_lng,
            r.location_city AS r_city, r.location_state AS r_state, r.location_fuel_merchant_location_id AS r_store, r.location_name AS r_name
       FROM fuel.fuel_transactions f
       LEFT JOIN mdata.units cu ON cu.id = COALESCE(f.card_unit_id, f.unit_id)
        AND COALESCE(cu.currently_leased_to_company_id, cu.owner_company_id) = f.operating_company_id
       LEFT JOIN mdata.loads l ON l.id = f.load_id AND l.operating_company_id = f.operating_company_id
       LEFT JOIN integrations.relay_fuel_transactions r ON r.id = f.relay_fuel_transaction_id
      WHERE f.id = $2::uuid AND f.operating_company_id = $1::uuid`,
    [companyId, fuelId]
  )).rows[0];
  if (!r) return null;
  const parsed = parseStationText(r.location_city, r.location_state);
  let moment: string | null = r.fill_moment_at;
  let source: string | null = r.fill_moment_at ? r.fill_moment_source : null;
  if (!moment && r.relay_created_at) { moment = r.relay_created_at; source = "relay"; }
  if (!moment && STATEMENT_MARKERS.test(r.notes ?? "")) { moment = r.transaction_at; source = "statement_row"; }
  let lat = r.station_lat != null ? Number(r.station_lat) : r.r_lat != null ? Number(r.r_lat) : null;
  let lng = r.station_lng != null ? Number(r.station_lng) : r.r_lng != null ? Number(r.r_lng) : null;
  const store = r.r_store ?? parsed.store_no;
  if (lat == null && store) {
    const s = (await client.query<{ lat: string | null; lng: string | null }>(
      `SELECT avg(location_latitude)::text AS lat, avg(location_longitude)::text AS lng
         FROM integrations.relay_fuel_transactions
        WHERE location_fuel_merchant_location_id = $1 AND upper(merchant_name) LIKE 'LOVE%' AND location_latitude IS NOT NULL`,
      [store]
    )).rows[0];
    if (s?.lat != null && s.lng != null && /LOVE/i.test(`${r.location_city ?? ""} ${r.r_name ?? ""}`)) { lat = Number(s.lat); lng = Number(s.lng); }
  }
  return {
    id: r.id, relay_id: r.relay_id, card_unit_id: r.card_unit_id, card_unit: r.card_unit, driver_id: r.driver_id,
    load_id: r.load_id, load_number: r.load_number, moment, moment_source: source, station_lat: lat, station_lng: lng,
    city: (r.r_city ?? parsed.city)?.toUpperCase() ?? null, state: (r.r_state ?? parsed.state)?.toUpperCase() ?? null,
    store_no: store, station: r.r_name ?? r.location_city ?? "",
  };
}

export async function gpsTrucksAtStation(
  client: DbClient,
  input: { companyId: string; at: string; lat: number | null; lng: number | null; city: string | null; state: string | null }
): Promise<GpsCandidate[]> {
  if (input.lat == null && !(input.city && input.state)) return [];
  const dist = `6371000 * 2 * asin(sqrt(power(sin(radians((v.lat::float8 - $4::float8) / 2)), 2)
                 + cos(radians($4::float8)) * cos(radians(v.lat::float8)) * power(sin(radians((v.lng::float8 - $5::float8) / 2)), 2)))`;
  return (await client.query<GpsCandidate>(
    `SELECT v.unit_id::text, u.unit_number,
            CASE WHEN $4::float8 IS NULL THEN NULL ELSE round(min(${dist}))::int END AS distance_m,
            round(min(abs(extract(epoch FROM v.captured_at - $2::timestamptz)) / 60))::int AS minutes_off
       FROM telematics.vehicle_locations v
       JOIN mdata.units u ON u.id = v.unit_id
        AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = v.operating_company_id
      WHERE v.operating_company_id = $1::uuid
        AND v.captured_at BETWEEN $2::timestamptz - make_interval(mins => $3) AND $2::timestamptz + make_interval(mins => $3)
        AND CASE WHEN $4::float8 IS NOT NULL THEN ${dist} <= $6
                 ELSE upper(v.city) = $7 AND upper(v.state) = $8 END
      GROUP BY 1, 2
      ORDER BY minutes_off, distance_m NULLS LAST`,
    [input.companyId, input.at, FILL_GPS_WINDOW_MIN, input.lat, input.lng, FILL_GPS_RADIUS_M, input.city, input.state]
  )).rows;
}

/** THE one resolver: truck at the pump + the load it was running (or drove to). Writes nothing. */
export async function resolveFillTruckAndLoad(client: DbClient, companyId: string, fuelId: string): Promise<FillResolution | null> {
  const f = await loadFillFacts(client, companyId, fuelId);
  if (!f) return null;
  const base = { ...f, truck_unit_id: null, truck_unit: null, candidates: [] as GpsCandidate[], engine_load_id: null, engine_load_number: null };
  if (!f.moment) return { ...base, truck_resolution: "held_time_unknown", load_resolution: "held_time_unknown" };
  const candidates = await gpsTrucksAtStation(client, { companyId, at: f.moment, lat: f.station_lat, lng: f.station_lng, city: f.city, state: f.state });
  const pick = pickFillTruck(candidates, f.card_unit_id);
  if (!pick.unit) return { ...base, candidates, truck_resolution: pick.resolution, load_resolution: pick.resolution };
  const load = await resolveFuelLoadAtTime(client as never, { operatingCompanyId: companyId, unitId: pick.unit.unit_id, driverId: null, at: f.moment });
  let loadResolution = "held_no_load";
  if (load) {
    const pk = (await client.query<{ running: boolean }>(
      `SELECT COALESCE((SELECT min(COALESCE(p.actual_arrival_at, p.scheduled_arrival_at)) FROM mdata.load_stops p
                         WHERE p.load_id = $1::uuid AND p.stop_type::text = 'pickup' AND p.soft_deleted_at IS NULL), now()) <= $2::timestamptz AS running`,
      [load.load_id, f.moment]
    )).rows[0];
    loadResolution = pk?.running ? "running" : "next_load";
  }
  return {
    ...base, candidates, truck_unit_id: pick.unit.unit_id, truck_unit: pick.unit.unit_number, truck_resolution: pick.resolution,
    engine_load_id: load?.load_id ?? null, engine_load_number: load?.load_number ?? null, load_resolution: loadResolution,
  };
}

export type FillMoveOutcome = "moved" | "in_place" | "not_posted" | "split" | "refused";

/** The one write: move the fill (posted legs + document) to the load, set its truck, record the evidence. */
export async function applyFillTruckAndLoad(
  client: DbClient,
  input: {
    companyId: string; actorUserId: string; fuelId: string; toLoadId: string | null; toLoadNumber: string | null;
    toUnitId: string | null; reason: string; resolution: Pick<FillResolution, "moment" | "moment_source" | "station_lat" | "station_lng" | "card_unit_id" | "candidates" | "truck_resolution" | "load_resolution" | "load_id" | "relay_id">;
  }
): Promise<FillMoveOutcome> {
  let outcome: FillMoveOutcome = input.toLoadId && input.toLoadId !== input.resolution.load_id ? "moved" : "in_place";
  // Always align the ledger + document with the target load (not only when the row differs): a document that drifted from
  // its fuel row is brought back by the same engine, so a re-run is self-healing.
  if (input.toLoadId) {
    let carried = await carryFuelReceiptToLoad(client as never, {
      operatingCompanyId: input.companyId, actorUserId: input.actorUserId, fillKind: "fuel_transaction", fillId: input.fuelId,
      toLoadId: input.toLoadId, toLoadNumber: input.toLoadNumber, reason: input.reason,
    });
    if (carried === "not_posted" && input.resolution.relay_id) {
      carried = await carryFuelReceiptToLoad(client as never, {
        operatingCompanyId: input.companyId, actorUserId: input.actorUserId, fillKind: "relay_fuel", fillId: input.resolution.relay_id,
        toLoadId: input.toLoadId, toLoadNumber: input.toLoadNumber, reason: input.reason,
      });
    }
    if (carried === "split") return "split";
    if (carried === "reattributed" || carried === "attached") outcome = "moved";
    if (carried === "not_posted") {
      // A settlement-entered receipt's ledger belongs to its EXPENSE DOCUMENT (source 'expense'), not a fuel_event: the
      // reclassify engine moves those postings by load (GL + the expense line), then the receipt document follows
      // (fuel rows + expense header + load link). Amounts and accounts never change.
      const legs = (await client.query<{ id: string }>(
        `SELECT p.id::text
           FROM accounting.expenses e
           JOIN accounting.journal_entry_postings p ON p.operating_company_id = e.operating_company_id
                AND p.source_transaction_type = 'expense' AND p.source_transaction_id::text = e.id::text
           JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
          WHERE e.operating_company_id = $1::uuid AND e.source_fuel_transaction_id = $2::uuid AND e.voided_at IS NULL
            AND p.reversal_of_line_id IS NULL AND p.reversed_by_line_id IS NULL AND p.source_transaction_line_id IS NOT NULL
            AND je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL
            AND p.load_id IS DISTINCT FROM $3::uuid`,
        [input.companyId, input.fuelId, input.toLoadId]
      )).rows.map((r) => r.id);
      if (legs.length) {
        outcome = "moved";
        const batch = await applyReclassifyOnClient(client as never, {
          operating_company_id: input.companyId, posting_ids: legs, to_load_id: input.toLoadId, reason: input.reason,
          filter_snapshot: { fuel_id: input.fuelId, round: "LEAD 443.214" },
        } as never, { userId: input.actorUserId, role: "system" });
        if (batch.lines_refused > 0) {
          const why = batch.documents.map((d) => d.refusal_reason).filter(Boolean).join("; ") || "refused";
          throw new Error(`fill_truck_and_load_reclassify_refused: ${why}`);
        }
      }
      const doc = await moveFuelReceiptDocumentToLoad(client as never, input.companyId, {
        fillId: input.fuelId, loadId: input.toLoadId, actorUserId: input.actorUserId, reason: input.reason,
      });
      if (doc.note && !doc.updated) throw new Error(`fill_truck_and_load_document_refused: ${doc.note}`);
      if (doc.updated) outcome = "moved";
      // OWNER RULING 443.288-A: the receipt document moved without a reclassify of its own here (nothing posted, or
      // already re-posted above) — its linked children follow it explicitly (idempotent: children on the load are skipped).
      if (input.toLoadId) {
        const parents = (await client.query<{ id: string }>(
          `SELECT e.id::text FROM accounting.expenses e
            WHERE e.operating_company_id = $1::uuid AND e.source_fuel_transaction_id = $2::uuid AND e.voided_at IS NULL`,
          [input.companyId, input.fuelId],
        )).rows.map((r) => r.id);
        await moveExpenseFamilyToLoad(client as never, {
          operatingCompanyId: input.companyId, actorUserId: input.actorUserId, parentExpenseIds: parents, toLoadId: input.toLoadId, reason: input.reason,
        });
      }
    }
  }
  const gps = input.resolution.candidates.find((c) => c.unit_id === input.toUnitId) ?? null;
  await client.query(
    `UPDATE fuel.fuel_transactions
        SET card_unit_id = COALESCE(card_unit_id, unit_id),
            unit_id = COALESCE($3::uuid, unit_id),
            driver_id = CASE WHEN $3::uuid IS NOT NULL AND $3::uuid IS DISTINCT FROM unit_id
                             THEN COALESCE((SELECT l.assigned_primary_driver_id FROM mdata.loads l WHERE l.id = $4::uuid AND l.operating_company_id = $1::uuid), driver_id)
                             ELSE driver_id END,
            fill_moment_at = COALESCE(fill_moment_at, $5::timestamptz),
            fill_moment_source = COALESCE(fill_moment_source, $6),
            time_unknown = ($5::timestamptz IS NULL AND fill_moment_at IS NULL),
            station_lat = COALESCE(station_lat, $7::numeric), station_lng = COALESCE(station_lng, $8::numeric),
            gps_unit_id = $9::uuid, gps_distance_m = $10::int, gps_minutes_off = $11::int,
            truck_resolution = $12, load_resolution = $13, resolved_at = now(), updated_at = now()
      -- 443.230: a Relay fill's rows (diesel + DEF lines) move together (carryFuelReceiptToLoad relay_fuel), so the evidence is
      -- written on every row of the fill, not only the row the engine was called with.
      WHERE operating_company_id = $1::uuid
        AND (id = $2::uuid OR ($14::uuid IS NOT NULL AND relay_fuel_transaction_id = $14::uuid AND voided_at IS NULL))`,
    [input.companyId, input.fuelId, input.toUnitId, input.toLoadId, input.resolution.moment, input.resolution.moment_source,
     input.resolution.station_lat, input.resolution.station_lng, gps?.unit_id ?? null, gps?.distance_m ?? null, gps?.minutes_off ?? null,
     input.resolution.truck_resolution, input.resolution.load_resolution, input.resolution.relay_id ?? null]
  );
  await appendCrudAudit(client as never, input.actorUserId, "fuel.fill_truck_and_load_resolved", {
    operating_company_id: input.companyId, fuel_id: input.fuelId, from_load_id: input.resolution.load_id, load_id: input.toLoadId,
    card_unit_id: input.resolution.card_unit_id, unit_id: input.toUnitId, gps: gps, moment: input.resolution.moment,
    moment_source: input.resolution.moment_source, truck_resolution: input.resolution.truck_resolution,
    load_resolution: input.resolution.load_resolution, reason: input.reason, outcome,
  }, "info", "LEAD-443.214");
  return outcome;
}

export type OwnerRuling = { fuel_id: string; to_unit_id?: string | null; to_load_id?: string | null; reason: string };

export type RerunRow = {
  fuel_id: string; fill_ct: string | null; moment_source: string | null; station: string; card_unit: string | null;
  gps_unit: string | null; candidates: string; current_load: string | null; engine_load: string | null;
  truck_resolution: string; load_resolution: string; action: "repoint" | "ruling" | "keep" | "held"; outcome?: FillMoveOutcome;
};

/** Dry run (default) or apply over the company's live fuel (or a subset). Owner rulings override the engine by name. */
export async function runFuelFollowsTruck(
  client: DbClient,
  input: { companyId: string; actorUserId: string; dryRun: boolean; fuelIds?: string[] | null; rulings?: OwnerRuling[] }
): Promise<{ rows: RerunRow[]; summary: Record<string, number> }> {
  const ids = input.fuelIds?.length
    ? input.fuelIds
    : (await client.query<{ id: string }>(
        `SELECT id::text FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid AND voided_at IS NULL ORDER BY transaction_at, id`,
        [input.companyId]
      )).rows.map((r) => r.id);
  const rulings = new Map((input.rulings ?? []).map((r) => [r.fuel_id, r]));
  const rows: RerunRow[] = [];
  const summary: Record<string, number> = {};
  for (const id of ids) {
    const res = await resolveFillTruckAndLoad(client, input.companyId, id);
    if (!res) continue;
    const ruling = rulings.get(id);
    let toUnit = res.truck_unit_id;
    let toLoad = res.engine_load_id;
    let toLoadNumber = res.engine_load_number;
    if (ruling) {
      toUnit = ruling.to_unit_id ?? res.truck_unit_id ?? res.card_unit_id;
      if (ruling.to_load_id) {
        toLoad = ruling.to_load_id;
        toLoadNumber = (await client.query<{ n: string | null }>(`SELECT load_number::text AS n FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [toLoad, input.companyId])).rows[0]?.n ?? null;
      } else if (toUnit && res.moment) {
        const l = await resolveFuelLoadAtTime(client as never, { operatingCompanyId: input.companyId, unitId: toUnit, driverId: null, at: res.moment });
        toLoad = l?.load_id ?? null;
        toLoadNumber = l?.load_number ?? null;
      }
    }
    const confident = !!res.truck_unit_id && !!res.engine_load_id;
    const action: RerunRow["action"] = ruling ? "ruling" : !confident ? "held" : toLoad !== res.load_id || toUnit !== res.card_unit_id ? "repoint" : "keep";
    const row: RerunRow = {
      fuel_id: id,
      fill_ct: res.moment ? (await client.query<{ t: string }>(`SELECT to_char($1::timestamptz AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD HH24:MI') AS t`, [res.moment])).rows[0]!.t : null,
      moment_source: res.moment_source, station: res.station, card_unit: res.card_unit, gps_unit: res.truck_unit,
      candidates: res.candidates.map((c) => `${c.unit_number}${c.distance_m != null ? ` ${c.distance_m}m` : ""} ${c.minutes_off}min`).join("; "),
      current_load: res.load_number, engine_load: ruling ? toLoadNumber : res.engine_load_number,
      truck_resolution: ruling ? `owner_ruling: ${ruling.reason}` : res.truck_resolution, load_resolution: res.load_resolution, action,
    };
    if (!input.dryRun && (action === "repoint" || action === "ruling") && toLoad) {
      await client.query("SAVEPOINT fill_truck_load");
      try {
        row.outcome = await applyFillTruckAndLoad(client, {
          companyId: input.companyId, actorUserId: input.actorUserId, fuelId: id, toLoadId: toLoad, toLoadNumber, toUnitId: toUnit,
          reason: ruling ? `LEAD 443.214 owner ruling — ${ruling.reason}` : `LEAD 443.214 — GPS truck ${res.truck_unit} at ${res.station} (${res.truck_resolution}); load ${res.load_resolution}`,
          resolution: { ...res, truck_resolution: row.truck_resolution },
        });
        await client.query("RELEASE SAVEPOINT fill_truck_load");
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT fill_truck_load");
        row.outcome = "refused";
        row.load_resolution = `${row.load_resolution}; refused: ${String((err as Error)?.message ?? err).slice(0, 200)}`;
      }
    }
    const k = `${action}${row.outcome ? `:${row.outcome}` : ""}`;
    summary[k] = (summary[k] ?? 0) + 1;
    rows.push(row);
  }
  return { rows, summary };
}
