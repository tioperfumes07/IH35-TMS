/**
 * ENGINE: settlement document → load facts (LEAD 443.241; owner 10-22: "read the company and driver settlements. you did not seed
 *         correctly.") — the signed AlwaysTrack driver + company settlement is the source of truth for a USMCA load's stops and miles.
 * SCHEDULE: on demand — POST /api/v1/dispatch/settlement-documents/apply (settlement-document-load-facts.routes.ts), one load per
 *         document row (the extract of every USMCA settlement PDF).
 * WRITES: mdata.load_stops (facility_name / postal_code / city / state only where the stop has none; leg_miles of later stops),
 *         mdata.loads.miles_choice via setMilesChoice source 'document' (practical / short / empty — 443.240 lock), then the ONE
 *         geocode → location → real-address fence → Samsara pass (geocodeStopsWithClient reresolve). audit (appendCrudAudit).
 * NEVER: overwrites a stop that already carries a street or a GPS-verified point with the document's city / ZIP (the document
 *         prints no street; the printed address is kept as the stop's address of record in document_address — 443.248); deletes a
 *         stop (a printed stop the load lacks is ADDED in its printed position — 443.248; a shape that cannot be aligned is listed);
 *         invents a value the document does not print; touches money.
 * IDEMPOTENCY: every write is compare-and-set (a field already equal is left alone); setMilesChoice is skipped when the load
 *         already carries the document value; the geocode pass is idempotent (advisory locks + NOT EXISTS fence).
 * REVERSE: NOT-A-DOCUMENT — enrichment from the signed document; a stop is corrected through the stop editor.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { stampStopsFromTracking } from "../driver-finance/settlement-creator-deliver.js";
import { DELIVERED_OR_LATER_STATUSES } from "./canonical-active-load-set.js";
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
  /** 443.248: printed stops added to the load / stops whose address of record was (re)written. */
  stops_added?: number;
  records_set?: number;
  /** stops stamped through the one stamping engine because the load is already delivered (or later). */
  stops_stamped?: number;
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
  document_address?: Record<string, unknown> | null;
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

/** Pure: the signed settlement's printed address of record for one stop (LEAD 443.248). */
export function documentAddressOf(d: DocumentStop, settlementNo: number) {
  const clean = (v: unknown) => (String(v ?? "").trim() || null);
  return { settlement_no: settlementNo, company: clean(d.company), city: clean(d.city), state: clean(d.state), zip: clean(d.zip) };
}

/** Pure: the final stop order — every printed (non-EMPTY) stop in document order; an existing load stop keeps its row. */
export function documentStopPlan(docStops: DocumentStop[], aligned: number[]): Array<{ existingIndex: number | null; docIndex: number }> {
  const byDoc = new Map(aligned.map((j, i) => [j, i]));
  return docStops.map((_, j) => ({ existingIndex: byDoc.has(j) ? byDoc.get(j)! : null, docIndex: j }));
}

async function insertMissingDocumentStops(
  client: DbClient,
  a: { operatingCompanyId: string; actorUserId: string; loadId: string; loadNumber: string; settlementNo: number; stops: StopRow[]; docStops: DocumentStop[]; aligned: number[] }
): Promise<number> {
  const plan = documentStopPlan(a.docStops, a.aligned);
  // (load_id, sequence_number) is UNIQUE and not deferrable: park the existing rows out of the way, then write the final order.
  await client.query(
    `UPDATE mdata.load_stops SET sequence_number = sequence_number + 1000, updated_at = now()
      WHERE load_id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL`, [a.loadId, a.operatingCompanyId]);
  let added = 0;
  for (let k = 0; k < plan.length; k++) {
    const step = plan[k]!;
    const seq = k + 1;
    if (step.existingIndex != null) {
      await client.query(`UPDATE mdata.load_stops SET sequence_number = $3, updated_at = now() WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [a.stops[step.existingIndex]!.id, a.operatingCompanyId, seq]);
      continue;
    }
    const d = a.docStops[step.docIndex]!;
    const ins = (await client.query<{ id: string }>(
      `INSERT INTO mdata.load_stops (load_id, operating_company_id, sequence_number, stop_type, facility_name, city, state, postal_code, country,
                                     scheduled_arrival_at, time_window_type, stop_notes, document_address)
       VALUES ($1::uuid, $2::uuid, $3, $4::mdata.stop_type_enum, $5, $6, $7, $8, 'US', $9::timestamptz, 'appointment', $10, $11::jsonb)
       RETURNING id::text`,
      [a.loadId, a.operatingCompanyId, seq, TYPE[d.type], d.company?.trim() || null, d.city?.trim() || null, up(d.state) || null,
        String(d.zip ?? "").trim().slice(0, 5) || null, d.date ? `${d.date}T12:00:00Z` : null,
        `Printed on signed settlement ${a.settlementNo} (relay / yard stop) — added from the document (LEAD 443.248).`,
        JSON.stringify(documentAddressOf(d, a.settlementNo))]
    )).rows[0]!;
    added += 1;
    await appendCrudAudit(client as never, a.actorUserId, "dispatch.load_stop.added_from_settlement_document", {
      resource_type: "mdata.load_stops", resource_id: ins.id, operating_company_id: a.operatingCompanyId, load_id: a.loadId,
      load_number: a.loadNumber, settlement_no: a.settlementNo, sequence: seq, stop_type: TYPE[d.type], company: d.company, city: d.city, zip: d.zip, date: d.date,
    }, "info", "443.248");
  }
  return added;
}

export async function applySettlementDocumentToLoad(
  client: DbClient,
  args: { operatingCompanyId: string; actorUserId: string; doc: DocumentLoad; geocode?: boolean }
): Promise<ApplyDocumentResult> {
  const { doc } = args;
  const out: ApplyDocumentResult = { load_number: doc.load_number, load_id: null, stops_filled: 0, legs_set: 0, miles_set: [], listed: [], geocode: null };
  const load = (await client.query<{ id: string; status: string; miles_practical: string | null; miles_shortest: string | null; miles_deadhead: string | null; choice: Record<string, { source?: string; document_value?: unknown }> | null }>(
    `SELECT id::text, status::text AS status, miles_practical::text, miles_shortest::text, miles_deadhead::text, miles_choice AS choice
       FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = $2 AND voided_at IS NULL AND soft_deleted_at IS NULL`,
    [args.operatingCompanyId, doc.load_number])).rows;
  if (load.length !== 1) {
    out.listed.push({ load_number: doc.load_number, reason: load.length ? "load_number_ambiguous" : "load_not_in_tms" });
    return out;
  }
  const l = load[0]!;
  out.load_id = l.id;

  // ---- stops ----
  const readStops = async () => (await client.query<StopRow>(
    `SELECT id::text, sequence_number, stop_type::text, facility_name, address_line1, city, state, postal_code, geocode_source,
            geocode_precision, leg_miles::text, location_id::text, document_address
       FROM mdata.load_stops WHERE load_id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL
      ORDER BY sequence_number`, [l.id, args.operatingCompanyId])).rows;
  let stops = await readStops();
  const docStops = doc.stops.filter((s) => s.type !== "EMPTY");
  let aligned = alignDocumentStops(stops, docStops);
  if (!aligned) {
    out.listed.push({ load_number: doc.load_number, reason: "stop_shape_differs", detail: {
      document: docStops.map((d) => `${d.type} ${d.company ?? ""} ${d.city ?? ""}`.trim()), load: stops.map((s) => `${s.stop_type} ${s.city ?? ""}`.trim()) } });
  } else if (aligned.length < docStops.length) {
    // LEAD 443.248 (document-first): a stop the signed settlement prints and the load does not carry (13541 / 13576: the Love's
    // Vinton relay) is ADDED in its printed position; the load's own stops keep their rows and are re-sequenced around it.
    out.stops_added = await insertMissingDocumentStops(client, { operatingCompanyId: args.operatingCompanyId, actorUserId: args.actorUserId,
      loadId: l.id, loadNumber: doc.load_number, settlementNo: doc.settlement_no, stops, docStops, aligned });
    stops = await readStops();
    aligned = alignDocumentStops(stops, docStops);
  }
  const shapeOk = aligned != null;
  if (aligned) {
    const exact = docStops.length === stops.length;
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i]!;
      const d = docStops[aligned[i]!]!;
      const { patch, conflict } = stopDocumentPatch(s, d, i === 0, exact);
      // the signed settlement's printed address is the stop's address of record (443.248); the stop's own address / point stay the geo.
      const record = documentAddressOf(d, doc.settlement_no);
      const recordChanged = JSON.stringify(s.document_address ?? null) !== JSON.stringify(record);
      if (conflict) out.listed.push({ load_number: doc.load_number, reason: "printed_address_differs_load_kept", detail: conflict });
      if (!Object.keys(patch).length && !recordChanged) continue;
      await client.query(
        `UPDATE mdata.load_stops
            SET facility_name = CASE WHEN nullif(trim(facility_name), '') IS NULL THEN coalesce($3, facility_name) ELSE facility_name END,
                postal_code   = CASE WHEN nullif(trim(postal_code), '') IS NULL THEN coalesce($4, postal_code) ELSE postal_code END,
                city          = CASE WHEN nullif(trim(city), '') IS NULL THEN coalesce($5, city) ELSE city END,
                state         = CASE WHEN nullif(trim(city), '') IS NULL THEN coalesce($6, state) ELSE state END,
                leg_miles     = coalesce($7::numeric, leg_miles),
                document_address = $8::jsonb,
                updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [s.id, args.operatingCompanyId, patch.facility_name ?? null, patch.postal_code ?? null, patch.city ?? null, patch.state ?? null,
          patch.leg_miles ?? null, JSON.stringify(record)]);
      if (patch.leg_miles != null) out.legs_set += 1;
      if (patch.facility_name || patch.postal_code || patch.city) out.stops_filled += 1;
      if (recordChanged) out.records_set = (out.records_set ?? 0) + 1;
      await appendCrudAudit(client as never, args.actorUserId, "dispatch.load_stop.settlement_document_applied", {
        resource_type: "mdata.load_stops", resource_id: s.id, operating_company_id: args.operatingCompanyId, load_id: l.id,
        load_number: doc.load_number, settlement_no: doc.settlement_no, sequence: s.sequence_number,
        before: { facility_name: s.facility_name, postal_code: s.postal_code, city: s.city, state: s.state, leg_miles: num(s.leg_miles), document_address: s.document_address ?? null },
        applied: { ...patch, document_address: record },
      }, "info", "443.241");
    }
    // verify-delivered-load-stops-terminal RULE 2 (red after 443.248 added the Love's Vinton relay to 13541 / 13576 as 'pending'):
    // a load that is already delivered (or later) cannot keep a stop that never happened. The signed settlement attests every
    // printed stop, so the stops go through the ONE stamping engine (GPS stop event first, the printed date otherwise), which
    // settles them to 'departed'. Stamped stops are never overwritten.
    if ((DELIVERED_OR_LATER_STATUSES as readonly string[]).includes(l.status)) {
      const stopDates: Record<string, string> = {};
      for (let i = 0; i < stops.length; i++) {
        const day = docStops[aligned[i]!]?.date;
        if (day) stopDates[stops[i]!.id] = day;
      }
      const stamped = await stampStopsFromTracking(client, l.id, args.operatingCompanyId, { stopDates });
      out.stops_stamped = stamped.filter((x) => x.precision !== "already_stamped" && x.arrival_at != null).length;
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
