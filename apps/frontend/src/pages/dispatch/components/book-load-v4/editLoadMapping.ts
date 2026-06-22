/**
 * Block 7 — pure mappers for FULL load edit (Edit opens BookLoadModalV4 pre-filled).
 *
 * SAFETY CONTRACT (GUARD #4/#5, anti-data-loss):
 *  - Only the persisted-and-editable set round-trips: columns that exist on mdata.loads AND the dispatch
 *    PATCH schema accepts. Block 7 (Jorge-approved 2026-06-22, no migration) ADDS commodity, weight
 *    (cargo_weight_lbs), reefer setpoint (reefer_setpoint_temp_f), and trip_type to that set.
 *    Still EXCLUDED (no column / gated / forbidden): load_type, trailer_type, customer_po_number + pieces
 *    (gated migration — see docs/specs/block7-loads-piece-po-migration.md), and HAZMAT (forbidden by §4,
 *    Jorge ruling 2026-06-22). Excluded fields are NEVER prefilled-then-saved and NEVER in the PATCH body.
 *  - buildEditPatchBody sends ONLY fields the user actually changed (react-hook-form dirtyFields). A
 *    field the user didn't touch is absent from the body → the partial-update service leaves it
 *    untouched in the DB (never nulled). charges/stops are sent only if that group is dirty.
 *
 * Kept as pure functions so the anti-data-loss behavior is unit-testable without rendering the modal.
 */
import type { LoadDetail } from "../../../../api/loads";
import { buildBookLoadChargeLines } from "../../../../components/dispatch/accessorial-editor-lib";

type AnyValues = Record<string, unknown>;
type Dirty = Record<string, unknown>;

const str = (v: unknown): string => (v == null ? "" : String(v));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** datetime-local input wants "YYYY-MM-DDTHH:mm" (local); tolerate already-local values. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** LoadDetail → form values for prefill (only the round-trippable set; unpersisted fields left default). */
export function buildEditPrefill(load: LoadDetail): AnyValues {
  const stops = (load.stops ?? []).map((s, i) => ({
    stop_type: s.stop_type === "delivery" ? "delivery" : "pickup",
    sequence_number: s.sequence_number ?? i + 1,
    city: str(s.city),
    state: str(s.state),
    country: str(s.country) || "USA",
    address_line1: str(s.address_line1),
    scheduled_arrival_at: toLocalInput(s.scheduled_arrival_at),
    time_window_type: str(s.time_window_type) || "appointment",
    appointment_start_at: toLocalInput(s.appointment_start_at),
    appointment_end_at: toLocalInput(s.appointment_end_at),
    lumper_required: Boolean(s.lumper_required),
    lumper_paid_by: str(s.lumper_paid_by),
    lumper_amount_cents: num(s.lumper_amount_cents),
    is_tarp_stop: Boolean(s.is_tarp_stop),
    tarp_count: num(s.tarp_count),
    stop_notes: str(s.stop_notes ?? s.notes),
    site_contact_name: str(s.site_contact_name),
    site_contact_phone: str(s.site_contact_phone),
    gate_dock_text: str(s.gate_dock_text),
  }));

  return {
    customer_id: str(load.customer_id),
    customer_name: str(load.customer_name),
    customer_wo_number: str(load.customer_wo_number),
    pickup_number: str(load.pickup_number),
    border_routing: str(load.border_routing),
    notes: str(load.notes),
    driver_instructions_text: str(load.driver_instructions_text),
    // Only the rate TOTAL is stored (no linehaul/fuel/accessorial breakdown) → seed linehaul with the
    // total so the displayed total matches; fuel/accessorial start at 0.
    linehaul_cents: num(load.rate_total_cents),
    fuel_surcharge_cents: 0,
    accessorial_cents: 0,
    accessorial_rows: [],
    requires_tarps: Boolean(load.requires_tarps),
    tarp_type: str(load.tarp_type),
    lumper_amount_cents: num(load.lumper_amount_cents),
    customer_chargeback_requested: Boolean(load.customer_chargeback_requested),
    customer_chargeback_reason: str(load.customer_chargeback_reason),
    live_load_number: str(load.live_load_number),
    anticipated_chargeback_cents: num(load.anticipated_chargeback_cents),
    anticipated_chargeback_reason: str(load.anticipated_chargeback_reason),
    detention_expected_y_n: Boolean(load.detention_expected_y_n),
    detention_expected_hours: num(load.detention_expected_hours),
    detention_bill_customer_per_hour_cents: num(load.detention_bill_customer_per_hour_cents),
    detention_driver_pay_per_hour_cents: num(load.detention_driver_pay_per_hour_cents),
    late_delivery_risk_y_n: Boolean(load.late_delivery_risk_y_n),
    late_delivery_est_deduction_cents: num(load.late_delivery_est_deduction_cents),
    late_delivery_reason: str(load.late_delivery_reason),
    miles_practical: num(load.miles_practical),
    miles_shortest: num(load.miles_shortest),
    miles_deadhead: num(load.miles_deadhead),
    assigned_unit_id: str(load.assigned_unit_id),
    assignment_mode: load.team_id ? "team" : "solo",
    team_id: str(load.team_id),
    assigned_primary_driver_id: str(load.assigned_primary_driver_id),
    assigned_secondary_driver_id: str(load.assigned_secondary_driver_id),
    // Block 7 (Jorge-approved, no migration): freight attributes now round-trip. Weight column is
    // cargo_weight_lbs; reefer setpoint is the numeric reefer_setpoint_temp_f surfaced as text.
    commodity: str(load.commodity),
    weight_lbs: num(load.cargo_weight_lbs),
    reefer_setpoint: str(load.reefer_setpoint_temp_f),
    trip_type: str(load.trip_type),
    stops,
  };
}

// Scalar editable fields: form key → PATCH key + value transform. Unpersisted fields are absent here.
const SCALAR_FIELDS: Array<[string, string, (v: AnyValues) => unknown]> = [
  ["customer_id", "customer_id", (v) => str(v.customer_id) || undefined],
  ["customer_wo_number", "customer_wo_number", (v) => str(v.customer_wo_number) || null],
  ["pickup_number", "pickup_number", (v) => str(v.pickup_number) || null],
  ["border_routing", "border_routing", (v) => str(v.border_routing) || null],
  ["driver_instructions_text", "driver_instructions_text", (v) => str(v.driver_instructions_text) || null],
  ["notes", "notes", (v) => str(v.notes) || null],
  ["requires_tarps", "requires_tarps", (v) => Boolean(v.requires_tarps)],
  ["tarp_type", "tarp_type", (v) => str(v.tarp_type) || null],
  ["lumper_amount_cents", "lumper_amount_cents", (v) => num(v.lumper_amount_cents)],
  ["customer_chargeback_requested", "customer_chargeback_requested", (v) => Boolean(v.customer_chargeback_requested)],
  ["customer_chargeback_reason", "customer_chargeback_reason", (v) => str(v.customer_chargeback_reason) || null],
  ["live_load_number", "live_load_number", (v) => str(v.live_load_number) || null],
  ["anticipated_chargeback_cents", "anticipated_chargeback_cents", (v) => num(v.anticipated_chargeback_cents)],
  ["anticipated_chargeback_reason", "anticipated_chargeback_reason", (v) => str(v.anticipated_chargeback_reason) || null],
  ["detention_expected_y_n", "detention_expected_y_n", (v) => Boolean(v.detention_expected_y_n)],
  ["detention_expected_hours", "detention_expected_hours", (v) => num(v.detention_expected_hours)],
  ["detention_bill_customer_per_hour_cents", "detention_bill_customer_per_hour_cents", (v) => num(v.detention_bill_customer_per_hour_cents)],
  ["detention_driver_pay_per_hour_cents", "detention_driver_pay_per_hour_cents", (v) => num(v.detention_driver_pay_per_hour_cents)],
  ["late_delivery_risk_y_n", "late_delivery_risk_y_n", (v) => Boolean(v.late_delivery_risk_y_n)],
  ["late_delivery_est_deduction_cents", "late_delivery_est_deduction_cents", (v) => num(v.late_delivery_est_deduction_cents)],
  ["late_delivery_reason", "late_delivery_reason", (v) => str(v.late_delivery_reason) || null],
  ["miles_practical", "miles_practical", (v) => num(v.miles_practical)],
  ["miles_shortest", "miles_shortest", (v) => num(v.miles_shortest)],
  ["miles_deadhead", "miles_deadhead", (v) => num(v.miles_deadhead)],
  ["assigned_unit_id", "assigned_unit_id", (v) => str(v.assigned_unit_id) || null],
  // Block 7 (Jorge-approved, no migration). form key → PATCH key (= mdata.loads column) → transform.
  ["commodity", "commodity", (v) => str(v.commodity) || null],
  ["weight_lbs", "cargo_weight_lbs", (v) => {
    const n = Number(v.weight_lbs);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }],
  ["reefer_setpoint", "reefer_setpoint_temp_f", (v) => {
    const s = str(v.reefer_setpoint).trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }],
  // trip_type is a non-nullable enum (NB/TR/SB) — omit (undefined) when blank so it's never cleared to null.
  ["trip_type", "trip_type", (v) => str(v.trip_type) || undefined],
];

const CHARGE_KEYS = ["linehaul_cents", "fuel_surcharge_cents", "accessorial_cents", "accessorial_rows"];
const ASSIGNMENT_KEYS = ["assignment_mode", "assigned_primary_driver_id", "assigned_secondary_driver_id", "team_id"];

/**
 * Form values → PARTIAL PATCH body. operating_company_id is always present (route-required); every
 * other field is included ONLY if the user changed it (dirty), so untouched fields are never sent and
 * therefore never overwritten. Returns the body for PATCH /api/v1/dispatch/loads/:id.
 */
export function buildEditPatchBody(values: AnyValues, dirty: Dirty, operatingCompanyId: string): AnyValues {
  const body: AnyValues = { operating_company_id: operatingCompanyId };
  const isDirty = (k: string) => Boolean((dirty as Record<string, unknown>)[k]);

  for (const [formKey, patchKey, transform] of SCALAR_FIELDS) {
    if (isDirty(formKey)) body[patchKey] = transform(values);
  }

  // Charges (rate) — replace only if the rate inputs changed.
  if (CHARGE_KEYS.some(isDirty)) {
    body.charges = buildBookLoadChargeLines({
      linehaul_cents: num(values.linehaul_cents),
      fuel_surcharge_cents: num(values.fuel_surcharge_cents),
      accessorial_rows: (Array.isArray(values.accessorial_rows) ? values.accessorial_rows : []) as never,
    });
  }

  // Driver/team assignment — send the whole assignment block only if any of it changed (solo/team
  // are mutually exclusive, so they must move together).
  if (ASSIGNMENT_KEYS.some(isDirty)) {
    const mode = values.assignment_mode === "team" ? "team" : "solo";
    body.team_id = mode === "team" ? str(values.team_id) || null : null;
    body.assigned_primary_driver_id = mode === "solo" ? str(values.assigned_primary_driver_id) || null : null;
    body.assigned_secondary_driver_id = mode === "solo" ? str(values.assigned_secondary_driver_id) || null : null;
  }

  // Stops — replace (archive-not-delete on the backend) only if a stop changed. Sent with the FULL
  // editable stop shape (prefilled complete from the enriched detail) so nothing is lost.
  if (isDirty("stops")) {
    const stops = (Array.isArray(values.stops) ? values.stops : []) as AnyValues[];
    body.stops = stops.map((s, i) => ({
      stop_type: s.stop_type === "delivery" ? "delivery" : "pickup",
      sequence_number: i + 1,
      city: str(s.city) || undefined,
      state: str(s.state) || undefined,
      country: str(s.country) || undefined,
      address_line1: str(s.address_line1) || undefined,
      scheduled_arrival_at: s.scheduled_arrival_at ? new Date(String(s.scheduled_arrival_at)).toISOString() : undefined,
      time_window_type: str(s.time_window_type) || undefined,
      appointment_start_at: s.appointment_start_at ? new Date(String(s.appointment_start_at)).toISOString() : undefined,
      appointment_end_at: s.appointment_end_at ? new Date(String(s.appointment_end_at)).toISOString() : undefined,
      lumper_required: Boolean(s.lumper_required),
      lumper_paid_by: str(s.lumper_paid_by) || undefined,
      lumper_amount_cents: num(s.lumper_amount_cents),
      is_tarp_stop: Boolean(s.is_tarp_stop),
      tarp_count: num(s.tarp_count),
      stop_notes: str(s.stop_notes) || undefined,
      site_contact_name: str(s.site_contact_name) || undefined,
      site_contact_phone: str(s.site_contact_phone) || undefined,
      gate_dock_text: str(s.gate_dock_text) || undefined,
    }));
  }

  return body;
}
