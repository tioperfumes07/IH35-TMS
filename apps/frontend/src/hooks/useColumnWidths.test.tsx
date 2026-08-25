import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/client";
import { useColumnWidths } from "./useColumnWidths";

vi.mock("../api/client", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

describe("useColumnWidths persistence failure truth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiRequestMock.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it("surfaces a failed save and retries the exact width draft", async () => {
    apiRequestMock
      .mockResolvedValueOnce({ column_widths: { name: 120 } })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({});

    const { result } = renderHook(() => useColumnWidths("customers-master", { name: 120 }));
    await act(async () => { await Promise.resolve(); });

    act(() => result.current.setWidth("name", 240));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(result.current.persistError).toContain("could not be saved");
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, "/api/v1/users/me/table-preferences", {
      method: "PATCH",
      body: { table_id: "customers-master", column_widths: { name: 240 } },
    });

    await act(async () => {
      result.current.retryPersist();
      await Promise.resolve();
    });
    expect(result.current.persistError).toBeNull();
    expect(apiRequestMock).toHaveBeenNthCalledWith(3, "/api/v1/users/me/table-preferences", {
      method: "PATCH",
      body: { table_id: "customers-master", column_widths: { name: 240 } },
    });
  });
});
