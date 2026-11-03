import { describe, expect, it } from "vitest";
import {
  toggleTxHealthEntityFilter,
  txHealthEntityChecked,
  txHealthEntityFilterActive,
  txHealthEntityIdsForApi,
} from "./txHealthEntityFilter";

const ALL = ["A", "B", "C"];

describe("toggleTxHealthEntityFilter", () => {
  it("all=[] counterexample: toggle(A) from all → [B,C], not [A]", () => {
    const next = toggleTxHealthEntityFilter(null, "A", ALL);
    expect(next).toEqual(["B", "C"]);
    expect(txHealthEntityChecked(next, "A")).toBe(false);
    expect(txHealthEntityChecked(next, "B")).toBe(true);
    expect(txHealthEntityChecked(next, "C")).toBe(true);
  });

  it("unchecking the last selected → none [], does not restore all", () => {
    let state = toggleTxHealthEntityFilter(null, "A", ALL); // [B,C]
    state = toggleTxHealthEntityFilter(state, "B", ALL); // [C]
    state = toggleTxHealthEntityFilter(state, "C", ALL); // []
    expect(state).toEqual([]);
    expect(txHealthEntityFilterActive(state)).toBe(true);
    expect(txHealthEntityChecked(state, "A")).toBe(false);
    expect(txHealthEntityChecked(null, "A")).toBe(true);
  });

  it("checking chips back to full set collapses to null (all)", () => {
    let state: string[] | null = [];
    state = toggleTxHealthEntityFilter(state, "A", ALL);
    state = toggleTxHealthEntityFilter(state, "B", ALL);
    state = toggleTxHealthEntityFilter(state, "C", ALL);
    expect(state).toBeNull();
    expect(txHealthEntityIdsForApi(state)).toEqual([]);
  });
});
