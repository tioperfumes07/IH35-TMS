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

  it("selectPage is page-scoped — replaces with exactly those ids", () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => result.current.selectPage(["page1-a", "page1-b"]));
    expect(result.current.count).toBe(2);
    act(() => result.current.selectPage(["page2-c"]));
    expect(result.current.count).toBe(1);
    expect(result.current.selectedIds.has("page1-a")).toBe(false);
    expect(result.current.selectedIds.has("page2-c")).toBe(true);
  });

  it("SEL-01: selectAll selects the full matching set passed in (not page-only alias)", () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => result.current.selectPage(["page1-a"]));
    act(() => result.current.selectAll(["a", "b", "c", "d"]));
    expect(result.current.count).toBe(4);
    expect(result.current.selectedIds.has("page1-a")).toBe(false);
    expect(result.current.selectedIds.has("d")).toBe(true);
  });

  it("selectMatching selects a full matching set (cap enforced)", () => {
    const { result } = renderHook(() => useBulkSelection({ cap: 3 }));
    act(() => result.current.selectPage(["a"]));
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
    expect(onCapExceeded).toHaveBeenCalled();
  });

  it("selectMatching over cap is a no-op with onCapExceeded", () => {
    const onCapExceeded = vi.fn();
    const { result } = renderHook(() => useBulkSelection({ cap: 2, onCapExceeded }));
    act(() => result.current.selectPage(["a"]));
    act(() => result.current.selectMatching(["a", "b", "c"]));
    expect(result.current.count).toBe(1);
    expect(onCapExceeded).toHaveBeenCalled();
  });
});
