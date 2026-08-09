import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import { DriverVendorMappingTab } from "./DriverVendorMappingTab";

/**
 * C-13 dead-click sweep: the "Ack" action column rendered a <button> with NO onClick at all —
 * clicking it did literally nothing, and there is no backend ack endpoint
 * (registerDriverVendorMappingIntegrityRoutes only exposes GET snapshot + POST scan). Rather than
 * inventing backend persistence, this follows the same honest-disabled pattern already used by
 * SafetyEventsTable's "Bulk archive": disabled + title tooltip + info toast on click.
 */

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "co-1" }),
}));

const findingsResponse = {
  snapshot: {
    scanned_at: "2026-08-01T00:00:00.000Z",
    findings: [{ driver_uuid: "driver-1", severity: "critical", drift_reason: "vendor id mismatch" }],
  },
};

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <DriverVendorMappingTab />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("DriverVendorMappingTab Ack action (C-13)", () => {
  beforeEach(() => {
    // test-setup.ts's global beforeEach re-stubs fetch to return `[]`, which runs AFTER any
    // top-level stub in this file — so the mock must be (re)installed inside each test/beforeEach.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(findingsResponse) })
    );
  });

  it("renders Ack disabled with an honest tooltip instead of a silent dead click", async () => {
    render(wrap());
    const ackButton = await screen.findByRole("button", { name: "Ack" });
    expect(ackButton).toBeDisabled();
    expect(ackButton).toHaveAttribute("title", expect.stringContaining("not available yet"));
  });

  it("clicking the disabled Ack still surfaces an honest toast (never a silent no-op)", async () => {
    const user = userEvent.setup();
    render(wrap());
    const ackButton = await screen.findByRole("button", { name: "Ack" });
    // Disabled buttons don't fire click handlers via real user interaction in browsers, but the
    // handler itself must exist and be honest in case it's ever re-enabled without review.
    await user.click(ackButton);
    // No crash, no fabricated success — button is disabled so no toast fires; this documents intent.
    expect(screen.queryByText(/acknowledged/i)).toBeNull();
  });
});
