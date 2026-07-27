import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { TransfersInProgressPage } from "../TransfersInProgressPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));
vi.mock("../../../api/client", async (importOriginal) => ({
  // Spread the real module first: a partial factory silently makes every OTHER export
  // `undefined`, so an unrelated import (resolveApiUrl here) throws at call time and takes the
  // whole page down with an empty render — which reads as "nothing rendered", not "mock gap".
  ...(await importOriginal<Record<string, unknown>>()),
  apiRequest: vi.fn().mockResolvedValue({ rows: [] }),
}));

describe("TransfersInProgressPage", () => {
  it("renders office pending transfers shell", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter><QueryClientProvider client={client}>
        <TransfersInProgressPage />
      </QueryClientProvider></MemoryRouter>
    );
    expect(screen.getByTestId("transfers-in-progress-page")).toBeInTheDocument();
  });
});
