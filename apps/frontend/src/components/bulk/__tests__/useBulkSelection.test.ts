import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBulkSelection } from "../useBulkSelection";

describe("useBulkSelection", () => {
  it("starts with empty selection", () => {
    const { result } = renderHook(() => useBulkSelection());
    expect(result.current.count).toBe(0);
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.cap).toBe(200);
  });

  it("toggle adds and removes ids", () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => result.current.toggle("a"));
    expect(result.current.selectedIds.has("a")).toBe(true);
    act(() => result.current.toggle("a"));
    expect(result.current.selectedIds.has("a")).toBe(false);
  });

  it("selectAll is page-scoped — replaces prior page, does not accumulate", () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => result.current.selectAll(["page1-a", "page1-b"]));
    expect(result.current.count).toBe(2);
    act(() => result.current.selectAll(["page2-c"]));
    expect(result.current.count).toBe(1);
    expect(result.current.selectedIds.has("page1-a")).toBe(false);
    expect(result.current.selectedIds.has("page2-c")).toBe(true);
  });

  it("selectMatching deliberately selects a full matching set (cap enforced)", () => {
    const { result } = renderHook(() => useBulkSelection({ cap: 3 }));
    act(() => result.current.selectAll(["a"]));
    act(() => result.current.selectMatching(["a", "b", "c"]));
    expect(result.current.count).toBe(3);
  });

  it("clear resets selection", () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => result.current.selectAll(["x", "y"]));
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
  });

  it("enforces cap with no-op (never silent truncate) and emits onCapExceeded", () => {
    const onCapExceeded = vi.fn();
    const { result } = renderHook(() => useBulkSelection({ cap: 2, onCapExceeded }));
    act(() => result.current.selectAll(["a", "b"]));
    act(() => result.current.toggle("c"));
    expect(result.current.count).toBe(2);
    expect(result.current.selectedIds.has("c")).toBe(false);
    expect(onCapExceeded).toHaveBeenCalledWith(
      expect.objectContaining({ code: "SELECTION_CAP_EXCEEDED", cap: 2, attempted: 3 })
    );
  });

  it("selectMatching over cap is a no-op with onCapExceeded", () => {
    const onCapExceeded = vi.fn();
    const { result } = renderHook(() => useBulkSelection({ cap: 2, onCapExceeded }));
    act(() => result.current.selectAll(["a"]));
    act(() => result.current.selectMatching(["a", "b", "c"]));
    expect(result.current.count).toBe(1);
    expect(onCapExceeded).toHaveBeenCalledWith(
      expect.objectContaining({ code: "SELECTION_CAP_EXCEEDED", cap: 2, attempted: 3 })
    );
  });
});
