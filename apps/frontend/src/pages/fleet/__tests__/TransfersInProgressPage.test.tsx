import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { TransfersInProgressPage } from "../TransfersInProgressPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));
vi.mock("../../../api/client", () => ({
  apiRequest: vi.fn().mockResolvedValue({ rows: [] }),
}));

describe("TransfersInProgressPage", () => {
  it("renders office pending transfers shell", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TransfersInProgressPage />
      </QueryClientProvider>
    );
    expect(screen.getByTestId("transfers-in-progress-page")).toBeInTheDocument();
  });
});
