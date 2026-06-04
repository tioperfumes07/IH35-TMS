import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBulkSelection } from "../useBulkSelection";

describe("useBulkSelection", () => {
  it("starts with empty selection", () => {
    const { result } = renderHook(() => useBulkSelection());
    expect(result.current.count).toBe(0);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("toggle adds and removes ids", () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => result.current.toggle("a"));
    expect(result.current.selectedIds.has("a")).toBe(true);
    act(() => result.current.toggle("a"));
    expect(result.current.selectedIds.has("a")).toBe(false);
  });

  it("selectAll adds page ids", () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => result.current.selectAll(["p1", "p2"]));
    expect(result.current.count).toBe(2);
    act(() => result.current.selectAll(["p3"]));
    expect(result.current.count).toBe(3);
  });

  it("persists selection across page changes", () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => result.current.selectAll(["page1-a", "page1-b"]));
    act(() => result.current.selectAll(["page2-c"]));
    expect(result.current.selectedIds.has("page1-a")).toBe(true);
    expect(result.current.selectedIds.has("page2-c")).toBe(true);
  });

  it("clear resets selection", () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => result.current.selectAll(["x", "y"]));
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
  });

  it("enforces cap and emits onCapExceeded", () => {
    const onCapExceeded = vi.fn();
    const { result } = renderHook(() => useBulkSelection({ cap: 2, onCapExceeded }));
    act(() => result.current.selectAll(["a", "b"]));
    act(() => result.current.toggle("c"));
    expect(result.current.count).toBe(2);
    expect(onCapExceeded).toHaveBeenCalledWith(
      expect.objectContaining({ code: "SELECTION_CAP_EXCEEDED", cap: 2 })
    );
  });
});
