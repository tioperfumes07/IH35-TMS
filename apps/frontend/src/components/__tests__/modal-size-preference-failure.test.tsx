// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserPreferences: vi.fn(),
  persistModalSize: vi.fn(),
}));

vi.mock("../../api/safety", () => ({
  getUserPreferences: mocks.getUserPreferences,
}));

vi.mock("../../lib/modal-size-prefs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/modal-size-prefs")>();
  return { ...actual, persistModalSize: mocks.persistModalSize };
});

vi.mock("../ui/ResizeHandle", () => ({
  ResizeHandle: ({ onPointerDrag, onPointerDone }: { onPointerDrag: (dx: number, dy: number) => void; onPointerDone: () => void }) => (
    <>
      <button type="button" onClick={() => onPointerDrag(24, 36)}>Test resize</button>
      <button type="button" onClick={onPointerDone}>Test resize done</button>
    </>
  ),
}));

import { Modal } from "../Modal";

expect.extend(jestDomMatchers);

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Modal open onClose={() => undefined} title="Preference test" modalKind="preference-test" sizePreset="md">
        body
      </Modal>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Modal size preference failures", () => {
  it("shows a retryable load failure instead of silently using an authoritative-looking default", async () => {
    mocks.getUserPreferences.mockRejectedValue(new Error("preferences unavailable"));
    renderModal();

    expect(await screen.findByRole("alert")).toHaveTextContent("Saved modal size is unavailable");
    mocks.getUserPreferences.mockResolvedValue({ preferences: { ui: { modal_sizes: {} } } });
    fireEvent.click(screen.getByRole("button", { name: "Retry load" }));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(mocks.getUserPreferences).toHaveBeenCalledTimes(2);
  });

  it("keeps the exact failed dimensions and retries the write visibly", async () => {
    mocks.getUserPreferences.mockResolvedValue({ preferences: { ui: { modal_sizes: {} } } });
    mocks.persistModalSize.mockRejectedValueOnce(new Error("save unavailable")).mockResolvedValueOnce(undefined);
    renderModal();

    fireEvent.click(await screen.findByRole("button", { name: "Test resize" }));
    fireEvent.click(screen.getByRole("button", { name: "Test resize done" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Modal size was not saved");
    const failedSize = mocks.persistModalSize.mock.calls[0]?.[1];
    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(mocks.persistModalSize).toHaveBeenCalledTimes(2);
    expect(mocks.persistModalSize.mock.calls[1]?.[1]).toEqual(failedSize);
  });
});
