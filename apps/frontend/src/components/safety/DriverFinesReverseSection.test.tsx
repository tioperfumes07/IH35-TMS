import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DriverFinesReverseSection } from "./DriverFinesReverseSection";

const getSafetyFines = vi.fn().mockResolvedValue({ fines: [], total_count: 0 });
const getInternalFines = vi.fn().mockResolvedValue({ fines: [], total_count: 0 });
vi.mock("../../api/safety", () => ({
  getSafetyFines: (...args: unknown[]) => getSafetyFines(...args),
  getInternalFines: (...args: unknown[]) => getInternalFines(...args),
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DriverFinesReverseSection operatingCompanyId="usmca" driverId="driver-1" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DriverFinesReverseSection", () => {
  afterEach(() => navigateMock.mockReset());

  // DRV-12: "the large boxes ... go NOWHERE when clicked" -- the card body itself must navigate
  // to the same place the corner "Open Safety" link does.
  it("DRV-12: clicking the card body navigates to Open Safety's route", async () => {
    renderSection();
    await screen.findByText("Fines");
    fireEvent.click(screen.getByTestId("driver-fines-reverse-section"));
    expect(navigateMock).toHaveBeenCalledWith("/safety/external-fines?subject_driver_id=driver-1");
  });

  // DRV-12 regression guard: the pager buttons page in place -- clicking them must NEVER also
  // navigate away, or paging through fines would fling the user off the driver profile.
  it("DRV-12: clicking a civil-fines pager button does not navigate away", async () => {
    getSafetyFines.mockResolvedValueOnce({ fines: [{ id: "f1", violation_code: "SPEED" }], total_count: 60 });
    renderSection();
    const pager = await screen.findByTestId("driver-fines-civil-server-pager");
    fireEvent.click(pager.querySelector("button")!);
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
