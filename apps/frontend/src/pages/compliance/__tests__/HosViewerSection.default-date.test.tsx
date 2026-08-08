import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../../components/Toast";
import { HosViewerSection } from "../HosViewerSection";
import { companyToday } from "../../../lib/businessDate";
import { formatDateUS } from "../../../lib/formatDate";

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

// Spread the real module instead of replacing it wholesale. HosViewerSection now mounts
// CreateDriverModal, which imports createDriver from here; a bare replacement mock made that a hard
// "No createDriver export is defined on the mock" failure the moment the section gained a child it did
// not have when this harness was written. Overriding only what the test actually drives keeps the next
// added child from breaking a test that has nothing to do with it.
vi.mock("../../../api/mdata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/mdata")>();
  return {
    ...actual,
    listDrivers: vi.fn().mockResolvedValue({ drivers: [] }),
  };
});

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    // MemoryRouter + ToastProvider: this section mounts CreateDriverModal, which calls useNavigate
    // (CreateDriverModal.tsx:162) for its post-create drill-through. Without a router the render throws
    // "useNavigate() may be used only in the context of a <Router> component" before the date filter is
    // ever evaluated, and it then needed ToastProvider for the same reason — so this failure was never about
    // the default date the test is named for; it was two missing providers. The app
    // always renders this inside the router; the harness was the unrealistic part.
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>
          <HosViewerSection operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("HosViewerSection default date", () => {
  afterEach(cleanup);
  beforeEach(() => vi.clearAllMocks());

  it("defaults the date filter to today's duty day in the carrier timezone (not epoch/empty)", async () => {
    const { getByTestId } = renderSection();
    const dateButton = (await waitFor(() => {
      const el = getByTestId("hos-viewer-date");
      expect(el).toBeTruthy();
      return el;
    })) as HTMLButtonElement;
    const expected = companyToday();
    const expectedLabel = formatDateUS(expected);

    // The DatePicker trigger renders the display label "MM/DD/YYYY" (SYS-DATE) for companyToday().
    expect(dateButton.textContent).toContain(expectedLabel);
    // Never epoch, empty, or an obviously stale default.
    expect(dateButton.textContent).not.toContain(formatDateUS("1970-01-01"));
    expect(expectedLabel).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});
