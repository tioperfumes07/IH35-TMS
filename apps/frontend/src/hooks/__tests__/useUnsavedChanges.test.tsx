import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useUnsavedChanges } from "../useUnsavedChanges";

describe("useUnsavedChanges", () => {
  it("isDirty is false when current matches baseline", () => {
    const baseline = { a: 1, b: "x" };
    const { result } = renderHook(() => useUnsavedChanges({ a: 1, b: "x" }, baseline));
    expect(result.current.isDirty).toBe(false);
  });

  it("isDirty is true when any serializable field differs", () => {
    const baseline = { a: 1, b: "x" };
    const { result } = renderHook(() => useUnsavedChanges({ a: 2, b: "x" }, baseline));
    expect(result.current.isDirty).toBe(true);
  });
});
