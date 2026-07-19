import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import { QBOSyncDriftDashboard } from "../QBOSyncDriftDashboard";

const apiRequestMock = vi.fn();

vi.mock("../../../api/client", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

function wrap(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const openDriftLog = {
  entities: [],
  last_alert: null,
  drift_log: [
    {
      id: "drift-1",
      entity_type: "vendor",
      entity_id: "v-1",
      qbo_id: "q-1",
      drift_type: "field_mismatch",
      local_snapshot: null,
      qbo_snapshot: null,
      detected_at: "2026-07-18T12:00:00.000Z",
      resolved_at: null,
      resolution_action: null,
    },
  ],
};

describe("QBOSyncDriftDashboard resolve mutation error handling", () => {
  it("surfaces a toast instead of failing silently when drift resolve rejects", async () => {
    // Dashboard GET succeeds; resolve POST rejects via Promise.reject (guard-locked — no typeof games).
    apiRequestMock.mockImplementation((path: string) => {
      if (String(path).includes("/drift-dashboard")) {
        return Promise.resolve(openDriftLog);
      }
      return Promise.reject(new Error("Drift resolve denied by server"));
    });

    render(wrap(<QBOSyncDriftDashboard />));

    const acceptLocal = await screen.findByRole("button", { name: "accept local" });
    fireEvent.click(acceptLocal);

    await waitFor(() =>
      expect(screen.getByTestId("toast-message")).toHaveTextContent("Drift resolve denied by server")
    );
  });
});
