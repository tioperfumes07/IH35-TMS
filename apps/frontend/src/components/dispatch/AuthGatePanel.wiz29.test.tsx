import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthGatePanel } from "./AuthGatePanel";

// WIZ-29 GUARD (owner 2026-09-04). Under the pre-dispatch checks panel, AuthGatePanel rendered a
// bordered container (border border-gray-200 p-3) with NO children the moment its gate query resolved
// as pass:true with no blockers/warnings/info — the "dead empty box" the owner saw. A panel with
// nothing to report must render NOTHING; the affirmative "ready to book" state is already carried by
// the checks panel above. This guard fails if the empty-pass state renders the box again.
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock("../../api/client", () => ({ apiRequest }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const COMPANY = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  apiRequest.mockReset();
});

describe("WIZ-29 — AuthGatePanel renders no empty box when the gate passes with nothing to report", () => {
  it("passing gate with no blockers/warnings/info renders NOTHING (no dead empty box)", async () => {
    apiRequest.mockResolvedValue({ pass: true, blockers: [], warnings: [], info: [] });
    const { container } = render(
      <AuthGatePanel operatingCompanyId={COMPANY} action="book_load" driverUuid="d1" unitUuid="u1" />,
      { wrapper }
    );
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId("auth-gate-panel")).toBeNull());
    expect(container.querySelector('[data-testid="auth-gate-panel"]')).toBeNull();
  });

  it("still renders the panel when the gate returns a blocker", async () => {
    apiRequest.mockResolvedValue({
      pass: false,
      blockers: [{ message: "driver not authorized", workflow: "book_load" }],
      warnings: [],
      info: [],
    });
    render(<AuthGatePanel operatingCompanyId={COMPANY} action="book_load" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/driver not authorized/)).toBeTruthy());
    expect(screen.getByTestId("auth-gate-panel")).toBeTruthy();
  });
});
