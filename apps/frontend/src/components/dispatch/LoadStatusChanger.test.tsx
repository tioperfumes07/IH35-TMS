import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getOfficeTransitionButtons } from "@ih35/shared-types";
import { LoadStatusChanger } from "./LoadStatusChanger";

// REG-054 GUARD (this test IS the regression guard): the QuickBooks Change Status dropdown must
//  (1) render as a clickable trigger on a live load,
//  (2) offer ONLY the state-machine's legal office transitions from the current status (never a fixed
//      list, never an illegal move),
//  (3) offer "Cancel load…" from a non-terminal status and route it to the reason-required modal,
//  (4) NOT be interactive from a terminal status (no ▾, no menu).
describe("LoadStatusChanger — QuickBooks status dropdown (REG-054)", () => {
  it("opens and offers exactly the legal transitions for a dispatched load, plus Cancel", () => {
    const onTransition = vi.fn();
    const onCancelLoad = vi.fn();
    render(
      <LoadStatusChanger
        loadId="L1"
        status="dispatched"
        onTransition={onTransition}
        onMarkInvoiced={vi.fn()}
        onCancelLoad={onCancelLoad}
      />
    );

    fireEvent.click(screen.getByTestId("load-status-changer-L1"));

    // Every legal office transition from `dispatched` is offered, and only those.
    const legal = getOfficeTransitionButtons("dispatched").map((t) => t.target);
    expect(legal).toContain("in_transit");
    for (const target of legal) {
      expect(screen.getByTestId(`load-status-changer-option-L1-${target}`)).toBeInTheDocument();
    }

    // Cancel is available from a non-terminal status.
    fireEvent.click(screen.getByTestId("load-status-changer-option-L1-cancel"));
    expect(onCancelLoad).toHaveBeenCalledTimes(1);
  });

  it("fires onTransition with the chosen target and closes the menu", () => {
    const onTransition = vi.fn();
    render(
      <LoadStatusChanger
        loadId="L2"
        status="in_transit"
        onTransition={onTransition}
        onMarkInvoiced={vi.fn()}
        onCancelLoad={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("load-status-changer-L2"));
    fireEvent.click(screen.getByTestId("load-status-changer-option-L2-delivered_pending_docs"));
    expect(onTransition).toHaveBeenCalledWith("delivered_pending_docs");
    expect(screen.queryByTestId("load-status-changer-menu-L2")).not.toBeInTheDocument();
  });

  it("offers Mark invoiced only at completed_docs_received", () => {
    render(
      <LoadStatusChanger
        loadId="L3"
        status="completed_docs_received"
        onTransition={vi.fn()}
        onMarkInvoiced={vi.fn()}
        onCancelLoad={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("load-status-changer-L3"));
    expect(screen.getByTestId("load-status-changer-option-L3-invoiced")).toBeInTheDocument();
  });

  it("is non-interactive from a terminal status (cancelled)", () => {
    render(
      <LoadStatusChanger
        loadId="L4"
        status="cancelled"
        onTransition={vi.fn()}
        onMarkInvoiced={vi.fn()}
        onCancelLoad={vi.fn()}
      />
    );
    const trigger = screen.getByTestId("load-status-changer-L4");
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByTestId("load-status-changer-menu-L4")).not.toBeInTheDocument();
  });
});
