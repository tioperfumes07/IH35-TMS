/**
 * W11 — preview document MODELS for the office (customer invoice / load confirmation) and the driver
 * (dispatch sheet) PDFs. This module is pure data-shaping ONLY — it extracts the structured content from
 * the booking data so the rendered preview (window.print, the app's established PDF pattern) and the CI
 * structure tests share ONE source. No layout is invented here; the renderer decides visual layout.
 *
 * Single source: the same fields the booking payload carries (customer, stops, charges, totals / stops,
 * appointments, equipment, instructions, pay) — so the preview matches the booked load exactly.
 */
export type DocCharge = { code: string; amount_cents: number };
export type DocStop = {
  sequence: number;
  type: "pickup" | "delivery";
  address: string;
  cityStateZip: string;
  appointment: string;
  lumper_amount_cents?: number;
};

export type OfficeInvoiceDoc = {
  kind: "office_invoice";
  loadNumber: string;
  customerName: string;
  stops: DocStop[];
  charges: DocCharge[];
  totalCents: number;
};

export type DriverDispatchDoc = {
  kind: "driver_dispatch";
  loadNumber: string;
  driverName: string;
  equipment: string;
  stops: DocStop[];
  instructions: string;
  driverPayCents: number;
};

export type BookLoadDocInput = {
  loadNumber?: string | null;
  customerName?: string | null;
  driverName?: string | null;
  equipment?: string | null;
  instructions?: string | null;
  driverPayCents?: number | null;
  charges?: ReadonlyArray<{ code?: string | null; amount_cents?: number | null }> | null;
  totalCents?: number | null;
  stops?: ReadonlyArray<{
    stop_type?: string | null;
    sequence_number?: number | null;
    address_line1?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    scheduled_arrival_at?: string | null;
    appointment_start_at?: string | null;
    lumper_amount_cents?: number | null;
  }> | null;
};

function cleanText(value: string | null | undefined, fallback = ""): string {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : fallback;
}

function toDocStops(input: BookLoadDocInput): DocStop[] {
  return (input.stops ?? []).map((stop, i) => {
    const city = cleanText(stop.city);
    const state = cleanText(stop.state);
    const zip = cleanText(stop.postal_code);
    const cityStateZip = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    return {
      sequence: Number(stop.sequence_number ?? i + 1),
      type: stop.stop_type === "delivery" ? "delivery" : "pickup",
      address: cleanText(stop.address_line1, "—"),
      cityStateZip: cityStateZip || "—",
      appointment: cleanText(stop.appointment_start_at ?? stop.scheduled_arrival_at, "TBD"),
      lumper_amount_cents: Math.max(0, Number(stop.lumper_amount_cents ?? 0)),
    };
  });
}

export function buildOfficeInvoiceDoc(input: BookLoadDocInput): OfficeInvoiceDoc {
  const charges: DocCharge[] = (input.charges ?? [])
    .map((c) => ({ code: cleanText(c.code, "charge"), amount_cents: Math.max(0, Number(c.amount_cents ?? 0)) }))
    .filter((c) => c.amount_cents > 0);
  const totalCents =
    input.totalCents != null ? Math.max(0, Number(input.totalCents)) : charges.reduce((s, c) => s + c.amount_cents, 0);
  return {
    kind: "office_invoice",
    loadNumber: cleanText(input.loadNumber, "DRAFT"),
    customerName: cleanText(input.customerName, "—"),
    stops: toDocStops(input),
    charges,
    totalCents,
  };
}

export function buildDriverDispatchDoc(input: BookLoadDocInput): DriverDispatchDoc {
  return {
    kind: "driver_dispatch",
    loadNumber: cleanText(input.loadNumber, "DRAFT"),
    driverName: cleanText(input.driverName, "Unassigned"),
    equipment: cleanText(input.equipment, "—"),
    stops: toDocStops(input),
    instructions: cleanText(input.instructions, "None"),
    driverPayCents: Math.max(0, Number(input.driverPayCents ?? 0)),
  };
}
