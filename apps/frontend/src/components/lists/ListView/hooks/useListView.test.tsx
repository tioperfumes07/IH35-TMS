import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../../../api/client";
import { useListView } from "./useListView";

vi.mock("../../../../api/client", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

describe("useListView persistence failure truth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiRequestMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("surfaces a failed preference save and retries the exact draft", async () => {
    apiRequestMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({});

    const { result } = renderHook(() => useListView("coa-list-v1", []));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.loading).toBe(false);

    act(() => result.current.persistView({ pageSize: 100, density: "compact" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(result.current.persistError).toContain("could not be saved");
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, "/api/v1/users/me/table-preferences", {
      method: "PATCH",
      body: {
        table_id: "listview:coa-list-v1",
        saved_view: { pageSize: 100, density: "compact" },
      },
    });

    await act(async () => {
      result.current.retryPersist();
      await Promise.resolve();
    });
    expect(result.current.persistError).toBeNull();
    expect(apiRequestMock).toHaveBeenNthCalledWith(3, "/api/v1/users/me/table-preferences", {
      method: "PATCH",
      body: {
        table_id: "listview:coa-list-v1",
        saved_view: { pageSize: 100, density: "compact" },
      },
    });
  });
});
