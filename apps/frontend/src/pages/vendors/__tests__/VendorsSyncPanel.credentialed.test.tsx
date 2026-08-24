import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// VENDOR-401 regression: the sync panel must load its status through the credentialed apiRequest
// client (credentials: "include" → cross-origin ih35_session cookie is sent), NOT a raw fetch().
// A raw fetch omitted the cookie and the backend requireAuth returned 401 on a valid session,
// showing "Unable to load sync status". This test fails if the panel ever regresses to raw fetch.
const apiRequestMock = vi.fn();
vi.mock("../../../api/client", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  // resolveApiUrl intentionally throws — a sync panel that reaches for it (raw-fetch path) will fail.
  resolveApiUrl: () => {
    throw new Error("resolveApiUrl must not be used by the sync panel (use credentialed apiRequest)");
  },
}));

// eslint-disable-next-line import/first
import { VendorsSyncPanel } from "../VendorsSyncPanel";
// eslint-disable-next-line import/first
import { ToastProvider } from "../../../components/Toast";

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

const OPCO = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

describe("VendorsSyncPanel — VENDOR-401 credentialed status fetch", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    apiRequestMock.mockReset();
    fetchSpy.mockReset();
    // Any raw global fetch use in the panel is a credential-omission regression.
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads sync status via apiRequest (credentialed), never raw fetch", async () => {
    apiRequestMock.mockResolvedValue({
      total_local: 7,
      synced: 7,
      drift_detected: 0,
      local_only: 0,
      sync_error: 0,
      last_pull_at: null,
      last_reconcile_at: null,
    });

    render(wrap(<VendorsSyncPanel operatingCompanyId={OPCO} />));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });

    const calledPath = String(apiRequestMock.mock.calls[0][0]);
    expect(calledPath).toContain("/api/v1/qbo-sync/vendors/status");
    expect(calledPath).toContain(OPCO);
    // The credentialed client is the only network path; no raw fetch.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await screen.findByText(/Cloned from QBO: 7/)).toBeInTheDocument();
  });
});
