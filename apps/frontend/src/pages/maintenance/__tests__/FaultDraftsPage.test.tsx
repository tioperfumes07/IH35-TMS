import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { FaultDraftsPage } from "../FaultDraftsPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "44444444-4444-4444-8444-444444444444", companies: [] }),
}));

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock("../../../api/client", () => ({
  apiRequest: vi.fn(async () => ({ drafts: [] })),
}));

describe("FaultDraftsPage", () => {
  it("renders fault-driven drafts heading", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <FaultDraftsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByText("Fault-Driven Drafts")).toBeTruthy();
    expect(screen.getByText(/No fault-driven draft work orders pending review/)).toBeTruthy();
  });
});
