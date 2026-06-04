import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as driverFinanceApi from "../../../api/driverFinance";
import { ToastProvider } from "../../../components/Toast";
import { EscrowRecordTab } from "../tabs/EscrowRecordTab";

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const driverId = "01923c8a-7f12-7000-8000-00000000d042";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: companyId }),
}));

vi.mock("../../../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "Owner" } }),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("EscrowRecordTab (A23-8)", () => {
  beforeEach(() => {
    vi.spyOn(driverFinanceApi, "listEscrowRecords").mockResolvedValue({
      records: [
        {
          id: driverId,
          driver_name: "Alex Driver",
          current_balance: 500,
          pre_clause_total: 300,
          post_clause_total: 200,
          accumulation_rate_pct: 50,
          forfeiture_history_count: 1,
          has_signed_clause: true,
        },
      ],
      forfeit_attempts: [
        {
          id: "attempt-1",
          driver_name: "Alex Driver",
          amount: 100,
          reason: "Separation",
          status: "success",
          created_at: "2026-06-01T12:00:00Z",
        },
      ],
    });
    vi.spyOn(driverFinanceApi, "forfeitEscrow").mockResolvedValue({ ok: true, status: "success", audit_id: "audit-1" });
  });

  it("renders live escrow rows from driver-finance APIs", async () => {
    render(wrap(<EscrowRecordTab />));
    await waitFor(() => {
      expect(screen.getByTestId(`escrow-record-row-${driverId}`)).toBeTruthy();
    });
    expect(screen.getByText("Alex Driver")).toBeTruthy();
    expect(screen.getByText("$500.00")).toBeTruthy();
    expect(driverFinanceApi.listEscrowRecords).toHaveBeenCalledWith(companyId);
  });

  it("shows forfeiture audit history", async () => {
    render(wrap(<EscrowRecordTab />));
    await waitFor(() => {
      expect(screen.getByText(/Successful forfeitures: 1/)).toBeTruthy();
    });
    expect(screen.getByTestId("escrow-forfeit-audit")).toBeTruthy();
    expect(screen.getByText(/Separation/)).toBeTruthy();
  });

  it("submits forfeit through API from modal", async () => {
    const user = userEvent.setup();
    render(wrap(<EscrowRecordTab />));
    await user.click(await screen.findByTestId(`escrow-forfeit-btn-${driverId}`));
    await user.type(screen.getByTestId("escrow-forfeit-amount"), "75");
    await user.type(screen.getByTestId("escrow-forfeit-reason"), "Driver separation");
    await user.click(screen.getByTestId("escrow-forfeit-submit"));
    await waitFor(() => {
      expect(driverFinanceApi.forfeitEscrow).toHaveBeenCalledWith(
        driverId,
        expect.objectContaining({
          operating_company_id: companyId,
          amount: 75,
          reason: "Driver separation",
        })
      );
    });
  });
});
