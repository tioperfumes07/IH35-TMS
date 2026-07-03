import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { resolveListState } from "./listState";
import { useListState } from "./useListState";

// react-query v5 status shapes for the three settle stages.
const pending = { isPending: true, isError: false, isFetching: true };
const success = { isPending: false, isError: false, isFetching: false };
const errored = { isPending: false, isError: true, isFetching: false };
const refetching = { isPending: false, isError: false, isFetching: true };

describe("resolveListState — the four states", () => {
  it("returns loading while the query is pending (no data yet)", () => {
    // Zero rows during the initial fetch must NOT read as empty (the root defect).
    expect(resolveListState(pending, true)).toBe("loading");
    expect(resolveListState(pending, false)).toBe("loading");
  });

  it("returns error on a settled error, never empty", () => {
    expect(resolveListState(errored, true)).toBe("error");
    expect(resolveListState(errored, false)).toBe("error");
  });

  it("returns empty ONLY on a settled, non-fetching, zero-row query", () => {
    expect(resolveListState(success, true)).toBe("empty");
  });

  it("returns data on a settled query with rows", () => {
    expect(resolveListState(success, false)).toBe("data");
  });
});

describe("resolveListState — race safety", () => {
  it("a slow/settling query with zero rows still-fetching reads as loading, not empty", () => {
    // The exact defect: data not yet arrived → must be loading, never a false empty.
    expect(resolveListState(refetching, true)).toBe("loading");
  });

  it("once the same query settles with rows it flips to data", () => {
    expect(resolveListState({ isPending: false, isError: false, isFetching: false }, false)).toBe("data");
  });

  it("treats missing isFetching as not-fetching (settled empty)", () => {
    expect(resolveListState({ isPending: false, isError: false }, true)).toBe("empty");
  });
});

describe("useListState hook", () => {
  it("exposes boolean flags matching the resolved state", () => {
    const loading = renderHook(() => useListState(pending, true)).result.current;
    expect(loading.state).toBe("loading");
    expect(loading.isLoading).toBe(true);
    expect(loading.isEmpty).toBe(false);

    const empty = renderHook(() => useListState(success, true)).result.current;
    expect(empty.state).toBe("empty");
    expect(empty.isEmpty).toBe(true);

    const data = renderHook(() => useListState(success, false)).result.current;
    expect(data.state).toBe("data");
    expect(data.isData).toBe(true);

    const error = renderHook(() => useListState(errored, false)).result.current;
    expect(error.state).toBe("error");
    expect(error.isError).toBe(true);
  });

  it("does not show empty for a filtered-to-zero result during the initial fetch", () => {
    const { result } = renderHook(() => useListState(pending, true));
    expect(result.current.isEmpty).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });
});
