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
    accessorial_cents: accessorialCents(e), // retained for the legacy single-line fallback
    accessorial_lines: accessorialLines(e), // one editable row per extracted accessorial
    notes,
    stops: e.stops.map(toBookStop),
  };
  const trailerType = equipmentToTrailerType(e.equipment);
  if (trailerType) json.trailer_type = trailerType;

  return {
    json,
    brokerMatch: { name: e.broker.name, mc_number: e.broker.mc_number },
    lowConfidenceFields,
  };
}
