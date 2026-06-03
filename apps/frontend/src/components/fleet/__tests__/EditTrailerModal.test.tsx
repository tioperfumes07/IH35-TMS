import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as clientApi from "../../../api/client";
import { EditTrailerModal } from "../EditTrailerModal";

const fixture = {
  equipment: {
    id: "eq-1",
    equipment_number: "T-100",
    equipment_type: "DryVan",
    vin: "VIN1",
    year: 2020,
    notes: "ok",
  },
  type_specs: {},
  plates: [],
};

describe("EditTrailerModal", () => {
  beforeEach(() => {
    vi.spyOn(clientApi, "apiRequest").mockResolvedValue(fixture as never);
  });

  it("renders edit trailer modal with identity fields", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <EditTrailerModal
          open
          trailerId="eq-1"
          operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
          onClose={() => undefined}
        />
      </QueryClientProvider>
    );
    expect(screen.getByTestId("tp-edit-trailer-modal")).toBeTruthy();
    expect(await screen.findByDisplayValue("T-100")).toBeTruthy();
    expect(screen.getByDisplayValue("VIN1")).toBeTruthy();
  });
});
