import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { HosViewerSection } from "../HosViewerSection";
import { companyToday } from "../../../lib/businessDate";

// SAFETY-1 regression: the HOS Viewer must open on the current duty day in the CARRIER timezone
// (America/Chicago via companyToday()), never on an empty/epoch/UTC-rolled date. This locks the
// default so a future refactor cannot regress it back to a UTC calendar date.

vi.mock("../../../api/hosTracker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/hosTracker")>();
  return {
    ...actual,
    getHosDailyRoster: vi.fn().mockResolvedValue({
      date: "2026-07-01",
      generated_at: "2026-07-01T12:00:00Z",
      drivers: [],
      counts: { active: 0, on_duty: 0, driving: 0, low: 0, violation: 0, unavailable: 0 },
    }),
    getHosDaily: vi.fn().mockResolvedValue({
      driver_id: "d1",
      date: "2026-07-01",
      available: false,
      segments: [],
      per_status_minutes: {},
      clocks: null,
      driven_cycle_min: null,
      eight_day_breakdown: [],
    }),
  };
});

vi.mock("../../../api/mdata", () => ({
  listDrivers: vi.fn().mockResolvedValue({ drivers: [] }),
}));

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <HosViewerSection operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" />
    </QueryClientProvider>,
  );
}

describe("HosViewerSection default date", () => {
  afterEach(cleanup);
  beforeEach(() => vi.clearAllMocks());

  it("defaults the date filter to today's duty day in the carrier timezone (not epoch/empty)", async () => {
    const { container } = renderSection();
    const dateInput = (await waitFor(() => {
      const el = container.querySelector('input[type="date"]');
      expect(el).toBeTruthy();
      return el;
    })) as HTMLInputElement;
    const expected = companyToday();

    expect(dateInput.value).toBe(expected);
    // Never epoch, empty, or an obviously stale default.
    expect(dateInput.value).not.toBe("");
    expect(dateInput.value).not.toBe("1970-01-01");
    // ISO YYYY-MM-DD shape.
    expect(dateInput.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Date picker capped at today — no future duty days.
    expect(dateInput.max).toBe(expected);
  });
});
