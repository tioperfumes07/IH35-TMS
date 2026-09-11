import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getOfficeTransitionButtons } from "@ih35/shared-types";
import { InlineStatusPicker } from "./InlineStatusPicker";
import type { LoadStatus } from "../../api/loads";
import { STATUS_LABEL } from "./constants";

// STATUS-DROPDOWN-CORRECTNESS (owner correction 2026-09-11, verbatim): "the guard must assert
// CORRECTNESS not presence -- for the status dropdown, the guard must assert the option list
// length/contents match getOfficeTransitionButtons' output, not just that InlineStatusPicker is
// mounted." verify-status-dropdown-sweep.mjs (this session, earlier) only ever checked that the
// component was mounted on each surface -- it never checked WHAT it offered, so the previously-
// hardcoded 5-status DISPATCHER_STATUS_OPTIONS array shipped and stayed broken behind a green guard.
// This suite renders the real component at several real statuses and asserts its rendered option
// set is EXACTLY getOfficeTransitionButtons(status)'s own output -- the single shared state machine
// LoadStatusChanger already uses -- so the two controls can never again silently diverge.
describe("InlineStatusPicker — option list matches getOfficeTransitionButtons exactly, per status", () => {
  const statuses: LoadStatus[] = [
    "assigned_not_dispatched",
    "dispatched",
    "in_transit",
    "delivered_pending_docs",
    "completed_docs_received",
    "cancelled", // terminal: zero legal transitions
  ];

  for (const status of statuses) {
    it(`at status="${status}", renders exactly the transitions getOfficeTransitionButtons(status) returns`, () => {
      const expected = getOfficeTransitionButtons(status);
      const onSelect = vi.fn();
      render(<InlineStatusPicker loadId="load-1" status={status} onSelect={onSelect} />);

      const trigger = screen.getByTestId("inline-status-picker-load-1");

      if (expected.length === 0) {
        // Terminal status: no legal transitions -- the trigger must be non-interactive (disabled),
        // never a dropdown offering illegal backward moves (the old hardcoded-array bug's exact
        // failure: a "cancelled" load was still offered "Dispatched"/"In transit").
        expect(trigger).toBeDisabled();
        return;
      }

      fireEvent.click(trigger);
      const menu = screen.getByTestId("inline-status-menu-load-1");
      const optionButtons = within(menu).getAllByRole("option");

      expect(optionButtons).toHaveLength(expected.length);
      const renderedTargets = optionButtons.map((btn) => btn.getAttribute("data-testid"));
      for (const t of expected) {
        expect(renderedTargets).toContain(`inline-status-option-load-1-${t.target}`);
        expect(within(menu).getByTestId(`inline-status-option-load-1-${t.target}`)).toHaveTextContent(
          STATUS_LABEL[t.target as LoadStatus] ?? t.label
        );
      }
    });
  }

  it("never offers 'invoiced' as a plain transition (it is a separate action elsewhere, not a state-machine target)", () => {
    // The old hardcoded array offered "invoiced" from every status; invoiced isn't part of
    // ALLOWED_TRANSITIONS at all (LoadStatusChanger treats it as its own onMarkInvoiced action).
    // Offering it here would route it through the bare-status-flip writer, skipping whatever the
    // dedicated mark-invoiced path performs.
    render(
      <InlineStatusPicker loadId="load-2" status="completed_docs_received" onSelect={vi.fn()} />
    );
    fireEvent.click(screen.getByTestId("inline-status-picker-load-2"));
    expect(screen.queryByTestId("inline-status-option-load-2-invoiced")).not.toBeInTheDocument();
  });

  it("calls onSelect with the picked transition's real target", () => {
    const onSelect = vi.fn();
    render(<InlineStatusPicker loadId="load-3" status="dispatched" onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("inline-status-picker-load-3"));
    fireEvent.click(screen.getByTestId("inline-status-option-load-3-in_transit"));
    expect(onSelect).toHaveBeenCalledWith("in_transit");
  });
});
