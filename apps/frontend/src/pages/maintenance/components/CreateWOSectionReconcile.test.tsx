// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateWOSectionReconcile } from "./CreateWOSectionReconcile";

const noop = vi.fn();

describe("CreateWOSectionReconcile (Block 8 gap 1 — two-sided reconcile)", () => {
  it("BLOCKS (shows variance) when WO totals do not tie to the invoice", () => {
    render(
      <CreateWOSectionReconcile
        woPartsDollars={100}
        woLaborDollars={50}
        invoicePartsInput="90"
        invoiceLaborInput="50"
        onInvoicePartsChange={noop}
        onInvoiceLaborChange={noop}
      />
    );
    expect(screen.getByTestId("reconcile-status-blocked")).toBeTruthy();
    expect(screen.queryByTestId("reconcile-status-ok")).toBeNull();
    // Parts variance = $100 - $90 = $10.00 shown.
    expect(screen.getByText("$10.00")).toBeTruthy();
  });

  it("RECONCILES when WO parts AND labor both tie to the invoice", () => {
    render(
      <CreateWOSectionReconcile
        woPartsDollars={100}
        woLaborDollars={50}
        invoicePartsInput="100"
        invoiceLaborInput="50"
        onInvoicePartsChange={noop}
        onInvoiceLaborChange={noop}
      />
    );
    expect(screen.getByTestId("reconcile-status-ok")).toBeTruthy();
    expect(screen.queryByTestId("reconcile-status-blocked")).toBeNull();
  });

  it("still BLOCKS when parts tie but labor does not (both must tie)", () => {
    render(
      <CreateWOSectionReconcile
        woPartsDollars={100}
        woLaborDollars={50}
        invoicePartsInput="100"
        invoiceLaborInput="40"
        onInvoicePartsChange={noop}
        onInvoiceLaborChange={noop}
      />
    );
    expect(screen.getByTestId("reconcile-status-blocked")).toBeTruthy();
  });
});
