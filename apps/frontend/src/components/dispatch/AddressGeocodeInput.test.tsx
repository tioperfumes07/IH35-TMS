// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddressGeocodeInput } from "./AddressGeocodeInput";
import { geocodeSearch } from "../../api/geocoding";

vi.mock("../../hooks/useFeatureFlag", () => ({ useFeatureFlag: () => ({ enabled: true }) }));
vi.mock("../../api/geocoding", () => ({ geocodeSearch: vi.fn() }));

describe("AddressGeocodeInput geocode failure recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(geocodeSearch).mockReset();
  });

  it("distinguishes an outage from zero matches and retries the exact query", async () => {
    vi.mocked(geocodeSearch)
      .mockRejectedValueOnce(new Error("proxy unavailable"))
      .mockResolvedValueOnce({
        enabled: true,
        results: [{
          formatted: "100 Main St, Dallas, TX",
          address_line1: "100 Main St",
          city: "Dallas",
          state: "TX",
          zip: "75201",
          country: "USA",
          lat: 32.7767,
          lon: -96.797,
        }],
      });

    render(
      <AddressGeocodeInput value="100 Main St" onChange={vi.fn()} onResolve={vi.fn()} />,
    );
    await act(async () => vi.advanceTimersByTimeAsync(400));

    expect(screen.getByRole("alert").textContent).toContain("Address suggestions are unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await act(async () => vi.advanceTimersByTimeAsync(400));

    expect(geocodeSearch).toHaveBeenNthCalledWith(1, "100 Main St");
    expect(geocodeSearch).toHaveBeenNthCalledWith(2, "100 Main St");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("100 Main St, Dallas, TX")).toBeTruthy();
  });
});
