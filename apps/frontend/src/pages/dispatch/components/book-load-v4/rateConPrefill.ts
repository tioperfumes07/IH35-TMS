// RATECON-1 — convert an AI rate-con extraction into the Book Load wizard's templatePrefillJson seam
// (the same mechanism templates/OCR use, applied by applyLoadTemplateToBookForm). Pure + unit-tested.
// Everything lands as EDITABLE draft values — the dispatcher confirms every field; nothing auto-books.
import type { RateConExtraction } from "../../../../api/ratecon";

export type RateConPrefill = {
  json: Record<string, unknown>; // fed to applyLoadTemplateToBookForm (MinimalBookForm-shaped)
  // RATECON-4/5 — full broker payload carried for fuzzy-match AND profile enrichment (RATECON-5 fills the
  // empty mdata.customers profile + inserts the after-hours customer_contacts row from these).
  brokerMatch: {
    name: string | null;
    mc_number: string | null;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
    after_hours_phone: string | null;
    after_hours_email: string | null;
    invoice_to_email: string | null;
    address: string | null;
    detention_rate_per_hour_cents: number | null;
    detention_free_hours: number | null;
    layover_per_day_cents: number | null;
  };
  lowConfidenceFields: string[]; // fields the model was unsure about — flag for review in the UI
};

/** Sum accessorial cents (already integer cents from the backend). */
function accessorialCents(e: RateConExtraction): number {
  return e.rate.accessorials.reduce((a, x) => a + (Number.isInteger(x.amount_cents) ? x.amount_cents : 0), 0);
}

/** One editable accessorial ROW per extracted accessorial (never collapsed into a single line). Code is
 *  derived from the label; description keeps the label verbatim; zero/invalid amounts are dropped. */
function accessorialLines(e: RateConExtraction): Array<{ code: string; description: string; amount_cents: number }> {
  return e.rate.accessorials
    .filter((a) => Number.isInteger(a.amount_cents) && a.amount_cents > 0)
    .map((a) => {
      const label = (a.label ?? "").trim();
      const code = label.toUpperCase().replace(/[^\w \-]/g, "").trim().slice(0, 60) || "ACCESSORIAL";
      return { code, description: label || "Accessorial", amount_cents: a.amount_cents };
    });
}

/** Best-effort map of the extracted free-text equipment to the wizard's trailer_type enum. Undefined when
 *  it can't be confidently classified — the dispatcher then picks it (no bad value is forced). */
function equipmentToTrailerType(equipment: string | null): string | undefined {
  if (!equipment) return undefined;
  const e = equipment.toLowerCase();
  if (/reefer|refriger|temp|frozen|fresh/.test(e)) return "refrigerated_van";
  if (/flat ?bed|flat|step ?deck/.test(e)) return "flatbed";
  if (/low ?boy|rgn/.test(e)) return "lowboy";
  if (/power ?only/.test(e)) return "power_only_no_trailer";
  if (/dry ?van|\bvan\b|\bdv\b/.test(e)) return "dry_van";
  return undefined;
}

/** Fallback for when the model fuses city/state/zip into the street address ("695 Summa Ave, Amityville,
 *  NY 11701") instead of splitting them. Pulls the "City, ST ZIP" tail off the end so §C's City/State/Zip
 *  fields still populate. Returns the cleaned street line + any recovered parts (null when nothing matched;
 *  the street is then returned unchanged). Purely additive — only used to fill parts the model left empty. */
export function splitAddressTail(address: string | null | undefined): {
  line1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  const raw = (address ?? "").trim();
  if (!raw) return { line1: "", city: null, state: null, zip: null };
  // "<street>, <City>, <ST> <ZIP>" — ST is a 2-letter code; ZIP optional (5 or 5-4). Requires a non-empty
  // street before the tail so a bare "City, ST" isn't mistaken for a street.
  const m = raw.match(/^(.*?),\s*([A-Za-z][A-Za-z .'-]+?),\s*([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)?\s*$/);
  if (m && m[1].trim()) {
    return { line1: m[1].trim(), city: m[2].trim() || null, state: m[3].toUpperCase(), zip: m[4] || null };
  }
  return { line1: raw, city: null, state: null, zip: null };
}

/** Map an extracted stop to the wizard's BookStop-ish shape. Appointment_required → time_window_type.
 *  When the model didn't split city out of the address, recover it from the address tail. */
function toBookStop(s: RateConExtraction["stops"][number], index: number) {
  const hasCity = Boolean(s.city && s.city.trim());
  const parsed = hasCity ? null : splitAddressTail(s.address);
  const recovered = parsed && parsed.city ? parsed : null;
  const zip = s.zip ?? recovered?.zip ?? null;
  return {
    stop_type: s.type === "delivery" ? "delivery" : "pickup",
    sequence_number: index + 1,
    city: s.city ?? recovered?.city ?? "",
    state: s.state ?? recovered?.state ?? "",
    country: "US",
    address_line1: recovered ? recovered.line1 : s.address ?? "",
    // RATECON-4 — zip is now a first-class stop field (was buried in stop_notes), applied to the stop's
    // ZIP input in the wizard. Keep the site name + time window in stop_notes (unmapped context only).
    zip: zip ?? "",
    pickup_number: s.pickup_number ?? "",
    po_number: s.po_number ?? "",
    scheduled_arrival_at: s.date ?? "",
    time_window_type: s.appointment_required ? "appointment" : "open_window",
    stop_notes: [s.name, s.time_window].filter(Boolean).join(" · ") || undefined,
  };
}

export function rateConExtractionToPrefill(e: RateConExtraction): RateConPrefill {
  const lowConfidenceFields = Object.entries(e.field_confidence ?? {})
    .filter(([, c]) => c === "low")
    .map(([k]) => k);

  // RATECON-4 — mapped fields (commodity/weight/pieces/refs) now land in their OWN wizard inputs, so the
  // notes blob only carries what has no dedicated field left (equipment + payment_terms as context). The
  // dispatcher still sees + edits everything; nothing is lost.
  const notes = [
    e.notes,
    e.equipment ? `Equipment: ${e.equipment}` : null,
    e.payment_terms ? `Terms: ${e.payment_terms}` : null,
  ].filter(Boolean).join("\n");

  // RATECON-4 — split load_reference: a shipment/SS-load number → Pickup #; the other → Customer WO #.
  // Prefer a per-stop pickup_number when the model captured one on the pickup stop.
  const pickupStop = e.stops.find((s) => s.type === "pickup");
  const ssRef = e.load_reference.find((r) => /^ss[-\s]/i.test(r)) ?? null;
  const otherRef = e.load_reference.find((r) => r !== ssRef) ?? null;
  const pickupNumber = (pickupStop?.pickup_number ?? "").trim() || ssRef || e.load_reference[1] || "";
  const customerWo = otherRef ?? e.load_reference.find((r) => r !== pickupNumber) ?? e.load_reference[0] ?? "";

  const json: Record<string, unknown> = {
    // customer_id intentionally omitted — resolved by broker fuzzy-match against mdata.customers, or the
    // inline "+ Add new" mini-create prefilled with brokerMatch.
    customer_name: e.broker.name ?? "",
    linehaul_cents: e.rate.linehaul_cents ?? 0,
    fuel_surcharge_cents: e.rate.fuel_surcharge_cents ?? 0,
    accessorial_cents: accessorialCents(e), // retained for the legacy single-line fallback
    accessorial_lines: accessorialLines(e), // one editable row per extracted accessorial
    // RATECON-4 — dedicated fields (were previously dropped into the notes blob only):
    commodity: e.commodity ?? "",
    weight_lbs: e.total_weight_lbs ?? undefined, // number input; undefined leaves it blank rather than 0
    pieces: e.pieces_count != null ? `${e.pieces_count}${e.pieces_unit ? ` ${e.pieces_unit}` : ""}` : "",
    pickup_number: pickupNumber,
    customer_wo_number: customerWo,
    notes,
    stops: e.stops.map(toBookStop),
  };
  const trailerType = equipmentToTrailerType(e.equipment);
  if (trailerType) json.trailer_type = trailerType;

  return {
    json,
    brokerMatch: {
      name: e.broker.name,
      mc_number: e.broker.mc_number,
      contact_name: e.broker.contact_name,
      phone: e.broker.phone,
      email: e.broker.email,
      after_hours_phone: e.broker.after_hours_phone,
      after_hours_email: e.broker.after_hours_email,
      invoice_to_email: e.invoice_to_email,
      address: e.broker.address,
      detention_rate_per_hour_cents: e.terms.detention_rate_per_hour_cents,
      detention_free_hours: e.terms.detention_free_hours,
      layover_per_day_cents: e.terms.layover_per_day_cents,
    },
    lowConfidenceFields,
  };
}
