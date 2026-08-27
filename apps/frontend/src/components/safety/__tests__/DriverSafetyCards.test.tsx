import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DriverSafetyCards } from "../DriverSafetyCards";

const listDriversMock = vi.fn();
const getSafetyEventsFilteredMock = vi.fn();
const listDaEnrollmentsMock = vi.fn();

vi.mock("../../../api/mdata", () => ({
  listAllDrivers: (...args: unknown[]) => listDriversMock(...args),
}));

vi.mock("../../../api/safety", () => ({
  getSafetyEventsFiltered: (...args: unknown[]) => getSafetyEventsFilteredMock(...args),
  listDaEnrollments: (...args: unknown[]) => listDaEnrollmentsMock(...args),
}));

function isoInDays(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function renderCards(props: Partial<React.ComponentProps<typeof DriverSafetyCards>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DriverSafetyCards
        companyId="co-1"
        filter="active"
        activityWindow="7d"
        onCountsChange={props.onCountsChange ?? vi.fn()}
        onOpenProfile={props.onOpenProfile ?? vi.fn()}
      />
    </QueryClientProvider>
  );
}

const ROSTER = {
  drivers: [
    {
      id: "drv-expired",
      first_name: "Ana",
      last_name: "Zapata",
      status: "Active",
      cdl_expires_at: isoInDays(-3), // expired → critical
      visa_expires_at: isoInDays(200),
      visa_type: "B1",
      dot_medical_expires_at: isoInDays(400),
    },
    {
      id: "drv-clean",
      first_name: "Beto",
      last_name: "Alba",
      status: "Active",
      cdl_expires_at: isoInDays(365),
      visa_expires_at: isoInDays(365),
      visa_type: "B1",
      dot_medical_expires_at: isoInDays(365),
    },
  ],
  total: 2,
};

const EVENTS = {
  events: [{ driver_id: "drv-expired", is_active: true, severity: "high", status: "open" }],
  counters: { active_count: 1, resolved_count: 4, total_count: 5 },
  filter: "active" as const,
  window: "7d" as const,
};

const ENROLLMENTS = {
  enrollments: [
    {
      uuid: "e1",
      operating_company_id: "co-1",
      driver_uuid: "drv-clean",
      consortium_name: "FMCSA Consortium",
      enrolled_at: "2026-01-01",
      is_active: true,
      created_at: "2026-01-01",
    },
  ],
};

describe("DriverSafetyCards", () => {
  beforeEach(() => {
    listDriversMock.mockReset();
    getSafetyEventsFilteredMock.mockReset();
    listDaEnrollmentsMock.mockReset();
    listDriversMock.mockResolvedValue(ROSTER);
    getSafetyEventsFilteredMock.mockResolvedValue(EVENTS);
    listDaEnrollmentsMock.mockResolvedValue(ENROLLMENTS);
  });

  it("renders a card per driver with the six required fields", async () => {
    renderCards();
    expect(await screen.findByTestId("driver-card-drv-expired")).toBeInTheDocument();
    const critical = screen.getByTestId("driver-card-drv-expired");
    // Name (LAST, First), CDL overdue countdown, visa label, medical, open incidents, D&A status.
    expect(critical).toHaveTextContent("Zapata, Ana");
    expect(critical).toHaveTextContent(/overdue/i);
    expect(critical).toHaveTextContent(/Visa \(B1\)/);
    expect(critical).toHaveTextContent(/DOT medical/i);
    expect(critical).toHaveTextContent(/Open incidents/i);
    expect(critical).toHaveTextContent(/not enrolled/i);
    // Enrolled driver shows "in pool".
    expect(screen.getByTestId("driver-card-drv-clean")).toHaveTextContent(/in pool/i);
  });

  it("passes the layout filter + window into the events query and propagates counts to the bar", async () => {
    const onCountsChange = vi.fn();
    renderCards({ onCountsChange });
    await screen.findByTestId("driver-card-drv-expired");
    expect(getSafetyEventsFilteredMock).toHaveBeenCalledWith("co-1", "active", "7d");
    await waitFor(() => expect(onCountsChange).toHaveBeenCalledWith(1, 5));
  });

  it("default risk sort puts the most-at-risk (expired CDL) driver first", async () => {
    renderCards();
    await screen.findByTestId("driver-card-drv-expired");
    const cards = screen.getAllByTestId(/^driver-card-/);
    expect(cards[0].getAttribute("data-testid")).toBe("driver-card-drv-expired");
  });

  it("filters to expired credentials via the risk chip", async () => {
    renderCards();
    await screen.findByTestId("driver-card-drv-clean");
    await userEvent.click(screen.getByTestId("driver-cards-chip-expired"));
    expect(screen.getByTestId("driver-card-drv-expired")).toBeInTheDocument();
    expect(screen.queryByTestId("driver-card-drv-clean")).not.toBeInTheDocument();
  });

  it("opens the driver profile when a card is clicked", async () => {
    const onOpenProfile = vi.fn();
    renderCards({ onOpenProfile });
    await userEvent.click(await screen.findByTestId("driver-card-drv-expired"));
    expect(onOpenProfile).toHaveBeenCalledWith("drv-expired");
  });
});
