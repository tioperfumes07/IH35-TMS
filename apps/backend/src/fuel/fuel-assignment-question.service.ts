/**
 * LEAD 443.243 — Fuel Assignment Question engine (API surface for the Cursor popup).
 * THE RULE lives in resolveFillTruckAndLoad (CC-2). When the resolver is not 100% certain it must
 * not assign alone — this service upserts a question with the evidence and a proposed answer.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { resolveFuelLoadAtTime } from "./fuel-load-at-time.js";
import {
  applyFillTruckAndLoad,
  resolveFillTruckAndLoad,
  type FillResolution,
  type GpsCandidate,
} from "./fill-truck-and-load.service.js";
import { markExpenseLoadConfirmedBy } from "../accounting/expense-load-confirmation.service.js";

type DbClient = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> };

export type FuelCandidateLoad = {
  load_id: string | null;
  load_number: string | null;
  settlement_ref: string | null;
  pickup: string | null;
  delivery: string | null;
  route: string | null;
};

export type FuelCandidateTruck = {
  unit_id: string;
  unit_number: string;
  distance_m: number | null;
  minutes_off: number | null;
  distance_mi: number | null;
  samsara_driver: string | null;
  odometer: number | null;
  /** LEAD 443.258-A: ALWAYS present — the truck's load at the pump moment, or null when it had none. Never omitted. */
  load: FuelCandidateLoad | null;
};

/**
 * LEAD 443.258-A (P0 crash D001: "Cannot read properties of undefined (reading 'load_number')"). Every candidate the API
 * returns carries `load` — an object or null — whatever shape the stored evidence row has. A question row written with
 * the flat legacy shape (load_number / unit_number / gps_* on the candidate, no `load` key) is mapped here on READ, so
 * every reader (list, get, answer, upsert) hands the popup one shape.
 */
export function normalizeCandidate(raw: unknown): FuelCandidateTruck {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (v == null || v === "" ? null : String(v));
  const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  let load: FuelCandidateLoad | null = null;
  const nested = c.load;
  if (nested && typeof nested === "object") {
    const l = nested as Record<string, unknown>;
    load = l.load_id || l.load_number
      ? { load_id: str(l.load_id), load_number: str(l.load_number), settlement_ref: str(l.settlement_ref), pickup: str(l.pickup), delivery: str(l.delivery), route: str(l.route) }
      : null;
  } else if (c.load_id || c.load_number) {
    load = { load_id: str(c.load_id), load_number: str(c.load_number), settlement_ref: str(c.settlement_ref), pickup: null, delivery: null, route: str(c.route) };
  }
  const distanceM = num(c.distance_m);
  return {
    unit_id: str(c.unit_id) ?? "",
    unit_number: str(c.unit_number) ?? "—",
    distance_m: distanceM,
    minutes_off: num(c.minutes_off ?? c.gps_minutes_off),
    distance_mi: num(c.distance_mi ?? c.gps_distance_mi) ?? (distanceM != null ? Math.round((distanceM / 1609.344) * 100) / 100 : null),
    samsara_driver: str(c.samsara_driver),
    odometer: num(c.odometer),
    load,
  };
}

/** One evidence shape on every read (443.258-A). The return type says so: candidates are always FuelCandidateTruck[]. */
export type NormalizedEvidence = {
  candidates: FuelCandidateTruck[];
  truck_resolution: string;
  load_resolution: string;
  moment_source: string | null;
  [k: string]: unknown;
};
export function normalizeQuestionRow<T extends { evidence: unknown }>(row: T): Omit<T, "evidence"> & { evidence: NormalizedEvidence };
export function normalizeQuestionRow<T extends { evidence: unknown }>(row: T | null | undefined): (Omit<T, "evidence"> & { evidence: NormalizedEvidence }) | null | undefined;
export function normalizeQuestionRow<T extends { evidence: unknown }>(row: T | null | undefined) {
  if (!row) return row;
  const ev = (row.evidence && typeof row.evidence === "object" ? row.evidence : {}) as Record<string, unknown>;
  const candidates = Array.isArray(ev.candidates) ? ev.candidates.map(normalizeCandidate) : [];
  const evidence: NormalizedEvidence = { ...ev, candidates, truck_resolution: String(ev.truck_resolution ?? ""), load_resolution: String(ev.load_resolution ?? ""), moment_source: (ev.moment_source as string | null) ?? null };
  return { ...row, evidence };
}

export type FuelAssignmentQuestionRow = {
  id: string;
  operating_company_id: string;
  fuel_transaction_id: string;
  status: "open" | "answered" | "cancelled";
  fill_moment_at: string | null;
  fill_moment_ct: string | null;
  station: string | null;
  gallons: string | null;
  amount_cents: string | null;
  card_unit_id: string | null;
  card_unit_number: string | null;
  card_driver_id: string | null;
  card_driver_name: string | null;
  evidence: {
    candidates: FuelCandidateTruck[];
    truck_resolution: string;
    load_resolution: string;
    moment_source: string | null;
  };
  proposed_unit_id: string | null;
  proposed_unit_number: string | null;
  proposed_load_id: string | null;
  proposed_load_number: string | null;
  proposed_settlement_ref: string | null;
  proposed_why: string | null;
  answer_kind: "confirm_proposed" | "pick_other" | "keep_card_truck" | null;
  answered_unit_id: string | null;
  answered_load_id: string | null;
  answer_reason: string | null;
  answered_by_user_id: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
};

/** 100% certain under THE RULE / current resolver: truck + load resolved, not held_*. */
export function isFillCertain(res: FillResolution): boolean {
  if (!res.truck_unit_id || !res.engine_load_id) return false;
  if (res.truck_resolution.startsWith("held_") || res.load_resolution.startsWith("held_")) return false;
  return true;
}

async function fillCt(client: DbClient, moment: string | null): Promise<string | null> {
  if (!moment) return null;
  return (
    await client.query<{ t: string }>(
      `SELECT to_char($1::timestamptz AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD HH24:MI') AS t`,
      [moment]
    )
  ).rows[0]?.t ?? null;
}

async function loadWindowLabel(client: DbClient, companyId: string, loadId: string | null): Promise<FuelCandidateLoad> {
  if (!loadId) {
    return { load_id: null, load_number: null, settlement_ref: null, pickup: null, delivery: null, route: null };
  }
  const row = (
    await client.query<{
      load_number: string | null;
      settlement_ref: string | null;
      pickup: string | null;
      delivery: string | null;
      route: string | null;
    }>(
      `SELECT l.load_number::text,
              -- LEAD 443.258.5: driver_finance.driver_settlement_loads does not exist (verify-phantom-relations); a load's
              -- settlement is mdata.loads.presettlement_link_id. The signed number when there is one, else the tour's P-number.
              (SELECT COALESCE(ds.source_document_ref, ds.display_id)
                 FROM driver_finance.driver_settlements ds
                WHERE ds.id = l.presettlement_link_id AND ds.operating_company_id = l.operating_company_id
                  AND ds.voided_at IS NULL) AS settlement_ref,
              (SELECT concat_ws(', ', nullif(s.city,''), nullif(s.state,''))
                 FROM mdata.load_stops s
                WHERE s.load_id = l.id AND s.stop_type::text = 'pickup' AND s.soft_deleted_at IS NULL
                ORDER BY s.sequence_number NULLS LAST, s.created_at LIMIT 1) AS pickup,
              (SELECT concat_ws(', ', nullif(s.city,''), nullif(s.state,''))
                 FROM mdata.load_stops s
                WHERE s.load_id = l.id AND s.stop_type::text IN ('delivery','drop') AND s.soft_deleted_at IS NULL
                ORDER BY s.sequence_number DESC NULLS LAST, s.created_at DESC LIMIT 1) AS delivery,
              concat_ws(' → ',
                (SELECT concat_ws(', ', nullif(s.city,''), nullif(s.state,''))
                   FROM mdata.load_stops s
                  WHERE s.load_id = l.id AND s.stop_type::text = 'pickup' AND s.soft_deleted_at IS NULL
                  ORDER BY s.sequence_number NULLS LAST LIMIT 1),
                (SELECT concat_ws(', ', nullif(s.city,''), nullif(s.state,''))
                   FROM mdata.load_stops s
                  WHERE s.load_id = l.id AND s.stop_type::text IN ('delivery','drop') AND s.soft_deleted_at IS NULL
                  ORDER BY s.sequence_number DESC NULLS LAST LIMIT 1)
              ) AS route
         FROM mdata.loads l WHERE l.id = $1::uuid AND l.operating_company_id = $2::uuid`,
      [loadId, companyId]
    )
  ).rows[0];
  return {
    load_id: loadId,
    load_number: row?.load_number ?? null,
    settlement_ref: row?.settlement_ref ?? null,
    pickup: row?.pickup ?? null,
    delivery: row?.delivery ?? null,
    route: row?.route ?? null,
  };
}

async function enrichCandidate(
  client: DbClient,
  companyId: string,
  c: GpsCandidate,
  moment: string | null
): Promise<FuelCandidateTruck> {
  let samsara: string | null = null;
  let odo: number | null = null;
  if (moment) {
    const drv = (
      await client.query<{ name: string | null }>(
        `SELECT nullif(trim(concat_ws(' ', d.first_name, d.last_name)), '') AS name
           FROM telematics.vehicle_driver_assignments vda
           JOIN mdata.drivers d ON d.id = vda.driver_id
          WHERE vda.unit_id = $1::uuid
            AND d.operating_company_id = $2::uuid
            AND vda.started_at <= $3::timestamptz
            AND (vda.ended_at IS NULL OR vda.ended_at >= $3::timestamptz)
          ORDER BY vda.started_at DESC NULLS LAST LIMIT 1`,
        [c.unit_id, companyId, moment]
      )
    ).rows[0];
    samsara = drv?.name ?? null;
    const od = (
      await client.query<{ odo: string | null }>(
        `SELECT odometer_meters::text AS odo
           FROM telematics.vehicle_locations
          WHERE unit_id = $1::uuid AND operating_company_id = $2::uuid
            AND captured_at BETWEEN $3::timestamptz - interval '30 minutes' AND $3::timestamptz + interval '30 minutes'
            AND odometer_meters IS NOT NULL
          ORDER BY abs(extract(epoch FROM captured_at - $3::timestamptz)) LIMIT 1`,
        [c.unit_id, companyId, moment]
      )
    ).rows[0];
    if (od?.odo != null) odo = Math.round(Number(od.odo) / 1609.344);
  }
  let loadId: string | null = null;
  if (moment) {
    const load = await resolveFuelLoadAtTime(client as never, {
      operatingCompanyId: companyId,
      unitId: c.unit_id,
      driverId: null,
      at: moment,
    });
    loadId = load?.load_id ?? null;
  }
  // 443.258-A: no load at the pump moment -> load: null (never an empty object, never omitted)
  const load = loadId ? await loadWindowLabel(client, companyId, loadId) : null;
  return {
    unit_id: c.unit_id,
    unit_number: c.unit_number,
    distance_m: c.distance_m,
    minutes_off: c.minutes_off,
    distance_mi: c.distance_m != null ? Math.round((c.distance_m / 1609.344) * 100) / 100 : null,
    samsara_driver: samsara,
    odometer: odo,
    load,
  };
}

function proposedWhy(res: FillResolution, certain: boolean): string {
  if (certain) {
    return `Certain: truck ${res.truck_unit} (${res.truck_resolution}) on load ${res.engine_load_number} (${res.load_resolution}).`;
  }
  const bits = [
    `Not 100% certain — ${res.truck_resolution} / ${res.load_resolution}.`,
    res.card_unit ? `Card truck ${res.card_unit} keeps the fill until confirmed.` : "No card truck on the fill.",
    res.truck_unit ? `Proposed GPS truck ${res.truck_unit}.` : "No single GPS truck at the pump.",
    res.engine_load_number ? `Proposed load ${res.engine_load_number}.` : "No load window for the proposed truck.",
  ];
  return bits.join(" ");
}

async function fillMoney(client: DbClient, companyId: string, fuelId: string) {
  return (
    await client.query<{
      gallons: string | null;
      amount_cents: string | null;
      driver_id: string | null;
      driver_name: string | null;
    }>(
      `SELECT f.gallons::text,
              round(COALESCE(f.total_cost, 0) * 100)::bigint::text AS amount_cents,
              f.driver_id::text,
              nullif(trim(concat_ws(' ', d.first_name, d.last_name)), '') AS driver_name
         FROM fuel.fuel_transactions f
         LEFT JOIN mdata.drivers d ON d.id = f.driver_id AND d.operating_company_id = f.operating_company_id
        WHERE f.id = $2::uuid AND f.operating_company_id = $1::uuid`,
      [companyId, fuelId]
    )
  ).rows[0] ?? null;
}

/** Upsert an open question from a resolution (idempotent per open fill). */
export async function upsertFuelAssignmentQuestion(
  client: DbClient,
  input: { companyId: string; actorUserId: string; resolution: FillResolution }
): Promise<FuelAssignmentQuestionRow | null> {
  const res = input.resolution;
  const money = await fillMoney(client, input.companyId, res.id);
  const momentCt = await fillCt(client, res.moment);
  const candidates = await Promise.all(
    res.candidates.map((c) => enrichCandidate(client, input.companyId, c, res.moment))
  );
  // Always include the card truck as a candidate row when GPS missed it.
  if (res.card_unit_id && !candidates.some((c) => c.unit_id === res.card_unit_id)) {
    candidates.unshift(
      await enrichCandidate(
        client,
        input.companyId,
        { unit_id: res.card_unit_id, unit_number: res.card_unit ?? "?", distance_m: null, minutes_off: 0 },
        res.moment
      )
    );
  }
  const proposedUnitId = res.truck_unit_id ?? res.card_unit_id;
  const proposedUnitNumber = res.truck_unit ?? res.card_unit;
  let proposedLoadId = res.engine_load_id;
  let proposedLoadNumber = res.engine_load_number;
  if (!proposedLoadId && proposedUnitId && res.moment) {
    const l = await resolveFuelLoadAtTime(client as never, {
      operatingCompanyId: input.companyId,
      unitId: proposedUnitId,
      driverId: null,
      at: res.moment,
    });
    proposedLoadId = l?.load_id ?? null;
    proposedLoadNumber = l?.load_number ?? null;
  }
  const proposedLoad = await loadWindowLabel(client, input.companyId, proposedLoadId);
  const evidence = {
    candidates,
    truck_resolution: res.truck_resolution,
    load_resolution: res.load_resolution,
    moment_source: res.moment_source,
  };
  const why = proposedWhy(res, false);

  const row = (
    await client.query<FuelAssignmentQuestionRow>(
      `INSERT INTO fuel.fuel_assignment_questions (
         operating_company_id, fuel_transaction_id, status,
         fill_moment_at, fill_moment_ct, station, gallons, amount_cents,
         card_unit_id, card_unit_number, card_driver_id, card_driver_name,
         evidence, proposed_unit_id, proposed_unit_number, proposed_load_id, proposed_load_number,
         proposed_settlement_ref, proposed_why, updated_at
       ) VALUES (
         $1::uuid, $2::uuid, 'open',
         $3::timestamptz, $4, $5, $6::numeric, $7::bigint,
         $8::uuid, $9, $10::uuid, $11,
         $12::jsonb, $13::uuid, $14, $15::uuid, $16,
         $17, $18, now()
       )
       ON CONFLICT (operating_company_id, fuel_transaction_id) WHERE status = 'open'
       DO UPDATE SET
         fill_moment_at = EXCLUDED.fill_moment_at,
         fill_moment_ct = EXCLUDED.fill_moment_ct,
         station = EXCLUDED.station,
         gallons = EXCLUDED.gallons,
         amount_cents = EXCLUDED.amount_cents,
         card_unit_id = EXCLUDED.card_unit_id,
         card_unit_number = EXCLUDED.card_unit_number,
         card_driver_id = EXCLUDED.card_driver_id,
         card_driver_name = EXCLUDED.card_driver_name,
         evidence = EXCLUDED.evidence,
         proposed_unit_id = EXCLUDED.proposed_unit_id,
         proposed_unit_number = EXCLUDED.proposed_unit_number,
         proposed_load_id = EXCLUDED.proposed_load_id,
         proposed_load_number = EXCLUDED.proposed_load_number,
         proposed_settlement_ref = EXCLUDED.proposed_settlement_ref,
         proposed_why = EXCLUDED.proposed_why,
         updated_at = now()
       RETURNING id::text, operating_company_id::text, fuel_transaction_id::text, status,
                 fill_moment_at::text, fill_moment_ct, station, gallons::text, amount_cents::text,
                 card_unit_id::text, card_unit_number, card_driver_id::text, card_driver_name,
                 evidence, proposed_unit_id::text, proposed_unit_number, proposed_load_id::text,
                 proposed_load_number, proposed_settlement_ref, proposed_why,
                 answer_kind, answered_unit_id::text, answered_load_id::text, answer_reason,
                 answered_by_user_id::text, answered_at::text, created_at::text, updated_at::text`,
      [
        input.companyId,
        res.id,
        res.moment,
        momentCt,
        res.station || null,
        money?.gallons ?? null,
        money?.amount_cents != null ? Number(money.amount_cents) : null,
        res.card_unit_id,
        res.card_unit,
        money?.driver_id ?? res.driver_id,
        money?.driver_name ?? null,
        JSON.stringify(evidence),
        proposedUnitId,
        proposedUnitNumber,
        proposedLoadId,
        proposedLoadNumber,
        proposedLoad.settlement_ref,
        why,
      ]
    )
  ).rows[0];
  if (!row) return null;
  await appendCrudAudit(
    client as never,
    input.actorUserId,
    "fuel.assignment_question_opened",
    {
      operating_company_id: input.companyId,
      question_id: row.id,
      fuel_id: res.id,
      truck_resolution: res.truck_resolution,
      load_resolution: res.load_resolution,
      proposed_unit_id: proposedUnitId,
      proposed_load_id: proposedLoadId,
    },
    "info",
    "LEAD-443.243"
  );
  return normalizeQuestionRow(row);
}

/** Resolve fill → certain assign OR open a question. */
export async function evaluateFuelAssignment(
  client: DbClient,
  input: { companyId: string; actorUserId: string; fuelId: string; applyIfCertain?: boolean }
): Promise<
  | { certain: true; resolution: FillResolution; question: null; outcome?: string }
  | { certain: false; resolution: FillResolution; question: FuelAssignmentQuestionRow }
  | { certain: false; resolution: null; question: null; error: string }
> {
  const table = (
    await client.query<{ ok: boolean }>(`SELECT to_regclass('fuel.fuel_assignment_questions') IS NOT NULL AS ok`)
  ).rows[0]?.ok;
  if (!table) return { certain: false, resolution: null, question: null, error: "fuel_assignment_questions_unavailable" };

  const res = await resolveFillTruckAndLoad(client, input.companyId, input.fuelId);
  if (!res) return { certain: false, resolution: null, question: null, error: "fuel_not_found" };

  if (isFillCertain(res)) {
    let outcome: string | undefined;
    if (input.applyIfCertain !== false && res.engine_load_id) {
      outcome = await applyFillTruckAndLoad(client, {
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        fuelId: input.fuelId,
        toLoadId: res.engine_load_id,
        toLoadNumber: res.engine_load_number,
        toUnitId: res.truck_unit_id,
        reason: `LEAD 443.243 — certain (${res.truck_resolution} / ${res.load_resolution})`,
        resolution: res,
      });
    }
    // Close any stale open question for this fill.
    await client.query(
      `UPDATE fuel.fuel_assignment_questions
          SET status = 'cancelled', updated_at = now(),
              answer_reason = COALESCE(answer_reason, 'superseded: engine certain')
        WHERE operating_company_id = $1::uuid AND fuel_transaction_id = $2::uuid AND status = 'open'`,
      [input.companyId, input.fuelId]
    );
    return { certain: true, resolution: res, question: null, outcome };
  }

  const question = await upsertFuelAssignmentQuestion(client, {
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    resolution: res,
  });
  if (!question) return { certain: false, resolution: res, question: null as never, error: "question_upsert_failed" } as never;
  return { certain: false, resolution: res, question };
}

export async function listFuelAssignmentQuestions(
  client: DbClient,
  input: {
    companyId: string;
    status?: "open" | "answered" | "cancelled" | "all";
    loadId?: string;
    unitId?: string;
    fuelId?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ rows: FuelAssignmentQuestionRow[]; total: number }> {
  const values: unknown[] = [input.companyId];
  const filters = ["q.operating_company_id = $1::uuid"];
  const status = input.status ?? "open";
  if (status !== "all") {
    values.push(status);
    filters.push(`q.status = $${values.length}`);
  }
  if (input.loadId) {
    values.push(input.loadId);
    filters.push(`(q.proposed_load_id = $${values.length}::uuid OR q.answered_load_id = $${values.length}::uuid)`);
  }
  if (input.unitId) {
    values.push(input.unitId);
    filters.push(
      `(q.card_unit_id = $${values.length}::uuid OR q.proposed_unit_id = $${values.length}::uuid OR q.answered_unit_id = $${values.length}::uuid)`
    );
  }
  if (input.fuelId) {
    values.push(input.fuelId);
    filters.push(`q.fuel_transaction_id = $${values.length}::uuid`);
  }
  const where = filters.join(" AND ");
  const total = (
    await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM fuel.fuel_assignment_questions q WHERE ${where}`, values)
  ).rows[0]?.n ?? 0;
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  values.push(limit, offset);
  const rows = (
    await client.query<FuelAssignmentQuestionRow>(
      `SELECT q.id::text, q.operating_company_id::text, q.fuel_transaction_id::text, q.status,
              q.fill_moment_at::text, q.fill_moment_ct, q.station, q.gallons::text, q.amount_cents::text,
              q.card_unit_id::text, q.card_unit_number, q.card_driver_id::text, q.card_driver_name,
              q.evidence, q.proposed_unit_id::text, q.proposed_unit_number, q.proposed_load_id::text,
              q.proposed_load_number, q.proposed_settlement_ref, q.proposed_why,
              q.answer_kind, q.answered_unit_id::text, q.answered_load_id::text, q.answer_reason,
              q.answered_by_user_id::text, q.answered_at::text, q.created_at::text, q.updated_at::text
         FROM fuel.fuel_assignment_questions q
        WHERE ${where}
        ORDER BY q.created_at DESC, q.id
        LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    )
  ).rows;
  return { rows: rows.map((r) => normalizeQuestionRow(r)), total };
}

export async function countOpenFuelAssignmentQuestions(client: DbClient, companyId: string): Promise<number> {
  return (
    await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM fuel.fuel_assignment_questions
        WHERE operating_company_id = $1::uuid AND status = 'open'`,
      [companyId]
    )
  ).rows[0]?.n ?? 0;
}

export async function getFuelAssignmentQuestion(
  client: DbClient,
  companyId: string,
  id: string
): Promise<FuelAssignmentQuestionRow | null> {
  const { rows } = await listFuelAssignmentQuestions(client, { companyId, status: "all", limit: 1 });
  void rows;
  const row = (
    await client.query<FuelAssignmentQuestionRow>(
      `SELECT q.id::text, q.operating_company_id::text, q.fuel_transaction_id::text, q.status,
              q.fill_moment_at::text, q.fill_moment_ct, q.station, q.gallons::text, q.amount_cents::text,
              q.card_unit_id::text, q.card_unit_number, q.card_driver_id::text, q.card_driver_name,
              q.evidence, q.proposed_unit_id::text, q.proposed_unit_number, q.proposed_load_id::text,
              q.proposed_load_number, q.proposed_settlement_ref, q.proposed_why,
              q.answer_kind, q.answered_unit_id::text, q.answered_load_id::text, q.answer_reason,
              q.answered_by_user_id::text, q.answered_at::text, q.created_at::text, q.updated_at::text
         FROM fuel.fuel_assignment_questions q
        WHERE q.operating_company_id = $1::uuid AND q.id = $2::uuid`,
      [companyId, id]
    )
  ).rows[0];
  return row ? normalizeQuestionRow(row) : null;
}

export type AnswerKind = "confirm_proposed" | "pick_other" | "keep_card_truck";

export async function answerFuelAssignmentQuestion(
  client: DbClient,
  input: {
    companyId: string;
    actorUserId: string;
    questionId: string;
    kind: AnswerKind;
    unitId?: string | null;
    loadId?: string | null;
    reason?: string | null;
  }
): Promise<{ question: FuelAssignmentQuestionRow; outcome: string } | { error: string }> {
  const q = await getFuelAssignmentQuestion(client, input.companyId, input.questionId);
  if (!q) return { error: "question_not_found" };
  // OWNER RULING 443.288-B — a dispatcher / the closer answering the question IS the person confirming the fill's load.
  await markExpenseLoadConfirmedBy(client as never, input.actorUserId);
  if (q.status !== "open") return { error: "question_not_open" };

  let unitId = input.unitId ?? null;
  let loadId = input.loadId ?? null;
  let reason = (input.reason ?? "").trim();

  if (input.kind === "confirm_proposed") {
    unitId = q.proposed_unit_id;
    loadId = q.proposed_load_id;
    reason = reason || `Confirmed proposed: truck ${q.proposed_unit_number} / load ${q.proposed_load_number}`;
  } else if (input.kind === "keep_card_truck") {
    if (reason.length < 3) return { error: "reason_required_for_keep_card_truck" };
    unitId = q.card_unit_id;
    if (!loadId && unitId && q.fill_moment_at) {
      const l = await resolveFuelLoadAtTime(client as never, {
        operatingCompanyId: input.companyId,
        unitId,
        driverId: null,
        at: q.fill_moment_at,
      });
      loadId = l?.load_id ?? null;
    }
    if (!loadId) loadId = q.proposed_load_id;
  } else {
    // pick_other
    if (!unitId || !loadId) return { error: "unit_and_load_required_for_pick_other" };
    if (reason.length < 3) return { error: "reason_required_for_pick_other" };
  }

  if (!loadId) return { error: "load_required" };

  const loadNumber = (
    await client.query<{ n: string | null }>(`SELECT load_number::text AS n FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [loadId, input.companyId])
  ).rows[0]?.n ?? null;

  const res = await resolveFillTruckAndLoad(client, input.companyId, q.fuel_transaction_id);
  if (!res) return { error: "fuel_not_found" };

  const outcome = await applyFillTruckAndLoad(client, {
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    fuelId: q.fuel_transaction_id,
    toLoadId: loadId,
    toLoadNumber: loadNumber,
    toUnitId: unitId,
    reason: `LEAD 443.243 answer (${input.kind}) — ${reason}`,
    resolution: {
      ...res,
      truck_resolution: `answered:${input.kind}`,
      load_resolution: res.load_resolution,
    },
  });

  const updated = (
    await client.query<FuelAssignmentQuestionRow>(
      `UPDATE fuel.fuel_assignment_questions
          SET status = 'answered',
              answer_kind = $3,
              answered_unit_id = $4::uuid,
              answered_load_id = $5::uuid,
              answer_reason = $6,
              answered_by_user_id = $7::uuid,
              answered_at = now(),
              updated_at = now()
        WHERE id = $2::uuid AND operating_company_id = $1::uuid AND status = 'open'
        RETURNING id::text, operating_company_id::text, fuel_transaction_id::text, status,
                  fill_moment_at::text, fill_moment_ct, station, gallons::text, amount_cents::text,
                  card_unit_id::text, card_unit_number, card_driver_id::text, card_driver_name,
                  evidence, proposed_unit_id::text, proposed_unit_number, proposed_load_id::text,
                  proposed_load_number, proposed_settlement_ref, proposed_why,
                  answer_kind, answered_unit_id::text, answered_load_id::text, answer_reason,
                  answered_by_user_id::text, answered_at::text, created_at::text, updated_at::text`,
      [input.companyId, input.questionId, input.kind, unitId, loadId, reason, input.actorUserId]
    )
  ).rows[0];
  if (!updated) return { error: "answer_race" };

  await appendCrudAudit(
    client as never,
    input.actorUserId,
    "fuel.assignment_question_answered",
    {
      operating_company_id: input.companyId,
      question_id: updated.id,
      fuel_id: q.fuel_transaction_id,
      kind: input.kind,
      unit_id: unitId,
      load_id: loadId,
      reason,
      outcome,
    },
    "info",
    "LEAD-443.243"
  );
  return { question: normalizeQuestionRow(updated), outcome };
}
