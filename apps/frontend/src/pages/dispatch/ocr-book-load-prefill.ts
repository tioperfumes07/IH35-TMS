import type { OcrIntakeQueueItem } from "../../api/dispatch";

/** Maps OCR queue extraction to Book Load template JSON (B21-D7 — no BookLoadModal internals). */
export function buildTemplateJsonFromOcrItem(item: OcrIntakeQueueItem): Record<string, unknown> {
  const f = item.extracted_fields ?? {};
  const linehaul = Number(f.rate_cents ?? 0);
  const pickup = f.pickup_date ? `${f.pickup_date}T12:00:00.000Z` : "";
  const delivery = f.delivery_date ? `${f.delivery_date}T12:00:00.000Z` : "";
  return {
    customer_id: f.customer_id ?? "",
    customer_name: f.customer_name_raw ?? "",
    linehaul_cents: linehaul,
    fuel_surcharge_cents: 0,
    accessorial_cents: 0,
    notes: f.load_number_external ? `OCR ref ${f.load_number_external}` : "OCR intake queue",
    ocr_source_pdf_r2_key: f.ocr_source_pdf_r2_key ?? item.source_pdf_r2_key,
    stops: [
      {
        stop_type: "pickup",
        sequence_number: 1,
        city: f.origin_city ?? "",
        state: f.origin_state ?? "",
        country: "USA",
        address_line1: "",
        scheduled_arrival_at: pickup,
        time_window_type: "appointment",
      },
      {
        stop_type: "delivery",
        sequence_number: 2,
        city: f.destination_city ?? "",
        state: f.destination_state ?? "",
        country: "USA",
        address_line1: "",
        scheduled_arrival_at: delivery,
        time_window_type: "appointment",
      },
    ],
  };
}
