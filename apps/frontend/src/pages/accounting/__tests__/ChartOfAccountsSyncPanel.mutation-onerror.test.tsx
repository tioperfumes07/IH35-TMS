import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ChartOfAccountsSyncPanel } from "../ChartOfAccountsSyncPanel";

const pushToast = vi.fn();

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast }),
}));

const companyId = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

const statusPayload = {
  total_local: 42,
  synced: 40,
  drift_detected: 1,
  local_only: 0,
  sync_error: 1,
  last_pull_at: new Date().toISOString(),
  last_reconcile_at: new Date().toISOString(),
};

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ChartOfAccountsSyncPanel operatingCompanyId={companyId} />
    </QueryClientProvider>
  );
}

describe("ChartOfAccountsSyncPanel mutation onError", () => {
  beforeEach(() => {
    pushToast.mockReset();
    vi.spyOn(clientApi, "apiRequest").mockImplementation(async (path, options) => {
      if (typeof path === "string" && path.includes("/status")) return statusPayload;
      if (options?.method === "POST") throw new Error("QBO sync unavailable");
      return {};
    });
  });

  it("surfaces pull-now failures via pushToast", async () => {
    renderPanel();
    expect(await screen.findByText(/Cloned from QBO: 42/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh from QBO" }));
    await waitFor(() => {
      expect(pushToast).toHaveBeenCalledWith("QBO sync unavailable", "error");
    });
  });

  it("surfaces reconcile-now failures via pushToast", async () => {
    renderPanel();
    expect(await screen.findByText(/Cloned from QBO: 42/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reconcile" }));
    await waitFor(() => {
      expect(pushToast).toHaveBeenCalledWith("QBO sync unavailable", "error");
    });
  });
});
