// RATECON-1 — convert an AI rate-con extraction into the Book Load wizard's templatePrefillJson seam
// (the same mechanism templates/OCR use, applied by applyLoadTemplateToBookForm). Pure + unit-tested.
// Everything lands as EDITABLE draft values — the dispatcher confirms every field; nothing auto-books.
import type { RateConExtraction } from "../../../../api/ratecon";

export type RateConPrefill = {
  json: Record<string, unknown>; // fed to applyLoadTemplateToBookForm (MinimalBookForm-shaped)
  brokerMatch: { name: string | null; mc_number: string | null }; // fuzzy-match target for mdata.customers
  lowConfidenceFields: string[]; // fields the model was unsure about — flag for review in the UI
};

/** Sum accessorial cents (already integer cents from the backend). */
function accessorialCents(e: RateConExtraction): number {
  return e.rate.accessorials.reduce((a, x) => a + (Number.isInteger(x.amount_cents) ? x.amount_cents : 0), 0);
}

/** Map an extracted stop to the wizard's BookStop-ish shape. Appointment_required → time_window_type. */
function toBookStop(s: RateConExtraction["stops"][number], index: number) {
  return {
    stop_type: s.type === "delivery" ? "delivery" : "pickup",
    sequence_number: index + 1,
    city: s.city ?? "",
    state: s.state ?? "",
    country: "US",
    address_line1: s.address ?? "",
    scheduled_arrival_at: s.date ?? "",
    time_window_type: s.appointment_required ? "appointment" : "open_window",
    stop_notes: [s.name, s.zip, s.time_window].filter(Boolean).join(" · ") || undefined,
  };
}

export function rateConExtractionToPrefill(e: RateConExtraction): RateConPrefill {
  const lowConfidenceFields = Object.entries(e.field_confidence ?? {})
    .filter(([, c]) => c === "low")
    .map(([k]) => k);

  const notes = [
    e.notes,
    e.commodity ? `Commodity: ${e.commodity}` : null,
    e.weight ? `Weight: ${e.weight}` : null,
    e.equipment ? `Equipment: ${e.equipment}` : null,
    e.payment_terms ? `Terms: ${e.payment_terms}` : null,
    e.load_reference.length ? `Ref: ${e.load_reference.join(", ")}` : null,
  ].filter(Boolean).join("\n");

  const json: Record<string, unknown> = {
    // customer_id intentionally omitted — resolved by broker fuzzy-match against mdata.customers, or the
    // inline "+ Add new" mini-create prefilled with brokerMatch.
    customer_name: e.broker.name ?? "",
    linehaul_cents: e.rate.linehaul_cents ?? 0,
    fuel_surcharge_cents: e.rate.fuel_surcharge_cents ?? 0,
    accessorial_cents: accessorialCents(e),
    notes,
    stops: e.stops.map(toBookStop),
  };

  return {
    json,
    brokerMatch: { name: e.broker.name, mc_number: e.broker.mc_number },
    lowConfidenceFields,
  };
}
