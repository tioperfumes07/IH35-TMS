import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as accountingApi from "../../../api/accounting";
import * as mdataApi from "../../../api/mdata";
import { ToastProvider } from "../../../components/Toast";
import { BillsPage } from "../BillsPage";

const COMPANY_ID = "00000000-0000-4000-8000-000000000099";
const VENDOR_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: COMPANY_ID }),
}));

vi.mock("../AccountingSubNavWrapper", () => ({
  AccountingSubNavWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../../components/shared/EntityLink", () => ({
  EntityLink: ({ label }: { label: string }) => <span>{label}</span>,
}));

vi.mock("../../maintenance/components/CreateBillModal", () => ({
  CreateBillModal: () => null,
}));

vi.mock("../../../components/allocation", () => ({
  BillAllocationPanel: () => null,
}));

vi.mock("../../../components/tasks/TasksTab", () => ({
  TasksTab: () => null,
}));

function wrap(ui: ReactElement, initialEntry: string) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("BillsPage has_balance deep-link (A/P aging contract)", () => {
  beforeEach(() => {
    vi.spyOn(mdataApi, "listVendors").mockResolvedValue({ vendors: [] } as never);
    vi.spyOn(accountingApi, "listBills").mockResolvedValue({ rows: [] } as never);
  });

  it("passes has_balance=true to listBills for aging drill (includes partial)", async () => {
    render(wrap(<BillsPage />, `/accounting/bills?vendor_id=${VENDOR_ID}&has_balance=true`));

    await waitFor(() => {
      expect(accountingApi.listBills).toHaveBeenCalledWith(
        COMPANY_ID,
        expect.objectContaining({
          vendor_id: VENDOR_ID,
          has_balance: true,
        })
      );
    });
  });
});
