import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DriverDuplicateDialog, reasonsLabel, type DriverDuplicateCandidate } from "./DriverDuplicateDialog";

const inactive: DriverDuplicateCandidate = {
  driver_id: "d-1",
  full_name: "Hugo Gaytan",
  cdl_number: "TAMP310697",
  created_at: "2026-08-21T00:00:00Z",
  matched_on: "name_exact",
  reasons: ["name_exact", "cdl_one_char"],
  strength: "strong",
  state: "deactivated",
  status: "Inactive",
  phone_last4: "0101",
};

function renderDialog(over: Partial<Parameters<typeof DriverDuplicateDialog>[0]> = {}) {
  const props = {
    open: true,
    attemptedName: "Hugo Gaytan",
    candidates: [inactive],
    onOpenExisting: vi.fn(),
    onCreateAnyway: vi.fn(),
    onCancel: vi.fn(),
    ...over,
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <DriverDuplicateDialog {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return props;
}

describe("DriverDuplicateDialog", () => {
  it("lists the existing profile with why it matched, and opens it (reactivate for an inactive one)", () => {
    const props = renderDialog();
    expect(screen.getByTestId("driver-duplicate-dialog")).toBeTruthy();
    expect(screen.getByText("Same name · CDL one character apart")).toBeTruthy();
    expect(screen.getByText("…0697")).toBeTruthy();
    fireEvent.click(screen.getByTestId("driver-duplicate-open-d-1"));
    expect(props.onOpenExisting).toHaveBeenCalledWith("d-1");
    expect(screen.getByText("Open & reactivate")).toBeTruthy();
  });

  it("will not create a second profile for a strong match until 'different person' is confirmed", () => {
    const props = renderDialog();
    const create = screen.getByTestId("driver-duplicate-create-anyway") as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("driver-duplicate-confirm-different"));
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    expect(props.onCreateAnyway).toHaveBeenCalledTimes(1);
  });

  it("a 'possible' match only (no strong/hard) needs no confirmation checkbox", () => {
    renderDialog({ candidates: [{ ...inactive, strength: "possible", reasons: ["name_contains"], matched_on: "name_contains", state: "active" }] });
    expect(screen.queryByTestId("driver-duplicate-confirm-different")).toBeNull();
    expect((screen.getByTestId("driver-duplicate-create-anyway") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Use this driver")).toBeTruthy();
  });

  it("reasonsLabel falls back to matched_on for older server payloads", () => {
    expect(reasonsLabel({ ...inactive, reasons: undefined, matched_on: "cdl_exact" })).toBe("Same CDL");
  });
});
