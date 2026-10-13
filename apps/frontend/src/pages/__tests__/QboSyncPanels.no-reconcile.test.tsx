import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 443.137 9e (ACCT-F4431380, #26728): every QBO reconcile-now route — customers, vendors, items,
// chart-of-accounts — always answers 409 QBO_NATIVE_WRITE_REFUSED, because QuickBooks is a read-only
// archive. A Reconcile button could therefore only fail, so the panels offer none.
const apiRequestMock = vi.fn();
vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequestMock(...args) };
});
vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91e0bf0a-133f-4ce8-a734-2586cfa66d96" }),
}));

// eslint-disable-next-line import/first
import { CustomersSyncPanel } from "../customers/CustomersSyncPanel";
// eslint-disable-next-line import/first
import { VendorsSyncPanel } from "../vendors/VendorsSyncPanel";
// eslint-disable-next-line import/first
import { ItemsCatalog } from "../accounting/ItemsCatalog";
// eslint-disable-next-line import/first
import { ToastProvider } from "../../components/Toast";

const OPCO = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("QBO sync panels offer no refused Reconcile action (443.137 9e)", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({
      total_local: 3,
      synced: 3,
      drift_detected: 0,
      local_only: 0,
      sync_error: 0,
      last_pull_at: null,
      last_reconcile_at: null,
    });
  });

  it.each([
    ["CustomersSyncPanel", () => <CustomersSyncPanel operatingCompanyId={OPCO} />],
    ["VendorsSyncPanel", () => <VendorsSyncPanel operatingCompanyId={OPCO} />],
  ])("%s keeps Refresh from QBO and has no Reconcile button", async (_name, make) => {
    render(wrap(make()));
    expect(await screen.findByText(/Cloned from QBO: 3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh from QBO" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reconcil/ })).toBeNull();
    for (const call of apiRequestMock.mock.calls) expect(String(call[0])).not.toContain("reconcile-now");
  });

  it("ItemsCatalog keeps Sync now and has no Reconcile button", () => {
    render(wrap(<ItemsCatalog />));
    expect(screen.getByRole("button", { name: "Sync now" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reconcil/ })).toBeNull();
    expect(screen.getByText(/read-only QuickBooks items archive/)).toBeInTheDocument();
  });
});
