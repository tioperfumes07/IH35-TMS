// Full dispatch load update (Block 06, Inc 2). Edits an existing load the way it was booked — scalar
// fields, a stops "replace", and charges (-> rate_total_cents) — with HARD money-safety + legal-evidence
// guards that match McLeod/Alvys-grade behavior:
//   • A load attached to an OPEN load-bookended driver settlement, an ISSUED (non-draft) customer
//     invoice, or a NON-OPEN driver bill is LOCKED — the whole edit is rejected (409) so we never
//     mutate revenue/pay behind posted money. (Read-only guards; we never write accounting.*.)
//   • Stops are NEVER hard-deleted: mdata.load_stops has CASCADE children that hold legal evidence
//     (stop arrivals, detention events, POD/BOL). We UPDATE kept stops in place (preserving the row +
//     its evidence) and ARCHIVE removed stops via status='cancelled'. No DELETE, ever.
// No migration: every column already exists. This file writes only mdata.loads + mdata.load_stops.
import { appendCrudAudit } from "../audit/crud-audit.js";
import { bookLoadRateTotalCents } from "./book-load-accessorial.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type UpdateLoadCharge = { code: string; amount_cents: number };

export type UpdateLoadStopInput = {
  stop_type: string;
  location_id?: string | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  scheduled_arrival_at?: string | null;
  time_window_type?: string | null;
  appointment_start_at?: string | null;
  appointment_end_at?: string | null;
  lumper_required?: boolean;
  lumper_paid_by?: string | null;
  lumper_amount_cents?: number;
  is_tarp_stop?: boolean;
  tarp_count?: number;
  stop_notes?: string | null;
  site_contact_name?: string | null;
  site_contact_phone?: string | null;
  gate_dock_text?: string | null;
};

// Scalar load fields editable via the wizard. Status is intentionally EXCLUDED — it flows through the
// dedicated /transition state machine. load_number / booking provenance are immutable.
export type UpdateDispatchLoadFields = Partial<{
  customer_id: string;
  assigned_unit_id: string | null;
  assigned_primary_driver_id: string | null;
  assigned_secondary_driver_id: string | null;
  team_id: string | null;
  notes: string | null;
  requires_tarps: boolean;
  tarp_type: string | null;
  lumper_amount_cents: number;
  customer_chargeback_requested: boolean;
  customer_chargeback_reason: string | null;
  live_load_number: string | null;
  driver_instructions_text: string | null;
  anticipated_chargeback_cents: number | null;
  anticipated_chargeback_reason: string | null;
  detention_expected_y_n: boolean;
  detention_expected_hours: number | null;
  detention_bill_customer_per_hour_cents: number | null;
  detention_driver_pay_per_hour_cents: number | null;
  late_delivery_risk_y_n: boolean;
  late_delivery_est_deduction_cents: number | null;
  late_delivery_reason: string | null;
  miles_practical: number | null;
  miles_shortest: number | null;
  miles_deadhead: number | null;
  customer_wo_number: string | null;
  pickup_number: string | null;
  border_routing: string | null;
  trip_type: "NB" | "TR" | "SB";
  tour_id: string | null;
  // Block 7 (Jorge-approved, no migration): freight attributes round-tripped from the Edit wizard.
  commodity: string | null;
  cargo_weight_lbs: number | null;
  reefer_setpoint_temp_f: number | null;
}>;

export type UpdateDispatchLoadInput = {
  loadId: string;
  operatingCompanyId: string;
  requestingUserUuid: string;
  fields: UpdateDispatchLoadFields;
  charges?: UpdateLoadCharge[];
  stops?: UpdateLoadStopInput[];
};

export class LoadNotFoundError extends Error {
  constructor() {
    super("load_not_found");
    this.name = "LoadNotFoundError";
  }
}

export type LoadEditLock = {
  reason: "open_settlement" | "issued_invoice" | "driver_bill_locked";
  detail: string;
  reference_id: string | null;
  reference_display_id: string | null;
};

export class LoadEditLockedError extends Error {
  readonly lock: LoadEditLock;
  constructor(lock: LoadEditLock) {
    super(lock.reason);
    this.name = "LoadEditLockedError";
    this.lock = lock;
  }
}

// Map our scalar field -> mdata.loads column. (Names verified against the bookLoad INSERT.)
const SCALAR_COLUMNS: Record<keyof UpdateDispatchLoadFields, string> = {
  customer_id: "customer_id",
  assigned_unit_id: "assigned_unit_id",
  assigned_primary_driver_id: "assigned_primary_driver_id",
  assigned_secondary_driver_id: "assigned_secondary_driver_id",
  team_id: "team_id",
  notes: "notes",
  requires_tarps: "requires_tarps",
  tarp_type: "tarp_type",
  lumper_amount_cents: "lumper_amount_cents",
  customer_chargeback_requested: "customer_chargeback_requested",
  customer_chargeback_reason: "customer_chargeback_reason",
  live_load_number: "live_load_number",
  driver_instructions_text: "driver_instructions_text",
  anticipated_chargeback_cents: "anticipated_chargeback_cents",
  anticipated_chargeback_reason: "anticipated_chargeback_reason",
  detention_expected_y_n: "detention_expected_y_n",
  detention_expected_hours: "detention_expected_hours",
  detention_bill_customer_per_hour_cents: "detention_bill_customer_per_hour_cents",
  detention_driver_pay_per_hour_cents: "detention_driver_pay_per_hour_cents",
  late_delivery_risk_y_n: "late_delivery_risk_y_n",
  late_delivery_est_deduction_cents: "late_delivery_est_deduction_cents",
  late_delivery_reason: "late_delivery_reason",
  miles_practical: "miles_practical",
  miles_shortest: "miles_shortest",
  miles_deadhead: "miles_deadhead",
  customer_wo_number: "customer_wo_number",
  pickup_number: "pickup_number",
  border_routing: "border_routing",
  trip_type: "trip_type",
  tour_id: "tour_id",
  commodity: "commodity",
  cargo_weight_lbs: "cargo_weight_lbs",
  reefer_setpoint_temp_f: "reefer_setpoint_temp_f",
};

// Columns needing an explicit cast in the SET clause.
const COLUMN_CAST: Partial<Record<string, string>> = {
  trip_type: "::mdata.trip_type_enum",
  tour_id: "::uuid",
};

function normalizeStopTimeWindow(raw: string | null | undefined): string {
  if (raw === "first_come_first_serve") return "open_window";
  if (raw === "drop_window") return "select_hours";
  if (raw === "open_window" || raw === "select_hours" || raw === "refused" || raw === "appointment") return raw;
  return "appointment";
}

// Detect the FIRST money/evidence lock on a load. Read-only — never writes accounting.*.
async function detectLoadEditLock(
  client: DbClient,
  operatingCompanyId: string,
  loadId: string
): Promise<LoadEditLock | null> {
  // 1) Open load-bookended driver settlement (trip not yet closed) bookending this load.
  const settlement = await client.query<{ id: string; display_id: string | null }>(
    `
      SELECT s.id::text AS id, s.display_id
      FROM driver_finance.driver_settlements s
      WHERE s.operating_company_id = $1::uuid
        AND s.settlement_model = 'load_bookended'
        AND (s.first_load_id = $2::uuid OR s.last_load_id = $2::uuid)
        AND s.trip_closed_at IS NULL
      LIMIT 1
    `,
    [operatingCompanyId, loadId]
  );
  if (settlement.rows[0]) {
    return {
      reason: "open_settlement",
      detail: "An open driver settlement bookends this load. Close the settlement before editing.",
      reference_id: settlement.rows[0].id,
      reference_display_id: settlement.rows[0].display_id ?? null,
    };
  }

  // 2) Issued (non-draft, non-void) customer invoice sourced from this load.
  const invoice = await client.query<{ id: string; display_id: string | null }>(
    `
      SELECT i.id::text AS id, i.display_id
      FROM accounting.invoices i
      WHERE i.operating_company_id = $1::uuid
        AND i.source_load_id = $2::uuid
        AND i.status IN ('sent', 'partial', 'paid', 'factored')
      LIMIT 1
    `,
    [operatingCompanyId, loadId]
  );
  if (invoice.rows[0]) {
    return {
      reason: "issued_invoice",
      detail: "A customer invoice has already been issued for this load. Void/adjust the invoice first.",
      reference_id: invoice.rows[0].id,
      reference_display_id: invoice.rows[0].display_id ?? null,
    };
  }

  // 3) A driver bill for this load that has moved past 'open' (approved/paid/etc.).
  const bill = await client.query<{ id: string }>(
    `
      SELECT b.id::text AS id
      FROM driver_finance.driver_bills b
      WHERE b.operating_company_id = $1::uuid
        AND b.load_id = $2::uuid
        AND b.status <> 'open'
      LIMIT 1
    `,
    [operatingCompanyId, loadId]
  );
  if (bill.rows[0]) {
    return {
      reason: "driver_bill_locked",
      detail: "A driver bill for this load is already approved/paid. Reverse the bill before editing.",
      reference_id: bill.rows[0].id,
      reference_display_id: null,
    };
  }

  return null;
}

// Replace a load's stops WITHOUT destroying evidence: UPDATE kept stops in place (sequence 1..N) and
// ARCHIVE any extra existing stop (sequence > N) via status='cancelled'. Returns counts for the audit.
async function replaceStops(
  client: DbClient,
  loadId: string,
  stops: UpdateLoadStopInput[]
): Promise<{ updated: number; inserted: number; archived: number }> {
  const existing = await client.query<{ id: string; sequence_number: number }>(
    `SELECT id::text, sequence_number FROM mdata.load_stops WHERE load_id = $1::uuid ORDER BY sequence_number ASC`,
    [loadId]
  );
  const existingBySeq = new Map<number, string>(existing.rows.map((r) => [Number(r.sequence_number), r.id]));

  let updated = 0;
  let inserted = 0;
  for (let i = 0; i < stops.length; i += 1) {
    const seq = i + 1;
    const stop = stops[i];
    const tw = normalizeStopTimeWindow(stop.time_window_type);
    const existingId = existingBySeq.get(seq);
    if (existingId) {
      // UPDATE in place — preserves the row id and every CASCADE child (arrivals, detention, POD/BOL).
      // A previously archived stop reused at this position is reactivated to 'pending'.
      await client.query(
        `
          UPDATE mdata.load_stops SET
            stop_type = $2, location_id = $3, address_line1 = $4, city = $5, state = $6, country = $7,
            scheduled_arrival_at = $8, time_window_type = $9, appointment_start_at = $10, appointment_end_at = $11,
            lumper_required = $12, lumper_paid_by = $13, lumper_amount_cents = $14, is_tarp_stop = $15,
            tarp_count = $16, stop_notes = $17, site_contact_name = $18, site_contact_phone = $19,
            gate_dock_text = $20,
            status = CASE WHEN status = 'cancelled' THEN 'pending' ELSE status END,
            updated_at = now()
          WHERE id = $1::uuid
        `,
        [
          existingId,
          stop.stop_type,
          stop.location_id ?? null,
          stop.address_line1 ?? null,
          stop.city ?? null,
          stop.state ?? null,
          stop.country ?? null,
          stop.scheduled_arrival_at ?? null,
          tw,
          stop.appointment_start_at ?? null,
          stop.appointment_end_at ?? null,
          Boolean(stop.lumper_required),
          stop.lumper_paid_by ?? "unknown",
          stop.lumper_amount_cents ?? 0,
          Boolean(stop.is_tarp_stop),
          stop.tarp_count ?? 0,
          stop.stop_notes ?? null,
          stop.site_contact_name ?? null,
          stop.site_contact_phone ?? null,
          stop.gate_dock_text ?? null,
        ]
      );
      updated += 1;
    } else {
      await client.query(
        `
          INSERT INTO mdata.load_stops (
            load_id, sequence_number, stop_type, location_id, address_line1, city, state, country, scheduled_arrival_at, status,
            time_window_type, appointment_start_at, appointment_end_at, lumper_required, lumper_paid_by, lumper_amount_cents, is_tarp_stop, tarp_count, stop_notes,
            site_contact_name, site_contact_phone, gate_dock_text
          )
          VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        `,
        [
          loadId,
          seq,
          stop.stop_type,
          stop.location_id ?? null,
          stop.address_line1 ?? null,
          stop.city ?? null,
          stop.state ?? null,
          stop.country ?? null,
          stop.scheduled_arrival_at ?? null,
          tw,
          stop.appointment_start_at ?? null,
          stop.appointment_end_at ?? null,
          Boolean(stop.lumper_required),
          stop.lumper_paid_by ?? "unknown",
          stop.lumper_amount_cents ?? 0,
          Boolean(stop.is_tarp_stop),
          stop.tarp_count ?? 0,
          stop.stop_notes ?? null,
          stop.site_contact_name ?? null,
          stop.site_contact_phone ?? null,
          stop.gate_dock_text ?? null,
        ]
      );
      inserted += 1;
    }
  }

  // Archive (never delete) any existing stop beyond the new length. Count first via SELECT (an UPDATE
  // exposes no row count on this client shape, and UPDATE...RETURNING can trip the RLS soft-delete
  // landmine), then archive.
  const toArchive = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.load_stops WHERE load_id = $1::uuid AND sequence_number > $2 AND status <> 'cancelled'`,
    [loadId, stops.length]
  );
  if (toArchive.rows.length > 0) {
    await client.query(
      `
        UPDATE mdata.load_stops
        SET status = 'cancelled', updated_at = now()
        WHERE load_id = $1::uuid AND sequence_number > $2 AND status <> 'cancelled'
      `,
      [loadId, stops.length]
    );
  }

  return { updated, inserted, archived: toArchive.rows.length };
}

export type UpdateDispatchLoadResult = {
  load: Record<string, unknown>;
  stops: Record<string, unknown>[];
};

export async function updateDispatchLoad(
  client: DbClient,
  input: UpdateDispatchLoadInput
): Promise<UpdateDispatchLoadResult> {
  const { loadId, operatingCompanyId, requestingUserUuid } = input;

  // 1) Existing load (entity-scoped, not soft-deleted).
  const existing = await client.query<Record<string, unknown>>(
    `SELECT * FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL LIMIT 1`,
    [loadId, operatingCompanyId]
  );
  const old = existing.rows[0];
  if (!old) throw new LoadNotFoundError();

  // 2) Money/evidence lock — reject the whole edit if posted money depends on this load.
  const lock = await detectLoadEditLock(client, operatingCompanyId, loadId);
  if (lock) throw new LoadEditLockedError(lock);

  // 3) Scalar fields — build the SET clause from present keys only (lockstep values/placeholders).
  const fields = input.fields ?? {};
  const setParts: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown, cast = "") => {
    values.push(value);
    setParts.push(`${column} = $${values.length}${cast}`);
  };
  for (const key of Object.keys(fields) as (keyof UpdateDispatchLoadFields)[]) {
    const column = SCALAR_COLUMNS[key];
    if (!column) continue;
    add(column, fields[key] ?? null, COLUMN_CAST[column] ?? "");
  }
  // Charges -> rate_total_cents (single source of truth; there is no separate charge table).
  let rateChanged = false;
  if (input.charges) {
    const total = bookLoadRateTotalCents(input.charges);
    if (Number(old.rate_total_cents ?? 0) !== total) rateChanged = true;
    add("rate_total_cents", total);
  }

  if (setParts.length > 0) {
    add("updated_by_user_id", requestingUserUuid);
    setParts.push(`updated_at = now()`);
    values.push(loadId, operatingCompanyId);
    await client.query(
      `UPDATE mdata.loads SET ${setParts.join(", ")}
        WHERE id = $${values.length - 1}::uuid AND operating_company_id = $${values.length}::uuid AND soft_deleted_at IS NULL`,
      values
    );
  }

  // 4) Stops replace (evidence-safe).
  let stopSummary: { updated: number; inserted: number; archived: number } | null = null;
  if (input.stops) {
    stopSummary = await replaceStops(client, loadId, input.stops);
  }

  // 5) Re-read load + active stops.
  const updatedLoadRes = await client.query<Record<string, unknown>>(
    `SELECT * FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [loadId, operatingCompanyId]
  );
  const updatedStopsRes = await client.query<Record<string, unknown>>(
    `SELECT * FROM mdata.load_stops WHERE load_id = $1::uuid AND status <> 'cancelled' ORDER BY sequence_number ASC`,
    [loadId]
  );

  // 6) Audit — record what changed (field keys, rate change, stop counts).
  await appendCrudAudit(
    client,
    requestingUserUuid,
    "dispatch.load.patched",
    {
      resource_type: "mdata.loads",
      resource_id: loadId,
      changed_fields: Object.keys(fields),
      rate_total_changed: rateChanged,
      stops: stopSummary,
    },
    "info",
    "P6-BLOCK06-LOAD-PATCH"
  );

  return { load: updatedLoadRes.rows[0] ?? old, stops: updatedStopsRes.rows };
}
