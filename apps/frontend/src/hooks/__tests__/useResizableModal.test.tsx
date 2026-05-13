import { act, renderHook, waitFor } from "@testing-library/react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useResizableModal } from "../useResizableModal";

describe("useResizableModal", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("applies persisted {w,h} when enabled becomes true", async () => {
    localStorage.setItem("ih35.modalSize.persist-test", JSON.stringify({ w: 612, h: 412 }));

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useResizableModal({
          enabled,
          modalKey: "persist-test",
          minWidth: 320,
          minHeight: 240,
          defaultWidth: 880,
          defaultHeight: 640,
        }),
      { initialProps: { enabled: false } }
    );

    expect(result.current.size).toEqual({ w: 880, h: 640 });

    rerender({ enabled: true });

    await waitFor(() => {
      expect(result.current.size).toEqual({ w: 612, h: 412 });
    });
  });

  it("persists size to localStorage after drag end", async () => {
    const { result } = renderHook(() =>
      useResizableModal({
        enabled: true,
        modalKey: "drag-test",
        minWidth: 320,
        minHeight: 240,
        defaultWidth: 880,
        defaultHeight: 640,
      })
    );

    act(() => {
      result.current.resizeHandleProps.onMouseDown({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 100,
        clientY: 100,
      } as unknown as ReactMouseEvent);
    });

    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 250, clientY: 280 }));
    });

    await waitFor(() => {
      expect(result.current.size.w).toBeGreaterThan(880);
      expect(result.current.size.h).toBeGreaterThan(640);
    });

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });

    const raw = localStorage.getItem("ih35.modalSize.drag-test");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw ?? "{}") as { w: number; h: number };
    expect(parsed.w).toBe(result.current.size.w);
    expect(parsed.h).toBe(result.current.size.h);
  });
});
