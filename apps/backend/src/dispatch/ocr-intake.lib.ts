import type { ParsedRateConfirmation } from "../ocr/ocr.service.js";

export type OcrIntakeStatus = "pending_ocr" | "processing" | "ready_review" | "failed" | "converted" | "archived";

export type OcrIntakeExtractedFields = {
  customer_name_raw?: string;
  customer_id?: string | null;
  origin_city?: string;
  origin_state?: string;
  destination_city?: string;
  destination_state?: string;
  pickup_date?: string;
  delivery_date?: string;
  rate_cents?: number;
  load_number_external?: string;
  confidence_score?: number;
  parser?: string;
  ocr_source_pdf_r2_key?: string;
};

export function parseR2KeyFilename(r2Key: string): string {
  const segment = r2Key.split("/").pop() ?? "";
  return segment.replace(/\.pdf$/i, "");
}

export function buildExtractedFieldsFromParsed(
  parsed: ParsedRateConfirmation,
  r2Key: string
): OcrIntakeExtractedFields {
  return {
    customer_name_raw: parsed.customer_name_raw,
    customer_id: parsed.customer_id,
    origin_city: parsed.origin_city,
    origin_state: parsed.origin_state,
    destination_city: parsed.destination_city,
    destination_state: parsed.destination_state,
    pickup_date: parsed.pickup_date,
    delivery_date: parsed.delivery_date,
    rate_cents: parsed.rate_cents,
    load_number_external: parsed.load_number_external,
    confidence_score: parsed.confidence_score,
    parser: String(parsed.raw_extraction?.parser ?? "ocr_v1"),
    ocr_source_pdf_r2_key: r2Key,
  };
}

export function heuristicExtractFromFilename(filename: string, r2Key: string): OcrIntakeExtractedFields {
  const stem = filename.replace(/\.[^.]+$/, "");
  const parts = stem.split(/[_\-\s]+/).filter(Boolean);
  const maybeRate = parts.find((part) => /^\d{3,6}$/.test(part));
  const rateCents = maybeRate ? Number(maybeRate) * 100 : 0;
  const today = new Date().toISOString().slice(0, 10);
  const deliveryDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const customerRaw = parts.slice(0, Math.min(2, parts.length)).join(" ") || "Unknown Customer";
  return {
    customer_name_raw: customerRaw,
    customer_id: null,
    origin_city: "UNKNOWN",
    origin_state: "TX",
    destination_city: "UNKNOWN",
    destination_state: "TX",
    pickup_date: today,
    delivery_date: deliveryDate,
    rate_cents: rateCents,
    load_number_external: parts.find((part) => /^L?\d{4,}$/.test(part)) ?? "",
    confidence_score: 0.62,
    parser: "filename_heuristic_v1",
    ocr_source_pdf_r2_key: r2Key,
  };
}

export function buildBookLoadPrefillFromExtracted(fields: OcrIntakeExtractedFields): Record<string, unknown> {
  const linehaul = Number(fields.rate_cents ?? 0);
  const pickup = fields.pickup_date ? `${fields.pickup_date}T12:00:00.000Z` : "";
  const delivery = fields.delivery_date ? `${fields.delivery_date}T12:00:00.000Z` : "";
  return {
    customer_id: fields.customer_id ?? "",
    customer_name: fields.customer_name_raw ?? "",
    linehaul_cents: linehaul,
    fuel_surcharge_cents: 0,
    accessorial_cents: 0,
    notes: fields.load_number_external ? `OCR ref ${fields.load_number_external}` : "OCR intake queue",
    ocr_source_pdf_r2_key: fields.ocr_source_pdf_r2_key ?? "",
    stops: [
      {
        stop_type: "pickup",
        sequence_number: 1,
        city: fields.origin_city ?? "",
        state: fields.origin_state ?? "",
        country: "USA",
        address_line1: "",
        scheduled_arrival_at: pickup,
        time_window_type: "appointment",
      },
      {
        stop_type: "delivery",
        sequence_number: 2,
        city: fields.destination_city ?? "",
        state: fields.destination_state ?? "",
        country: "USA",
        address_line1: "",
        scheduled_arrival_at: delivery,
        time_window_type: "appointment",
      },
    ],
  };
}

export function shouldAutoProcessQueueItem(status: OcrIntakeStatus): boolean {
  return status === "pending_ocr";
}
