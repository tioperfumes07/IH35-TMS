// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUserPreferences: vi.fn() }));
vi.mock("../../api/safety", () => ({ getUserPreferences: mocks.getUserPreferences }));

import { Modal } from "../Modal";

afterEach(() => cleanup());

// U7 (owner, 2026-10-03): "Create Check is out of proportion — a modal, QBO size". An xl modal opened at 85% of the
// window — ~2,040 px on a 2,400 px screen. Its default width is capped at 1,280 px; a saved size still wins.
describe("xl modal default width (U7)", () => {
  function open(stored?: { w: number; h: number }) {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 2400 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1300 });
    mocks.getUserPreferences.mockResolvedValue({ preferences: { ui: { modal_sizes: stored ? { "check-write": stored } : {} } } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <Modal open onClose={() => undefined} title="Check" modalKind="check-write" sizePreset="xl">body</Modal>
      </QueryClientProvider>,
    );
  }
  const panelWidth = () => {
    const sized = Array.from(document.querySelectorAll<HTMLElement>("[style]")).find((el) => /px$/.test(el.style.width) && /px$/.test(el.style.height));
    return sized ? parseFloat(sized.style.width) : NaN;
  };

  it("opens no wider than 1,280 px on a wide screen when nothing is saved", async () => {
    open();
    await waitFor(() => expect(panelWidth()).toBeGreaterThan(0));
    expect(panelWidth()).toBeLessThanOrEqual(1280);
  });

  it("a size the user saved by resizing still wins", async () => {
    open({ w: 1700, h: 900 });
    await waitFor(() => expect(panelWidth()).toBe(1700));
  });
});
