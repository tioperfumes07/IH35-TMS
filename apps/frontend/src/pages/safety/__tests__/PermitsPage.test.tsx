import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as safetyApi from "../../../api/safety";
import { PermitsPage } from "../PermitsPage";

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("PermitsPage (A23-13)", () => {
  beforeEach(() => {
    vi.spyOn(safetyApi, "getSafetyPermits").mockResolvedValue({
      permits: [
        {
          id: "permit-1",
          permit_type: "state_operating_authority",
          permit_number: "TX-OA-100",
          issuing_state: "TX",
          holder_name: "IH35 Transport LLC",
          expiry_date: "2026-07-01",
          days_to_expiry: 27,
          renewal_severity: "warning",
          archived_at: null,
        },
      ],
      renewal_alerts: [
        {
          id: "permit-1",
          permit_type: "state_operating_authority",
          holder_name: "IH35 Transport LLC",
          expiry_date: "2026-07-01",
          days_to_expiry: 27,
          renewal_severity: "warning",
        },
      ],
      renewal_reminder: { days_before_expiry: 30, enabled: true },
    });
    vi.spyOn(safetyApi, "createSafetyPermit").mockResolvedValue({ permit: { id: "permit-2" } });
    vi.spyOn(safetyApi, "updatePermitRenewalReminder").mockResolvedValue({
      renewal_reminder: { days_before_expiry: 45, enabled: true },
    });
    vi.spyOn(safetyApi, "archiveSafetyPermit").mockResolvedValue({ permit: { id: "permit-1", archived_at: "now" } });
  });

  it("renders permits table and renewal alert dashboard", async () => {
    render(wrap(<PermitsPage operatingCompanyId={companyId} />));
    await waitFor(() => {
      expect(screen.getByTestId("permits-page")).toBeTruthy();
      expect(screen.getByTestId("permits-renewal-dashboard")).toBeTruthy();
      expect(screen.getByTestId("permits-table")).toBeTruthy();
      expect(screen.getByText("TX-OA-100")).toBeTruthy();
    });
  });

  it("opens create modal and submits permit", async () => {
    const user = userEvent.setup();
    render(wrap(<PermitsPage operatingCompanyId={companyId} />));
    await user.click(screen.getByTestId("permits-create-btn"));
    expect(screen.getByTestId("permits-create-modal")).toBeTruthy();
    await user.type(screen.getByLabelText(/Permit number/i), "TX-OA-200");
    await user.type(screen.getByLabelText(/Holder name/i), "IH35");
    await user.type(screen.getByLabelText(/Expiry date/i), "2027-06-01");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(safetyApi.createSafetyPermit).toHaveBeenCalled();
    });
  });
});
