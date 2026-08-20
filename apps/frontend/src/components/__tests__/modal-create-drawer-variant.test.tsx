// @vitest-environment jsdom
//
// C7 — the shared create drawer. These assertions are the RUNTIME half of
// scripts/verify-create-surface-is-drawer.mjs: the static guard proves every create surface passes
// `variant="drawer"`, and this proves the shape that prop actually produces.
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "../Modal";
import { PARITY_CREATE_DRAWER_WIDTH, paritySizing } from "../parity/sizing";
import { CivilFineTypeModal } from "../../pages/lists/safety/CivilFineTypeModal";

expect.extend(jestDomMatchers);

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
});

function panel(name: string) {
  return screen.getByRole("dialog", { name });
}

// ParityDrawer's panel z-index, read from components/parity/ParityDrawer.tsx (z-[60]). Kept as a named
// constant so a restack shows up as one obvious edit rather than a scattered literal.
const PARITY_DRAWER_PANEL_Z = 60;

describe("Modal variant=\"drawer\" (C7 create surface chrome)", () => {
  it("defaults to the centered card, so every untouched non-create modal keeps its shape", () => {
    render(wrap(<Modal open onClose={() => {}} title="Void this row?">body</Modal>));
    const el = panel("Void this row?");
    expect(el.dataset.modalVariant).toBe("center");
    expect(el.className).toContain("rounded-lg");
    expect(el.className).not.toContain("sm:w-[480px]");
    expect(el.parentElement?.className).toContain("items-center");
  });

  it("renders a right-anchored 480px panel when variant=\"drawer\"", () => {
    render(wrap(<Modal open onClose={() => {}} title="Create Thing" variant="drawer">body</Modal>));
    const el = panel("Create Thing");
    expect(el.dataset.modalVariant).toBe("drawer");
    // width comes from the shared token, never a literal at the call site
    expect(PARITY_CREATE_DRAWER_WIDTH).toBe("w-full sm:w-[480px]");
    expect(paritySizing.createDrawerWidthPx).toBe(480);
    expect(el.className).toContain(PARITY_CREATE_DRAWER_WIDTH);
    expect(el.className).toContain("h-full");
    // right-anchored, not centered
    expect(el.parentElement?.className).toContain("justify-end");
    expect(el.parentElement?.className).not.toContain("items-center");
  });

  it("stacks ABOVE the ParityDrawer money panel and portals to document.body", () => {
    const { container } = render(
      wrap(<Modal open onClose={() => {}} title="Create Thing" variant="drawer">body</Modal>),
    );
    const overlay = panel("Create Thing").parentElement!;
    // Assert the RELATIONSHIP, not a literal. This pinned "z-50" and the overlay is now z-[70]; the
    // invariant that actually matters is unchanged — the create drawer must sit ABOVE ParityDrawer's
    // panel — and a hardcoded class fails on any restack even when the ordering is still correct.
    const zOf = (cls: string) => Number(/z-\[?(\d+)\]?/.exec(cls)?.[1] ?? "0");
    expect(zOf(overlay.className)).toBeGreaterThan(PARITY_DRAWER_PANEL_Z);
    // portalled: the overlay is NOT inside the component's own container subtree, so a create
    // drawer opened from inside a money panel cannot be trapped in that panel's stacking context.
    expect(container.contains(overlay)).toBe(false);
    expect(document.body.contains(overlay)).toBe(true);
  });

  it("inherits the SAME a11y as the centered card: dialog role, X close, Escape", () => {
    const onClose = vi.fn();
    render(wrap(<Modal open onClose={onClose} title="Create Thing" variant="drawer">body</Modal>));
    expect(panel("Create Thing").getAttribute("aria-modal")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Close Create Thing" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("drawer variant always shows ← back (NAV-BACK-NESTED-CREATE)", () => {
    const onClose = vi.fn();
    render(wrap(<Modal open onClose={onClose} title="Create Vendor" variant="drawer">body</Modal>));
    fireEvent.click(screen.getByRole("button", { name: "Back to previous surface" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("centered card does NOT show ← back (confirm/detail chrome unchanged)", () => {
    render(wrap(<Modal open onClose={() => {}} title="Void this row?">body</Modal>));
    expect(screen.queryByRole("button", { name: "Back to previous surface" })).toBeNull();
  });

  it("inherits the unsaved-changes guard: a dirty drawer confirms before discarding", () => {
    const onClose = vi.fn();
    render(
      wrap(
        <Modal open onClose={onClose} title="Create Thing" variant="drawer" confirmDiscardOnClose isDirty>
          body
        </Modal>,
      ),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
  });

  it("a real migrated call site (Safety civil-fine-type create) opens as the drawer", () => {
    render(
      wrap(
        <CivilFineTypeModal open companyId="c-1" row={null} onClose={() => {}} onSaved={() => {}} />,
      ),
    );
    const el = panel("Create Civil Fine Type");
    expect(el.dataset.modalVariant).toBe("drawer");
    expect(el.className).toContain(PARITY_CREATE_DRAWER_WIDTH);
  });
});
