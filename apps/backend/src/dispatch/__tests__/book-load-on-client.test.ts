import { describe, expect, it } from "vitest";
import { bookLoad, bookLoadOnClient, type BookLoadInput } from "../book-load.service.js";

// ROUND 443.14: bookLoadOnClient refuses exactly what bookLoad refuses, with the same error, and a
// refused input never touches the caller's client (the client below throws on any query).

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
    customer_po_number: "PO-1",
    ...overrides,
  };
}

const untouchable = {
  query: async () => {
    throw new Error("a refused input must never reach the caller's client");
  },
};

describe("bookLoadOnClient() — same inline checks as bookLoad() (443.14)", () => {
  const refusals: Array<[string, Partial<BookLoadInput>]> = [
    ["solo_or_team_assignment_required_not_both", { assigned_primary_driver_id: "33333333-3333-4333-8333-333333333333", team_id: "44444444-4444-4444-8444-444444444444", trip_type: "NB" }],
    ["pickup_appointment_required", { stops: [{ stop_type: "pickup", sequence_number: 1 }, { stop_type: "delivery", sequence_number: 2, scheduled_arrival_at: "2026-09-11T08:00:00Z" }] }],
    ["delivery_appointment_required", { stops: [{ stop_type: "pickup", sequence_number: 1, scheduled_arrival_at: "2026-09-10T08:00:00Z" }, { stop_type: "delivery", sequence_number: 2 }] }],
    ["customer_po_or_wo_number_required", { customer_po_number: undefined }],
    ["trip_type_required_when_driver_assigned", { assigned_primary_driver_id: "33333333-3333-4333-8333-333333333333" }],
  ];
  for (const [error, overrides] of refusals) {
    it(`refuses ${error} identically to bookLoad, without touching the client`, async () => {
      const viaWrapper = await bookLoad(baseInput(overrides));
      const onClient = await bookLoadOnClient(untouchable, baseInput(overrides));
      expect(viaWrapper).toEqual({ kind: "error", status: 400, payload: { error } });
      expect(onClient.result).toEqual(viaWrapper);
      expect(() => onClient.afterCommit()).not.toThrow();
    });
  }
});
