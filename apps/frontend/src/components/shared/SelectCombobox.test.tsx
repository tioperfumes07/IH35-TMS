import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SelectCombobox } from "../Combobox";

// FLT-01-COMBOBOX-SWEEP-ARIA-TESTID-GAP: this adapter's Props type is
// `Omit<SelectHTMLAttributes, ...>`, so TypeScript silently accepts `aria-label` / `data-testid`
// on any call site -- but the component never captured or forwarded either one to the underlying
// Combobox, so a call site converting a raw <select aria-label="…" data-testid="…"> lost its
// accessible name and its test hook with no type error and no visible diff-review signal. This
// pins the fix: both attributes must actually land in the rendered DOM.
describe("SelectCombobox aria-label/data-testid forwarding", () => {
  it("forwards aria-label to the rendered control", () => {
    render(
      <SelectCombobox aria-label="Filter by status" value="" onChange={vi.fn()}>
        <option value="">All</option>
        <option value="active">Active</option>
      </SelectCombobox>,
    );
    expect(screen.getByLabelText("Filter by status")).toBeTruthy();
  });

  it("forwards data-testid to the rendered control", () => {
    render(
      <SelectCombobox data-testid="status-filter" value="" onChange={vi.fn()}>
        <option value="">All</option>
        <option value="active">Active</option>
      </SelectCombobox>,
    );
    expect(screen.getByTestId("status-filter")).toBeTruthy();
  });
});
