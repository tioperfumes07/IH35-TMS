import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../Toast";
import { CreateDriverModal } from "./CreateDriverModal";

// CHROME-11: nested call sites (VendorBillForm's "+ Create driver" inside the Bill ParityDrawer)
// must render this SAME canonical creator (Blueprint 4.2.2.1) as a right ParityDrawer, never a
// centered Modal stacked on top of an already-open money drawer. shell="modal" (default, used by
// the Drivers module / Safety Driver Files / Cash-advance inline create) must keep the existing
// centered chrome unchanged.

vi.mock("../../api/org", () => ({
  listMyCompanies: vi.fn().mockResolvedValue({
    companies: [
      {
        id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
        code: "TST",
        legal_name: "Test OpCo",
        short_name: "Test",
        company_type: "operating_carrier",
        is_active: true,
        is_default: true,
      },
    ],
  }),
}));

vi.mock("../../api/catalogs", () => ({
  listUsStates: vi.fn().mockResolvedValue({ states: [] }),
  listMexicoStates: vi.fn().mockResolvedValue({ states: [] }),
}));

vi.mock("../../api/mdata", () => ({
  checkReturningDriver: vi.fn().mockResolvedValue({ returning_driver: false }),
  createDriver: vi.fn(),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CreateDriverModal shell chrome (CHROME-11)", () => {
  afterEach(cleanup);

  it("shell='modal' (default) renders the centered Modal — no ParityDrawer dialog", async () => {
    render(wrap(<CreateDriverModal open companyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" onClose={() => {}} />));
    await screen.findByRole("heading", { name: /create driver/i });
    // Modal's fixed centered backdrop — the Modal-on-drawer bug this block fixes.
    expect(document.querySelector(".fixed.inset-0.z-50")).toBeTruthy();
    // ParityDrawer always sets role="dialog" aria-label={title} — must be absent in modal mode.
    expect(screen.queryByRole("dialog", { name: /create driver/i })).toBeNull();
  });

  it("shell='drawer' (nested money-drawer call sites) renders ParityDrawer chrome — no centered Modal backdrop", async () => {
    render(
      wrap(
        <CreateDriverModal open companyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" onClose={() => {}} shell="drawer" />
      )
    );
    // ParityDrawer renders role="dialog" aria-label={title} — the shared right-drawer shell.
    await screen.findByRole("dialog", { name: /create driver/i });
    // Must NOT stack the centered z-50 Modal backdrop on top of the caller's already-open drawer.
    expect(document.querySelector(".fixed.inset-0.z-50")).toBeNull();
  });
});
