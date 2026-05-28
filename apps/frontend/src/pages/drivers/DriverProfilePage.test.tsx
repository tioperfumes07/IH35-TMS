import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DriverProfilePage } from "./DriverProfilePage";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../api/mdata", () => ({
  getDriver: vi.fn().mockResolvedValue({
    id: "d1",
    first_name: "Alex",
    last_name: "Rivera",
    status: "Active",
    phone: "5555550100",
    email: "alex@example.com",
    cdl_number: "TX123",
    cdl_state: "TX",
    cdl_expires_at: "2027-01-01",
    dot_medical_expires_at: "2026-12-01",
  }),
}));

vi.mock("../../api/safety", () => ({
  listDriverQualificationItems: vi.fn().mockResolvedValue({
    items: [{ id: "i1", driver_id: "d1", item_name: "MVR", status: "present", effective_date: null, expiry_date: null, notes: null }],
  }),
  createDriverQualificationItem: vi.fn(),
  patchDriverQualificationItem: vi.fn(),
}));

describe("DriverProfilePage", () => {
  it("renders driver DQF profile header and checklist section", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/drivers/d1/profile"]}>
          <Routes>
            <Route path="/drivers/:id/profile" element={<DriverProfilePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByRole("heading", { name: "Alex Rivera" })).toBeInTheDocument();
    expect(screen.getByText("DQF checklist")).toBeInTheDocument();
    expect(screen.getByText("Compliance summary")).toBeInTheDocument();
  });
});
