/**
 * @vitest-environment jsdom
 *
 * FE-SETTLEMENTS-ZERO-TEST-COVERAGE — settlements module had 0 *.test.tsx files.
 * Smoke: SettlementsPage mounts and shows the Settlements chrome with an empty list.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SettlementsPage } from "./SettlementsPage";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "00000000-0000-4000-8000-000000000099" }),
}));

vi.mock("../../api/driverFinance", () => ({
  listSettlements: vi.fn(async () => ({ settlements: [] })),
}));

function wrap(ui: ReactElement) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/settlements"]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("SettlementsPage smoke", () => {
  it("renders settlements chrome for the selected company", async () => {
    render(wrap(<SettlementsPage />));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /settlements/i })).toBeInTheDocument();
    });
  });
});
