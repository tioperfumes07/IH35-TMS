import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InsuranceClaimsReverseSection } from "./InsuranceClaimsReverseSection";

const list = vi.fn().mockResolvedValue({ claims: [] });
vi.mock("../../api/insurance", () => ({
  insuranceClaimsApi: { list: (...args: unknown[]) => list(...args) },
}));
vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "Owner" } }),
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
        <InsuranceClaimsReverseSection operatingCompanyId="usmca" filter={{ driver_id: "driver-1" }} contextLabel="this driver" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("InsuranceClaimsReverseSection", () => {
  afterEach(() => navigateMock.mockReset());

  // DRV-12: "the large boxes ... go NOWHERE when clicked" -- the card body itself must navigate
  // to the same place the corner "Open Claims" link does.
  it("DRV-12: clicking the card body navigates to Open Claims' route", async () => {
    renderSection();
    await screen.findByText("Insurance Claims");
    fireEvent.click(screen.getByTestId("insurance-claims-reverse-section"));
    expect(navigateMock).toHaveBeenCalledWith("/safety/insurance/claims?driver_id=driver-1");
  });

  it("DRV-12: clicking the Open Claims link does not ALSO fire the card's own navigate", async () => {
    renderSection();
    const link = await screen.findByText("Open Claims");
    fireEvent.click(link);
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
