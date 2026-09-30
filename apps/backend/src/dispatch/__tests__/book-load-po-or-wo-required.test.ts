import { describe, expect, it } from "vitest";
import { bookLoad, type BookLoadInput } from "../book-load.service.js";

// ROUND 285.3.6 (owner order 2026-09-30, "W/O or PO REQUIRED at load creation. Not optional, not
// a warning. The whole Faro join depends on customer_po_number existing."). Same shape as the
// DSP-49 appointment checks right above it in bookLoad() -- exercised directly, no DB, since it
// runs before any database access.

function baseInput(overrides: Partial<BookLoadInput> = {}): BookLoadInput {
  return {
    requestingUserUuid: "11111111-1111-4111-8111-111111111111",
    requestingUserRole: "Dispatcher",
    operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80",
    customer_id: "22222222-2222-4222-8222-222222222222",
    status: "booked",
    charges: [],
    stops: [
      { stop_type: "pickup", sequence_number: 1, scheduled_arrival_at: "2026-09-10T08:00:00Z" },
      { stop_type: "delivery", sequence_number: 2, scheduled_arrival_at: "2026-09-11T08:00:00Z" },
    ],
    save_mode: "book_dispatch",
    ...overrides,
  };
}

describe("bookLoad() — customer PO or W/O number required (285.3.6)", () => {
  it("rejects when both customer_po_number and customer_wo_number are absent", async () => {
    const result = await bookLoad(baseInput());
    expect(result).toEqual({ kind: "error", status: 400, payload: { error: "customer_po_or_wo_number_required" } });
  });

  it("rejects when both are present but blank", async () => {
    const result = await bookLoad(baseInput({ customer_po_number: "  ", customer_wo_number: "" }));
    expect(result).toEqual({ kind: "error", status: 400, payload: { error: "customer_po_or_wo_number_required" } });
  });

  it("accepts customer_po_number alone", async () => {
    let thrown: unknown;
    try {
      await bookLoad(baseInput({ customer_po_number: "PO-12345" }));
    } catch (err) {
      thrown = err;
    }
    // With a fake UUID and no real DB, execution runs past this gate into a real downstream
    // company-membership check and throws there instead -- proof this gate is not what blocked it.
    expect(thrown).toBeDefined();
  });

  it("accepts customer_wo_number alone", async () => {
    let thrown: unknown;
    try {
      await bookLoad(baseInput({ customer_wo_number: "WO-6789" }));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
  });

  it("never blocks a draft save (save_mode='draft'), even with neither field", async () => {
    let thrown: unknown;
    let result: Awaited<ReturnType<typeof bookLoad>> | undefined;
    try {
      result = await bookLoad(baseInput({ save_mode: "draft", stops: [] }));
    } catch (err) {
      thrown = err;
    }
    // A draft with no stops also clears the DSP-49 appointment gate (exempted for drafts), so
    // execution runs past both gates into a real downstream check and throws there -- proof
    // neither gate is what a draft save hits.
    expect(result).toBeUndefined();
    expect(thrown).toBeDefined();
  });
});
