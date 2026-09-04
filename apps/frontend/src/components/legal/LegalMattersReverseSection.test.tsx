import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LegalMattersReverseSection } from "./LegalMattersReverseSection";

const list = vi.fn().mockResolvedValue({ matters: [] });
vi.mock("../../api/legal-matters", () => ({
  legalMattersApi: { list: (...args: unknown[]) => list(...args) },
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
        <LegalMattersReverseSection operatingCompanyId="usmca" filter={{ related_driver_id: "driver-1" }} contextLabel="this driver" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("LegalMattersReverseSection", () => {
  afterEach(() => navigateMock.mockReset());

  // DRV-12: "the large boxes ... go NOWHERE when clicked" -- the card body itself must navigate
  // to the same place the corner "Open Legal" link does.
  it("DRV-12: clicking the card body navigates to Open Legal's route", async () => {
    renderSection();
    await screen.findByText("Legal Matters");
    fireEvent.click(screen.getByTestId("legal-matters-reverse-section"));
    expect(navigateMock).toHaveBeenCalledWith("/legal/matters?related_driver_id=driver-1");
  });

  it("DRV-12: clicking the Open Legal link does not ALSO fire the card's own navigate", async () => {
    renderSection();
    const link = await screen.findByText("Open Legal");
    fireEvent.click(link);
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
