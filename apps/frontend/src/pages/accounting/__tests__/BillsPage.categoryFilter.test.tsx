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

describe("BillsPage category server-side filter (ACCT-F2026110203)", () => {
  beforeEach(() => {
    vi.spyOn(mdataApi, "listVendors").mockResolvedValue({ vendors: [] } as never);
    vi.spyOn(accountingApi, "listBillRegister").mockResolvedValue({ rows: [] } as never);
  });

  it("passes bill_category=maintenance to server when URL has category=maintenance", async () => {
    render(wrap(<BillsPage />, `/accounting/bills?category=maintenance`));

    await waitFor(() => {
      expect(accountingApi.listBillRegister).toHaveBeenCalledWith(
        COMPANY_ID,
        expect.objectContaining({ bill_category: "maintenance" })
      );
    });
  });

  it("omits bill_category when no category param is present", async () => {
    render(wrap(<BillsPage />, `/accounting/bills`));

    await waitFor(() => {
      expect(accountingApi.listBillRegister).toHaveBeenCalledWith(
        COMPANY_ID,
        expect.not.objectContaining({ bill_category: expect.anything() })
      );
    });
  });
});
