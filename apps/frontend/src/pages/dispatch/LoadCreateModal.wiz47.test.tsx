import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { LoadCreateModal } from "./LoadCreateModal";
import { BookLoadValidationSection } from "./components/BookLoadValidationSection";

// WIZ-47 GUARD (owner 2026-09-04). The owner was blocked from booking load 13508: the submit
// button was greyed by `repairBlockSubmitBlocked` (the unit-repair / availability gate) with NO
// reachable override, while the BOOK + DISPATCH CHECKS panel rendered that same gate GREEN and the
// pre-dispatch panel claimed the booking was "cleared". Three readouts, three truths.
//
// This guard asserts the fixed contract, and FAILS on the pre-fix components:
//   (a) an active repair WO renders a first-class BLOCKER ROW carrying a rule code, the unit, the
//       open work order, and a reachable, reason-carrying override control;
//   (b) submit stays blocked until a >=10-char override reason is entered, then enables;
//   (c) a gate that blocks submit renders "blocked" (red ✕) in the checks panel — never a green ✓.
const getDriverLoadAvailability = vi.hoisted(() => vi.fn());
vi.mock("../../api/dispatch", () => ({ getDriverLoadAvailability }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

const COMPANY = "22222222-2222-2222-2222-222222222222";
const DRIVER = "fba21d80-0000-0000-0000-000000000000";

const REPAIR_BLOCK = {
  ok: false,
  code: "E_DRIVER_REPAIR_BLOCK" as const,
  blocker: "Unit T156 has an active repair work order",
  work_order_id: "wo-1",
  work_order_display_id: "WO-T156-IS-09-01-2026-0041-23914",
  asset_id: "unit-t156",
  asset_label: "T156",
};

// Drives the reason like the parent (BookLoadModalV4) does — a controlled string.
function Harness({ onSubmitBlockedChange }: { onSubmitBlockedChange: (b: boolean) => void }) {
  const [reason, setReason] = useState("");
  return (
    <LoadCreateModal
      operatingCompanyId={COMPANY}
      selectedDriverId={DRIVER}
      overrideReason={reason}
      onOverrideReasonChange={setReason}
      onSubmitBlockedChange={onSubmitBlockedChange}
    />
  );
}

beforeEach(() => {
  getDriverLoadAvailability.mockReset();
});

describe("WIZ-47 — unit-repair gate is a visible, reason-carrying, reachable blocker", () => {
  it("(a) an active repair WO renders a blocker row with rule code, WO, unit and an override control", async () => {
    getDriverLoadAvailability.mockResolvedValue(REPAIR_BLOCK);
    render(<Harness onSubmitBlockedChange={vi.fn()} />, { wrapper });

    const row = await screen.findByTestId("book-load-repair-blocker-row");
    expect(row).toBeTruthy();
    // rule code + subject unit + the missing open work order
    expect(screen.getByText("UNIT-REPAIR-WO")).toBeTruthy();
    expect(screen.getByText(/WO-T156-IS-09-01-2026-0041-23914/)).toBeTruthy();
    // a reachable override control (not a hidden gate)
    expect(screen.getByTestId("repair-block-override-reason")).toBeTruthy();
  });

  it("(b) submit stays blocked until a >=10-char reason is entered, then enables", async () => {
    getDriverLoadAvailability.mockResolvedValue(REPAIR_BLOCK);
    const onSubmitBlockedChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSubmitBlockedChange={onSubmitBlockedChange} />, { wrapper });

    await screen.findByTestId("book-load-repair-blocker-row");
    // initially blocked
    await waitFor(() => expect(onSubmitBlockedChange).toHaveBeenLastCalledWith(true));
    expect(screen.getByTestId("repair-block-submit-blocked")).toBeTruthy();

    // a short reason does NOT clear the block
    await user.type(screen.getByTestId("repair-block-override-reason"), "too short");
    expect(onSubmitBlockedChange).toHaveBeenLastCalledWith(true);

    // a >=10-char reason clears it and records the override
    await user.clear(screen.getByTestId("repair-block-override-reason"));
    await user.type(
      screen.getByTestId("repair-block-override-reason"),
      "Shop cleared this unit verbally; WO closes tomorrow AM."
    );
    await waitFor(() => expect(onSubmitBlockedChange).toHaveBeenLastCalledWith(false));
    expect(screen.getByTestId("repair-block-override-recorded")).toBeTruthy();
  });

  it("(c) the checks panel renders a blocking gate as blocked (red ✕), never a green live ✓", () => {
    render(
      <BookLoadValidationSection
        checks={[
          { text: "Unit repair / availability gate", code: "override required", state: "blocked" },
          { text: "DVIR major-defect authorization gate", code: "authorization required", state: "live" },
        ]}
      />
    );
    // the blocking gate is surfaced as an active blocker, not a passing live gate
    expect(screen.getByLabelText("Active blocker")).toBeTruthy();
    expect(screen.getByText(/1 active blocker/)).toBeTruthy();
    // it must NOT be counted among the live gates — a blocked gate is not "1 live gate" here
    expect(screen.getByText(/1 live gates/)).toBeTruthy();
  });
});
