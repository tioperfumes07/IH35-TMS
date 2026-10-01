import { describe, expect, it } from "vitest";
import { bookLoad, type BookLoadInput } from "../book-load.service.js";

// SET-01 at the API (Lead 2026-10-01, measured on load 13593): a book_dispatch call with a driver
// seated and no trip_type cannot join a pre-settlement at creation (owner law: "the instant a load
// is CREATED it joins a pre-settlement"), so bookLoad() refuses it before any database access.
// Same no-DB shape as book-load-po-or-wo-required.test.ts.

function baseInput(overrides: Partial<BookLoadInput> = {}): BookLoadInput {
  return {
    requestingUserUuid: "11111111-1111-4111-8111-111111111111",
    requestingUserRole: "Dispatcher",
    operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80",
    customer_id: "22222222-2222-4222-8222-222222222222",
    customer_po_number: "PO-13593",
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

const DRIVER = "4ff53886-41cc-434f-ae23-a36a0e3ec8e2";

describe("bookLoad() — trip_type required when a driver is assigned (SET-01 at the API)", () => {
  it("rejects book_dispatch with a driver and no trip_type", async () => {
    const result = await bookLoad(baseInput({ assigned_primary_driver_id: DRIVER }));
    expect(result).toEqual({ kind: "error", status: 400, payload: { error: "trip_type_required_when_driver_assigned" } });
  });

  it("passes the gate with a driver and a trip_type", async () => {
    let thrown: unknown;
    try {
      await bookLoad(baseInput({ assigned_primary_driver_id: DRIVER, trip_type: "NB" }));
    } catch (err) {
      thrown = err;
    }
    // Runs past the gate into the real downstream membership check and throws there -- proof the
    // gate is not what blocked it.
    expect(thrown).toBeDefined();
  });

  it("passes the gate with no driver and no trip_type (driverless booking defers by design)", async () => {
    let thrown: unknown;
    try {
      await bookLoad(baseInput());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
  });

  it("never blocks a draft save with a driver and no trip_type", async () => {
    let thrown: unknown;
    let result: Awaited<ReturnType<typeof bookLoad>> | undefined;
    try {
      result = await bookLoad(baseInput({ save_mode: "draft", stops: [], assigned_primary_driver_id: DRIVER }));
    } catch (err) {
      thrown = err;
    }
    expect(result).toBeUndefined();
    expect(thrown).toBeDefined();
  });
});
