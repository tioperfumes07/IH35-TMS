/**
 * ENGINE: settlement document → load facts (LEAD 443.241; owner 10-22: "read the company and driver settlements. you did not seed
 *         correctly.") — the signed AlwaysTrack driver + company settlement is the source of truth for a USMCA load's stops and miles.
 * SCHEDULE: on demand — POST /api/v1/dispatch/settlement-documents/apply (settlement-document-load-facts.routes.ts), one load per
 *         document row (the extract of every USMCA settlement PDF).
 * WRITES: mdata.load_stops (facility_name / postal_code / city / state only where the stop has none; leg_miles of later stops),
 *         mdata.loads.miles_choice via setMilesChoice source 'document' (practical / short / empty — 443.240 lock), then the ONE
 *         geocode → location → real-address fence → Samsara pass (geocodeStopsWithClient reresolve). audit (appendCrudAudit).
 * NEVER: overwrites a stop that already carries a street or a GPS-verified point with the document's city / ZIP (the document
 *         prints no street; a different printed address is LISTED, never applied); creates or deletes a stop (a document whose
 *         stop shape differs from the load is listed); invents a value the document does not print; touches money.
 * IDEMPOTENCY: every write is compare-and-set (a field already equal is left alone); setMilesChoice is skipped when the load
 *         already carries the document value; the geocode pass is idempotent (advisory locks + NOT EXISTS fence).
 * REVERSE: NOT-A-DOCUMENT — enrichment from the signed document; a stop is corrected through the stop editor.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { setMilesChoice, type MilesField } from "./mileage/miles-recommendations.service.js";
import { geocodeStopsWithClient, looksLikeStreet } from "../telematics/stops-geocode-backfill.service.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type DocumentStop = {
  type: "EMPTY" | "PICKUP" | "DELIVER";
  date: string | null;
  company: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  leg_miles: number | null;
};
export type DocumentLoad = {
  load_number: string;
  settlement_no: number;
  stops: DocumentStop[];
  loaded_miles_doc: number | null;
  empty_miles_doc: number | null;
  loaded_miles_legs?: number | null;
  empty_miles_legs?: number | null;
  practical_miles_doc: number | null;
};
export type DocumentListed = { load_number: string; reason: string; detail?: Record<string, unknown> };
export type ApplyDocumentResult = {
  load_number: string;
  load_id: string | null;
  stops_filled: number;
  legs_set: number;
  miles_set: Array<{ field: MilesField; old: number | null; new: number }>;
  listed: DocumentListed[];
  geocode: { stops_geocoded: number; locations_linked: number; geofences_created: number; street_from_place: number; failures: number } | null;
};

const TYPE: Record<string, string> = { PICKUP: "pickup", DELIVER: "delivery" };
const up = (v: unknown) => String(v ?? "").trim().toUpperCase();
const zip5 = (v: unknown) => String(v ?? "").trim().slice(0, 5);
const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10) / 10);

/** Pure: the document's value for each miles field — the printed LOADED / EMPTY MILES lines, else the printed per-stop leg miles
 *  (flat-rate pay prints legs only); practical = the company settlement's Line Haul miles. A value the document does not print
 *  stays null (never guessed). */
export function documentMiles(doc: DocumentLoad): Record<MilesField, number | null> {
  // LEAD 443.243: a 0 is the extract's "not printed" (13680's company settlement prints no miles) — never a document value.
  const printed = (v: unknown) => { const n = num(v); return n != null && n > 0 ? n : null; };
  const short = printed(doc.loaded_miles_doc) ?? printed(doc.loaded_miles_legs);
  const printedAny = short != null;
  return {
    practical: printed(doc.practical_miles_doc),
    short,
    // An empty-miles line the document does not print is 0 FROM THE DOCUMENT (443.240) — but only when the document printed miles.
    empty: printedAny ? num(doc.empty_miles_doc ?? doc.empty_miles_legs ?? 0) : null,
  };
}

type StopRow = {
  id: string; sequence_number: number; stop_type: string; facility_name: string | null; address_line1: string | null;
  city: string | null; state: string | null; postal_code: string | null; geocode_source: string | null; geocode_precision: string | null;
  leg_miles: string | null; location_id: string | null;
};

/** Pure: what the document may fill on one stop. Fills only what the stop lacks; a stop already at a street / GPS point whose
 *  printed city + ZIP differ is listed, not moved. */
export function stopDocumentPatch(stop: StopRow, d: DocumentStop, isFirst: boolean, legsAlign = true) {
  const patch: { facility_name?: string; postal_code?: string; city?: string; state?: string; leg_miles?: number } = {};
  let conflict: Record<string, unknown> | null = null;
  const company = String(d.company ?? "").trim();
  if (!stop.facility_name?.trim() && company && !looksLikeStreet(stop.address_line1)) patch.facility_name = company;
  if (!stop.city?.trim() && d.city) { patch.city = d.city.trim(); patch.state = up(d.state); }
  // The document's ZIP fills a stop with none when it is the same city, or when the stop has no street at all (the 10-16 seed
  // booked a city only; the document's city may be misspelled — "TERREL", "WELASCO" — the ZIP is still the document's).
  const sameCity = up(stop.city) === up(d.city) || !stop.city?.trim();
  if (!zip5(stop.postal_code) && zip5(d.zip) && (sameCity || !looksLikeStreet(stop.address_line1))) patch.postal_code = zip5(d.zip);
  if (zip5(stop.postal_code) && zip5(d.zip) && zip5(stop.postal_code) !== zip5(d.zip) && up(stop.city) !== up(d.city))
    conflict = { sequence: stop.sequence_number, document: `${d.company ?? ""}, ${d.city ?? ""} ${d.state ?? ""} ${d.zip ?? ""}`.trim(),
      load: `${stop.facility_name ?? ""}, ${stop.city ?? ""} ${stop.state ?? ""} ${stop.postal_code ?? ""}`.trim(), load_geocode_source: stop.geocode_source };
  // Stop 1's leg is the load's whole deadhead (miles_deadhead) — the document splits it over its EMPTY rows; later legs are the
  // document's printed leg miles.
  const docLeg = num(d.leg_miles);
  if (legsAlign && !isFirst && docLeg != null && num(stop.leg_miles) !== docLeg) patch.leg_miles = docLeg;
  return { patch, conflict };
}

/** Pure: each load stop → the index of its document stop, in order, by stop type (and city when the document has more stops than
 *  the load). null when a load stop has no document stop. */
export function alignDocumentStops(stops: Array<{ stop_type: string; city: string | null }>, docStops: DocumentStop[]): number[] | null {
  if (docStops.length === stops.length)
    return docStops.every((d, i) => TYPE[d.type] === stops[i]!.stop_type) ? stops.map((_, i) => i) : null;
  if (docStops.length < stops.length) return null;
  const out: number[] = [];
  let j = 0;
  for (const s of stops) {
    while (j < docStops.length && !(TYPE[docStops[j]!.type] === s.stop_type && up(docStops[j]!.city) === up(s.city))) j++;
    if (j >= docStops.length) return null;
    out.push(j++);
  }
  return out;
}

export async function applySettlementDocumentToLoad(
  client: DbClient,
  args: { operatingCompanyId: string; actorUserId: string; doc: DocumentLoad; geocode?: boolean }
): Promise<ApplyDocumentResult> {
  const { doc } = args;
  const out: ApplyDocumentResult = { load_number: doc.load_number, load_id: null, stops_filled: 0, legs_set: 0, miles_set: [], listed: [], geocode: null };
  const load = (await client.query<{ id: string; miles_practical: string | null; miles_shortest: string | null; miles_deadhead: string | null; choice: Record<string, { source?: string; document_value?: unknown }> | null }>(
    `SELECT id::text, miles_practical::text, miles_shortest::text, miles_deadhead::text, miles_choice AS choice
       FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = $2 AND voided_at IS NULL AND soft_deleted_at IS NULL`,
    [args.operatingCompanyId, doc.load_number])).rows;
  if (load.length !== 1) {
    out.listed.push({ load_number: doc.load_number, reason: load.length ? "load_number_ambiguous" : "load_not_in_tms" });
    return out;
  }
  const l = load[0]!;
  out.load_id = l.id;

  // ---- stops ----
  const stops = (await client.query<StopRow>(
    `SELECT id::text, sequence_number, stop_type::text, facility_name, address_line1, city, state, postal_code, geocode_source,
            geocode_precision, leg_miles::text, location_id::text
       FROM mdata.load_stops WHERE load_id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL
      ORDER BY sequence_number`, [l.id, args.operatingCompanyId])).rows;
  const docStops = doc.stops.filter((s) => s.type !== "EMPTY");
  const aligned = alignDocumentStops(stops, docStops);
  const shapeOk = aligned != null;
  const exact = docStops.length === stops.length;
  if (!aligned) {
    out.listed.push({ load_number: doc.load_number, reason: "stop_shape_differs", detail: {
      document: docStops.map((d) => `${d.type} ${d.company ?? ""} ${d.city ?? ""}`.trim()), load: stops.map((s) => `${s.stop_type} ${s.city ?? ""}`.trim()) } });
  } else {
    // A document stop the load does not carry (a relay / yard drop the booking never recorded) is listed — never invented here.
    const used = new Set(aligned);
    const extra = docStops.filter((_, j) => !used.has(j));
    if (extra.length) out.listed.push({ load_number: doc.load_number, reason: "document_stop_not_on_load", detail: {
      stops: extra.map((d) => `${d.type} ${d.company ?? ""}, ${d.city ?? ""} ${d.state ?? ""} ${d.zip ?? ""} ${d.date ?? ""}`.trim()) } });
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i]!;
      const { patch, conflict } = stopDocumentPatch(s, docStops[aligned[i]!]!, i === 0, exact);
      if (conflict) out.listed.push({ load_number: doc.load_number, reason: "printed_address_differs_load_kept", detail: conflict });
      if (!Object.keys(patch).length) continue;
      await client.query(
        `UPDATE mdata.load_stops
            SET facility_name = CASE WHEN nullif(trim(facility_name), '') IS NULL THEN coalesce($3, facility_name) ELSE facility_name END,
                postal_code   = CASE WHEN nullif(trim(postal_code), '') IS NULL THEN coalesce($4, postal_code) ELSE postal_code END,
                city          = CASE WHEN nullif(trim(city), '') IS NULL THEN coalesce($5, city) ELSE city END,
                state         = CASE WHEN nullif(trim(city), '') IS NULL THEN coalesce($6, state) ELSE state END,
                leg_miles     = coalesce($7::numeric, leg_miles),
                updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [s.id, args.operatingCompanyId, patch.facility_name ?? null, patch.postal_code ?? null, patch.city ?? null, patch.state ?? null, patch.leg_miles ?? null]);
      if (patch.leg_miles != null) out.legs_set += 1;
      if (patch.facility_name || patch.postal_code || patch.city) out.stops_filled += 1;
      await appendCrudAudit(client as never, args.actorUserId, "dispatch.load_stop.settlement_document_applied", {
        resource_type: "mdata.load_stops", resource_id: s.id, operating_company_id: args.operatingCompanyId, load_id: l.id,
        load_number: doc.load_number, settlement_no: doc.settlement_no, sequence: s.sequence_number,
        before: { facility_name: s.facility_name, postal_code: s.postal_code, city: s.city, state: s.state, leg_miles: num(s.leg_miles) },
        applied: patch,
      }, "info", "443.241");
    }
  }

  // ---- miles (443.240 precedence: the document locks) ----
  const want = documentMiles(doc);
  const current: Record<MilesField, number | null> = { practical: num(l.miles_practical), short: num(l.miles_shortest), empty: num(l.miles_deadhead) };
  // the shortest may never exceed practical (loads_miles_shortest_not_over_practical): a lower practical goes after the shortest
  const order: MilesField[] = want.practical != null && current.short != null && want.practical < current.short
    ? ["short", "practical", "empty"] : ["practical", "short", "empty"];
  for (const field of order) {
    const v = want[field];
    if (v == null) continue;
    const c = l.choice?.[field];
    if (current[field] === v && c?.source === "document" && num(c?.document_value) === v) continue;
    await setMilesChoice(client as never, {
      operatingCompanyId: args.operatingCompanyId, loadId: l.id, field, source: "document", documentValue: v,
      reason: `signed settlement ${doc.settlement_no}`, actorUserId: args.actorUserId,
    });
    out.miles_set.push({ field, old: current[field], new: v });
  }
  if (want.short == null) out.listed.push({ load_number: doc.load_number, reason: "document_prints_no_miles" });

  // ---- the ONE geocode → location → real-address fence → Samsara pass for this load ----
  if (args.geocode !== false && shapeOk) {
    const g = await geocodeStopsWithClient(client as never, args.actorUserId, args.operatingCompanyId, l.id, { reresolve: true });
    out.geocode = { stops_geocoded: g.stops_geocoded, locations_linked: g.locations_linked, geofences_created: g.geofences_created,
      street_from_place: g.street_from_place ?? 0, failures: g.failures.length };
    for (const z of g.zip_center_listed) out.listed.push({ load_number: doc.load_number, reason: "no_street_found", detail: { stop_id: z.stop_id, city: z.city, state: z.state, zip: z.postal_code } });
  }
  return out;
}
