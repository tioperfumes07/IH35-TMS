import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserPreferences, patchUserPreferences } from "../api/safety";
import { useViewModePref } from "./useViewModePref";

vi.mock("../api/safety", () => ({
  getUserPreferences: vi.fn(),
  patchUserPreferences: vi.fn(),
}));

const getPreferencesMock = vi.mocked(getUserPreferences);
const patchPreferencesMock = vi.mocked(patchUserPreferences);

describe("useViewModePref failure truth", () => {
  beforeEach(() => {
    getPreferencesMock.mockReset().mockResolvedValue({ preferences: {} });
    patchPreferencesMock.mockReset();
  });

  it("keeps a failed server preference visible and retries the exact mode", async () => {
    patchPreferencesMock
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ preferences: { customers_view_mode: "list" } });
    const { result } = renderHook(() => useViewModePref("customers", "master-detail"));

    await act(async () => {
      result.current.setViewMode("list");
      await Promise.resolve();
    });
    expect(result.current.viewMode).toBe("list");
    expect(result.current.viewModeSaveError).toContain("could not be saved");
    expect(patchPreferencesMock).toHaveBeenNthCalledWith(1, { customers_view_mode: "list" });

    await act(async () => {
      result.current.retryViewModeSave();
      await Promise.resolve();
    });
    expect(result.current.viewModeSaveError).toBeNull();
    expect(patchPreferencesMock).toHaveBeenNthCalledWith(2, { customers_view_mode: "list" });
  });
});
