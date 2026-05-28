import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DriversListPage } from "./DriversListPage";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../api/mdata", () => ({
  listDrivers: vi.fn().mockResolvedValue({
    drivers: [
      {
        id: "d1",
        operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
        first_name: "Alex",
        last_name: "Rivera",
        status: "Active",
        cdl_number: "TX123",
        cdl_state: "TX",
        cdl_expires_at: "2030-01-01",
        dot_medical_expires_at: "2030-01-01",
        emergency_contact_name: "Sam",
        emergency_contact_phone_primary: "5555550101",
        curp: null,
        ine_number: null,
        visa_number: null,
        passport_number: null,
      },
    ],
  }),
}));

vi.mock("../../api/safety", () => ({
  listDriverQualificationItems: vi.fn().mockResolvedValue({ items: [] }),
}));

describe("DriversListPage", () => {
  it("renders fleet compliance summary and driver row", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <DriversListPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("Driver qualification profiles")).toBeInTheDocument();
    expect(await screen.findByText("Alex Rivera")).toBeInTheDocument();
    expect(await screen.findByText("No DQF items")).toBeInTheDocument();
  });
});
