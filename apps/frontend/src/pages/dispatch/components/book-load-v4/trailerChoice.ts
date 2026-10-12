/**
 * LEAD 443.107 item 3 (owner, 2026-10-12): Book Load and Edit Load REQUIRE the trailer choice — a company trailer
 * from the equipment list, a customer / shipper trailer by its number, an interchange trailer, or an explicit
 * "No trailer (bobtail / power only)". The server refuses a booking without it (422 trailer_choice_required);
 * this builds the exact `trailer_choice` the server reads, or null while the choice is incomplete.
 */
export type TrailerSource = "owned" | "customer" | "interchange" | "none";

export type TrailerChoicePayload =
  | { kind: "company"; equipment_id: string }
  | { kind: "customer"; trailer_number: string }
  | { kind: "interchange"; non_owned_trailer_id: string }
  | { kind: "none" };

export type TrailerChoiceValues = {
  trailer_source?: string | null;
  assigned_trailer_unit_id?: string | null;
  customer_trailer_number?: string | null;
  interchange_trailer_id?: string | null;
};

export function buildTrailerChoice(values: TrailerChoiceValues): TrailerChoicePayload | null {
  const source = String(values.trailer_source ?? "owned");
  if (source === "none") return { kind: "none" };
  if (source === "customer") {
    const n = String(values.customer_trailer_number ?? "").trim();
    return n ? { kind: "customer", trailer_number: n } : null;
  }
  if (source === "interchange") {
    const id = String(values.interchange_trailer_id ?? "").trim();
    return id ? { kind: "interchange", non_owned_trailer_id: id } : null;
  }
  const id = String(values.assigned_trailer_unit_id ?? "").trim();
  return id ? { kind: "company", equipment_id: id } : null;
}

/** Plain-English reason shown under the Trailer field while the choice is incomplete. */
export const TRAILER_CHOICE_REQUIRED_MESSAGE =
  "Choose the trailer: a company trailer, the customer's trailer number, an interchange trailer, or No trailer (bobtail / power only).";

/** Edit Load prefill from the load's recorded choice (loads.trailer_source + its trailer). */
export function trailerChoicePrefill(load: {
  trailer_source?: string | null;
  assigned_trailer_unit_id?: string | null;
  non_owned_trailer_number?: string | null;
}): { trailer_source: TrailerSource; assigned_trailer_unit_id: string; customer_trailer_number: string; interchange_trailer_id: string } {
  const src = String(load.trailer_source ?? "");
  if (src === "none") return { trailer_source: "none", assigned_trailer_unit_id: "", customer_trailer_number: "", interchange_trailer_id: "" };
  if (src === "customer") {
    return { trailer_source: "customer", assigned_trailer_unit_id: "", customer_trailer_number: String(load.non_owned_trailer_number ?? ""), interchange_trailer_id: "" };
  }
  return { trailer_source: "owned", assigned_trailer_unit_id: String(load.assigned_trailer_unit_id ?? ""), customer_trailer_number: "", interchange_trailer_id: "" };
}
