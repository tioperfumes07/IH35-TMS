import { describe, expect, it } from "vitest";
import { buildOfficeInvoiceDoc, buildDriverDispatchDoc, type BookLoadDocInput } from "./book-load-documents";

const input: BookLoadDocInput = {
  loadNumber: "L-20260625-0017",
  customerName: "Acme Foods",
  driverName: "Juan Perez",
  equipment: "Reefer 53'",
  instructions: "Call before arrival",
  driverPayCents: 150000,
  charges: [
    { code: "linehaul", amount_cents: 150000 },
    { code: "fuel_surcharge", amount_cents: 0 }, // zero dropped
    { code: "detention", amount_cents: 20000 },
  ],
  totalCents: 170000,
  stops: [
    { stop_type: "pickup", sequence_number: 1, address_line1: "8900 San Dario Ave", city: "Laredo", state: "TX", postal_code: "78045", appointment_start_at: "2026-06-25T08:00" },
    { stop_type: "delivery", sequence_number: 2, address_line1: "100 Market St", city: "Dallas", state: "TX", postal_code: "75201", scheduled_arrival_at: "2026-06-26T14:00" },
  ],
};

describe("book-load-documents — W11 office + driver doc models", () => {
  it("office invoice carries customer, stops, non-zero charges, and total", () => {
    const doc = buildOfficeInvoiceDoc(input);
    expect(doc.kind).toBe("office_invoice");
    expect(doc.loadNumber).toBe("L-20260625-0017");
    expect(doc.customerName).toBe("Acme Foods");
    expect(doc.stops).toHaveLength(2);
    expect(doc.stops[0].cityStateZip).toBe("Laredo, TX 78045");
    expect(doc.charges).toEqual([
      { code: "linehaul", amount_cents: 150000 },
      { code: "detention", amount_cents: 20000 },
    ]); // zero-amount charge dropped
    expect(doc.totalCents).toBe(170000);
  });

  it("office total falls back to summed charges when not provided", () => {
    const doc = buildOfficeInvoiceDoc({ ...input, totalCents: null });
    expect(doc.totalCents).toBe(170000);
  });

  it("driver dispatch carries driver, equipment, stops, instructions, pay", () => {
    const doc = buildDriverDispatchDoc(input);
    expect(doc.kind).toBe("driver_dispatch");
    expect(doc.driverName).toBe("Juan Perez");
    expect(doc.equipment).toBe("Reefer 53'");
    expect(doc.instructions).toBe("Call before arrival");
    expect(doc.driverPayCents).toBe(150000);
    expect(doc.stops.map((s) => s.type)).toEqual(["pickup", "delivery"]);
    expect(doc.stops[1].appointment).toBe("2026-06-26T14:00");
  });

  it("uses safe fallbacks for missing fields (never blank/NaN)", () => {
    const doc = buildDriverDispatchDoc({});
    expect(doc.loadNumber).toBe("DRAFT");
    expect(doc.driverName).toBe("Unassigned");
    expect(doc.equipment).toBe("—");
    expect(doc.instructions).toBe("None");
    expect(doc.driverPayCents).toBe(0);
    expect(doc.stops).toEqual([]);
    expect(buildOfficeInvoiceDoc({}).customerName).toBe("—");
  });
});
