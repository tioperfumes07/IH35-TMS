// LEAD 443.258-A (P0 D001) — Fuel › Questions › Review crashed: "Cannot read properties of undefined (reading 'load_number')".
// A candidate truck with NO load at the pump moment (load: null) must render "No load at pump time", never throw, and
// selecting it must not invent a load.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../../api/fuelAssignmentQuestions", async (orig) => ({
  ...(await orig<typeof import("../../../../api/fuelAssignmentQuestions")>()),
  answerFuelAssignmentQuestion: vi.fn(),
}));
vi.mock("../../../../components/Toast", () => ({ useToast: () => ({ pushToast: vi.fn() }) }));

import { FuelAssignmentPopup } from "../FuelAssignmentPopup";
import type { FuelAssignmentQuestion } from "../../../../api/fuelAssignmentQuestions";

const question = {
  id: "q1", operating_company_id: "co-1", fuel_transaction_id: "f1", status: "open",
  fill_moment_at: null, fill_moment_ct: "10/21 3:10 PM CT", station: "LOVES 362", gallons: "120.5", amount_cents: "45000",
  card_unit_id: "u-173", card_unit_number: "T173", card_driver_id: null, card_driver_name: null,
  evidence: {
    candidates: [
      { unit_id: "u-173", unit_number: "T173", distance_m: null, minutes_off: null, distance_mi: null, samsara_driver: null, odometer: null, load: null },
      { unit_id: "u-150", unit_number: "T150", distance_m: 120, minutes_off: 3, distance_mi: 0.07, samsara_driver: null, odometer: 512345,
        load: { load_id: "l-13689", load_number: "13689", settlement_ref: "5870", pickup: null, delivery: null, route: "Laredo, TX → Vinton, LA" } },
    ],
    truck_resolution: "owner_ruling", load_resolution: "held_no_gps_at_station", moment_source: null,
  },
  proposed_unit_id: "u-173", proposed_unit_number: "T173", proposed_load_id: null, proposed_load_number: "13689",
  proposed_settlement_ref: null, proposed_why: "no GPS at station", answer_kind: null, answered_unit_id: null, answered_load_id: null,
  answer_reason: null, answered_by_user_id: null, answered_at: null, created_at: "2026-10-22T19:57:31Z", updated_at: "2026-10-22T19:57:31Z",
} as unknown as FuelAssignmentQuestion;

describe("FuelAssignmentPopup — candidate with no load at the pump (443.258-A)", () => {
  it("renders the row and the other candidate's load, selecting it does not invent a load", () => {
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <FuelAssignmentPopup open operatingCompanyId="co-1" question={question} onClose={vi.fn()} onAnswered={vi.fn()} />
        </QueryClientProvider>
      </MemoryRouter>
    );
    expect(screen.getByTestId("fuel-assignment-candidate-no-load-u-173").textContent).toBe("No load at pump time");
    expect(screen.getAllByText("13689").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId("fuel-assignment-candidate-u-173"));
    expect(screen.getByTestId("fuel-assignment-candidate-no-load-u-173")).toBeTruthy();
  });
});
