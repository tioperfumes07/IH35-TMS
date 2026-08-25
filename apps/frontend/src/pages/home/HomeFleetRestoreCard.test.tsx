import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { getFleetRestoreCost } from "../../api/maintenance";
import { HomeFleetRestoreCard } from "./HomeFleetRestoreCard";

vi.mock("../../api/maintenance", () => ({
  getFleetRestoreCost: vi.fn(),
}));

describe("HomeFleetRestoreCard", () => {
  it("recovers a failed company-scoped restore-cost read", async () => {
    const user = userEvent.setup();
    const getCost = vi.mocked(getFleetRestoreCost);
    getCost
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        data: {
          total_estimated_cents: 25_000,
          total_actual_cents: 10_000,
          total_remaining_cents: 15_000,
          unit_count: 1,
          avg_days_open: 2,
        },
      });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <HomeFleetRestoreCard operatingCompanyId="00000000-0000-4000-8000-000000000088" />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await user.click(await screen.findByRole("button", { name: "Retry restore cost" }));
    expect(await screen.findByText(/\$150\.00 remaining across 1 unit/)).toBeInTheDocument();
    expect(getCost).toHaveBeenCalledTimes(2);
  });
});
