// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../Toast";
import { CreateDriverModal } from "./CreateDriverModal";

// CHROME-11: nested call sites (VendorBillForm's "+ Create driver" inside the Bill ParityDrawer)
// must render this SAME canonical creator (Blueprint 4.2.2.1) as a right ParityDrawer, never a
// centered Modal stacked on top of an already-open money drawer.
//
// C7 (2026-07-25): the default shell="modal" path is no longer a CENTERED card — it is now the
// shared `<Modal variant="drawer">` create drawer (480px, right-anchored, focus-trapped,
// unsaved-guarded). CHROME-11's invariant is unchanged and still asserted below: the nested
// shell="drawer" path must render ParityDrawer chrome and must NOT stack the shared Modal's
// z-50 overlay over the caller's already-open money drawer.
//
// The old discriminator ("shell='modal' renders no role=dialog") was a PROXY for "this is not a
// ParityDrawer". The shared Modal has since gained role="dialog"/aria-modal — an a11y fix, not a
// regression — so the proxy is replaced here with the exact discriminator `data-modal-variant`,
// which only the shared Modal emits. Strictly more precise than what it replaces.

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

  it("shell='modal' (default) renders the shared Modal — as the C7 create drawer, not ParityDrawer", async () => {
    render(wrap(<CreateDriverModal open companyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" onClose={() => {}} />));
    await screen.findByRole("heading", { name: /create driver/i });
    // Identify the shared Modal by its OWN discriminator, not by a z-index literal: the overlay moved
    // z-50 -> z-[70] (Modal.tsx:176) and this selector silently stopped matching. `data-modal-variant` is
    // emitted only by the shared Modal — ParityDrawer never does — which this file already calls the exact
    // discriminator a few lines up. A class-literal proxy re-breaks on every restack.
    expect(document.querySelector("[data-modal-variant]")).toBeTruthy();
    // Only the shared Modal emits data-modal-variant — ParityDrawer never does.
    const panel = screen.getByRole("dialog", { name: /create driver/i });
    expect(panel.dataset.modalVariant).toBe("drawer");
    // C7: it is the 480px right drawer, not the old centered card.
    expect(panel.className).toContain("sm:w-[480px]");
    expect(panel.parentElement?.className).toContain("justify-end");
  });

  it("shell='drawer' (nested money-drawer call sites) renders ParityDrawer chrome — no centered Modal backdrop", async () => {
    render(
      wrap(
        <CreateDriverModal open companyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" onClose={() => {}} shell="drawer" />
      )
    );
    // ParityDrawer renders role="dialog" aria-label={title} — the shared right-drawer shell.
    const panel = await screen.findByRole("dialog", { name: /create driver/i });
    // ParityDrawer, not the shared Modal: it never emits data-modal-variant.
    expect(panel.dataset.modalVariant).toBeUndefined();
    // Must NOT stack the shared Modal's z-50 overlay on top of the caller's already-open drawer.
    // Same discriminator, negated: the nested path must NOT stack a shared-Modal overlay over the
    // caller's already-open money drawer.
    expect(document.querySelector("[data-modal-variant]")).toBeNull();
  });
});
