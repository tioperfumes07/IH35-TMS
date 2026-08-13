import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useStagedListFilters } from "./useStagedListFilters";

describe("useStagedListFilters", () => {
  it("does not commit edits before Apply and Cancel restores applied values", () => {
    const onApply = vi.fn();
    const { result } = renderHook(() =>
      useStagedListFilters({ applied: { status: "open" }, empty: { status: "" }, onApply }),
    );

    act(() => result.current.setDraft({ status: "paid" }));
    expect(result.current.draft.status).toBe("paid");
    expect(onApply).not.toHaveBeenCalled();

    act(() => result.current.cancel());
    expect(result.current.draft.status).toBe("open");
    expect(onApply).not.toHaveBeenCalled();

    act(() => result.current.setDraft({ status: "paid" }));
    act(() => result.current.apply());
    expect(onApply).toHaveBeenCalledWith({ status: "paid" });
  });

  it("Reset clears only the draft until Apply", () => {
    const onApply = vi.fn();
    const { result } = renderHook(() =>
      useStagedListFilters({ applied: { status: "open" }, empty: { status: "" }, onApply }),
    );
    act(() => result.current.reset());
    expect(result.current.draft.status).toBe("");
    expect(onApply).not.toHaveBeenCalled();
    act(() => result.current.apply());
    expect(onApply).toHaveBeenCalledWith({ status: "" });
  });
});
