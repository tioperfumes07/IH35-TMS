import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DispatchLoadRow } from "../../api/loads";
import { DriverStatusColumn, OnTimePredictionColumn, SamsaraEtaColumn } from "./LiveEtaColumns";

function mockLoad(overrides: Partial<DispatchLoadRow> = {}): DispatchLoadRow {
  return {
    id: "load-1",
    operating_company_id: "co-1",
    load_number: "L-100",
    customer_id: "cust-1",
    customer_name: "ACME",
    status: "in_transit",
    rate_total_cents: 10000,
    currency_code: "USD",
    assigned_unit_id: "unit-1",
    assigned_unit_number: "T-1",
    assigned_primary_driver_id: "d-1",
    assigned_primary_driver_name: "Driver One",
    assigned_secondary_driver_id: null,
    dispatcher_user_id: "u-1",
    notes: null,
    first_pickup_city: "Austin",
    first_delivery_city: "Dallas",
    flag_code: "BLUE",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    soft_deleted_at: null,
    deleted_by_user_id: null,
    ...overrides,
  };
}

describe("LiveEtaColumns", () => {
  it("renders driver status, Samsara ETA, and on-time prediction when live data is present", () => {
    render(
      <div>
        <DriverStatusColumn
          load={mockLoad({
            driver_lifecycle_stage: "enroute_del",
            driver_pwa_last_ping_at: new Date(Date.now() - 60_000).toISOString(),
            samsara_eta_at: "2026-06-07T20:30:00.000Z",
            samsara_eta_source: "samsara",
            on_time_prediction: "green",
          })}
        />
        <SamsaraEtaColumn
          load={mockLoad({
            samsara_eta_at: "2026-06-07T20:30:00.000Z",
            samsara_eta_source: "samsara",
          })}
        />
        <OnTimePredictionColumn load={mockLoad({ on_time_prediction: "green" })} />
      </div>
    );

    expect(screen.getByTestId("driver-status-column")).toHaveTextContent("Enroute DEL");
    expect(screen.getByTestId("driver-status-column")).toHaveTextContent("Online");
    expect(screen.getByTestId("samsara-eta-column")).toHaveTextContent("ETA");
    expect(screen.getByTestId("on-time-prediction-column")).toHaveTextContent("On time");
  });

  it("renders placeholders when live ETA data is missing", () => {
    render(
      <div>
        <DriverStatusColumn load={mockLoad({ driver_lifecycle_stage: null, driver_pwa_last_ping_at: null })} />
        <SamsaraEtaColumn load={mockLoad({ samsara_eta_at: null })} />
        <OnTimePredictionColumn load={mockLoad({ on_time_prediction: null })} />
      </div>
    );

    expect(screen.getByTestId("driver-status-column")).toHaveTextContent("No ping");
    expect(screen.getByTestId("samsara-eta-column")).toHaveTextContent("—");
    expect(screen.getByTestId("on-time-prediction-column")).toHaveTextContent("Unknown");
  });
});
