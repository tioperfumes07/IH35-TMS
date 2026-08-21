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
        woOtherDollars={0}
        invoicePartsInput="90"
        invoiceLaborInput="50"
        invoiceOtherInput=""
        onInvoicePartsChange={noop}
        onInvoiceLaborChange={noop}
        onInvoiceOtherChange={noop}
      />
    );
    expect(screen.getByTestId("reconcile-status-blocked")).toBeTruthy();
    expect(screen.queryByTestId("reconcile-status-ok")).toBeNull();
    // Parts variance = $100 - $90 = $10.00 shown.
    expect(screen.getByText("$10.00")).toBeTruthy();
  });

  it("RECONCILES when WO parts AND labor both tie to the invoice, and no Other row renders when there is nothing in it", () => {
    render(
      <CreateWOSectionReconcile
        woPartsDollars={100}
        woLaborDollars={50}
        woOtherDollars={0}
        invoicePartsInput="100"
        invoiceLaborInput="50"
        invoiceOtherInput=""
        onInvoicePartsChange={noop}
        onInvoiceLaborChange={noop}
        onInvoiceOtherChange={noop}
      />
    );
    expect(screen.getByTestId("reconcile-status-ok")).toBeTruthy();
    expect(screen.queryByTestId("reconcile-status-blocked")).toBeNull();
    // No Section A / stray-type money in this WO — the Other row must not appear at all.
    expect(screen.queryByTestId("invoice-other-input")).toBeNull();
  });

  it("still BLOCKS when parts tie but labor does not (all buckets must tie)", () => {
    render(
      <CreateWOSectionReconcile
        woPartsDollars={100}
        woLaborDollars={50}
        woOtherDollars={0}
        invoicePartsInput="100"
        invoiceLaborInput="40"
        invoiceOtherInput=""
        onInvoicePartsChange={noop}
        onInvoiceLaborChange={noop}
        onInvoiceOtherChange={noop}
      />
    );
    expect(screen.getByTestId("reconcile-status-blocked")).toBeTruthy();
  });

  it("LV-WO-RECONCILE-EXCLUDES-SECTION-A — a WO with real Section A / non-parts-non-labor money shows and gates the Other row instead of silently vanishing it", () => {
    render(
      <CreateWOSectionReconcile
        woPartsDollars={0}
        woLaborDollars={190}
        woOtherDollars={436.66}
        invoicePartsInput=""
        invoiceLaborInput="190"
        invoiceOtherInput=""
        onInvoicePartsChange={noop}
        onInvoiceLaborChange={noop}
        onInvoiceOtherChange={noop}
      />
    );
    // The exact live-prod repro this finding named: parts $0 + labor $190 both tie, but $436.66 of
    // real WO cost sits in Other with no matching invoice entry — Create must stay blocked, not
    // silently certify "Reconciled" the way the original bug did.
    expect(screen.getByTestId("reconcile-status-blocked")).toBeTruthy();
    expect(screen.queryByTestId("reconcile-status-ok")).toBeNull();
    expect(screen.getByTestId("invoice-other-input")).toBeTruthy();
    // $436.66 appears twice — once as the WO total, once as the (unresolved) variance, since the
    // invoice side is still empty.
    expect(screen.getAllByText("$436.66")).toHaveLength(2);
  });

  it("LV-WO-RECONCILE-LINE-TYPE-DOMAIN-LEAK — the Other bucket ties and unblocks once its own invoice figure is entered", () => {
    render(
      <CreateWOSectionReconcile
        woPartsDollars={0}
        woLaborDollars={190}
        woOtherDollars={436.66}
        invoicePartsInput=""
        invoiceLaborInput="190"
        invoiceOtherInput="436.66"
        onInvoicePartsChange={noop}
        onInvoiceLaborChange={noop}
        onInvoiceOtherChange={noop}
      />
    );
    expect(screen.getByTestId("reconcile-status-ok")).toBeTruthy();
    expect(screen.queryByTestId("reconcile-status-blocked")).toBeNull();
  });
});
