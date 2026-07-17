import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useUrlSort } from "./useUrlSort";

function renderUrlSort(initialEntries: string[] = ["/"]) {
  return renderHook(() => useUrlSort(), {
    wrapper: ({ children }) => <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>,
  });
}

describe("useUrlSort", () => {
  it("defaults to unsorted with no ?sort=/?dir= present", () => {
    const { result } = renderUrlSort();
    expect(result.current.sortKey).toBe("");
    expect(result.current.sortDirection).toBe("asc");
  });

  it("seeds initial state from ?sort=/?dir= in the URL", () => {
    const { result } = renderUrlSort(["/loads?sort=customer&dir=desc"]);
    expect(result.current.sortKey).toBe("customer");
    expect(result.current.sortDirection).toBe("desc");
  });

  it("onSortChange writes the key/dir into the URL params", () => {
    const { result } = renderUrlSort();
    act(() => result.current.onSortChange("load_number", "desc"));
    expect(result.current.sortKey).toBe("load_number");
    expect(result.current.sortDirection).toBe("desc");
  });

  it("onSortChange('') clears the sort key from the URL", () => {
    const { result } = renderUrlSort(["/loads?sort=status&dir=desc"]);
    act(() => result.current.onSortChange("", "asc"));
    expect(result.current.sortKey).toBe("");
  });

  // BANK-SORT-ROLLOUT-OPS — additive toggleSort convenience for TableHeaderCell-driven pages
  // (dispatch board, settlements list) that render their own <th> instead of ParityTable.
  describe("toggleSort", () => {
    it("cycles asc -> desc -> unsorted, same contract as TableHeaderCell/useTableController", () => {
      const { result } = renderUrlSort();
      act(() => result.current.toggleSort("load_number"));
      expect(result.current.sortKey).toBe("load_number");
      expect(result.current.sortDirection).toBe("asc");

      act(() => result.current.toggleSort("load_number"));
      expect(result.current.sortKey).toBe("load_number");
      expect(result.current.sortDirection).toBe("desc");

      act(() => result.current.toggleSort("load_number"));
      expect(result.current.sortKey).toBe("");
    });

    it("switching to a different column resets direction to asc", () => {
      const { result } = renderUrlSort(["/loads?sort=status&dir=desc"]);
      act(() => result.current.toggleSort("customer"));
      expect(result.current.sortKey).toBe("customer");
      expect(result.current.sortDirection).toBe("asc");
    });
  });
});
