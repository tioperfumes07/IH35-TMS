import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DriverDaySummaryCard } from "../DriverDaySummaryCard";

const fetchDriverDaySummary = vi.fn();

vi.mock("../../../api/home", () => ({
  fetchDriverDaySummary: (...args: unknown[]) => fetchDriverDaySummary(...args),
}));

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DriverDaySummaryCard operatingCompanyId="11111111-1111-4111-8111-111111111111" />
    </QueryClientProvider>
  );
}

describe("DriverDaySummaryCard", () => {
  it("renders minutes when has_data=true", async () => {
    fetchDriverDaySummary.mockResolvedValueOnce({
      date: "2026-06-02",
      has_data: true,
      rows: [
        {
          driver_id: "22222222-2222-4222-8222-222222222222",
          driver_name: "Alex Driver",
          miles: 120.4,
          hours_on_duty: 8.5,
          fuel_stops: 2,
          on_time_arrivals: 3,
          late_arrivals: 1,
        },
      ],
    });
    renderCard();
    expect(await screen.findByText("Alex Driver")).toBeInTheDocument();
    expect(screen.getByText("8.50")).toBeInTheDocument();
    expect(screen.getByText("120.4")).toBeInTheDocument();
  });

  it("renders neutral empty state when has_data=false (no red error styling)", async () => {
    fetchDriverDaySummary.mockResolvedValueOnce({
      date: "2026-06-02",
      has_data: false,
      rows: [],
    });
    const { container } = renderCard();
    const message = await screen.findByText(/No HOS data recorded for drivers on/i);
    expect(message).toBeInTheDocument();
    expect(message.className).toContain("text-slate-500");
    expect(message.className).not.toMatch(/red|error/i);
    expect(container.querySelector(".text-red-700")).toBeNull();
  });

  it("renders retry button on network error", async () => {
    fetchDriverDaySummary.mockRejectedValueOnce(new Error("network failure"));
    renderCard();
    expect(await screen.findByText("Couldn't load summary right now.")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry).toBeInTheDocument();
    fetchDriverDaySummary.mockResolvedValueOnce({
      date: "2026-06-02",
      has_data: false,
      rows: [],
    });
    fireEvent.click(retry);
    expect(await screen.findByText(/No HOS data recorded for drivers on/i)).toBeInTheDocument();
  });
});
