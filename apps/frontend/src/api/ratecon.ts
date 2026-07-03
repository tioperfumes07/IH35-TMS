import { apiRequest } from "./client";

// RATECON-1 — client for the rate-con extraction endpoint. Mirrors the backend RateConExtraction shape.
export type Confidence = "high" | "medium" | "low";

export type RateConStop = {
  type: "pickup" | "delivery";
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  date: string | null;
  time_window: string | null;
  appointment_required: boolean | null;
};

export type RateConExtraction = {
  broker: {
    name: string | null;
    mc_number: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    contact_name: string | null;
  };
  load_reference: string[];
  stops: RateConStop[];
  equipment: string | null;
  commodity: string | null;
  weight: string | null;
  rate: {
    linehaul_cents: number | null;
    fuel_surcharge_cents: number | null;
    accessorials: Array<{ label: string; amount_cents: number }>;
    total_cents: number | null;
  };
  payment_terms: string | null;
  notes: string | null;
  field_confidence: Record<string, Confidence>;
};

export type RateConExtractResponse = {
  extraction_id: string;
  extraction: RateConExtraction;
  total_matches_components: boolean;
  page_count: number | null;
  duplicate_of: { file_id: string; load_id: string } | null;
};

/** Extract an already-uploaded rate-con PDF. Returns 409 (thrown by apiRequest) when the flag is OFF. */
export function extractRateCon(operatingCompanyId: string, fileId: string) {
  return apiRequest<RateConExtractResponse>("/api/v1/dispatch/ratecon/extract", {
    method: "POST",
    body: { operating_company_id: operatingCompanyId, file_id: fileId },
  });
}
