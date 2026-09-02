import { describe, expect, it } from "vitest";

// GO-21-J1: plain-number sibling to MoneyInput. Same seam-testing convention as
// MoneyInput.test.tsx — lock the parse/format contract directly rather than only through
// rendered DOM interaction, so a future refactor can't silently break the thousands-separator
// or integer-rounding behavior without a red test.
//
// The formatting/parsing helpers are not exported (unlike MoneyInput's parseToCents/
// formatCentsDisplay) because NumberInput has no dollars↔cents *unit conversion* seam to protect
// — it is display formatting only, so it is exercised via the component's own render below.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { NumberInput } from "./NumberInput";

function Harness({ decimals = 0, unit }: { decimals?: number; unit?: string }) {
  const [value, setValue] = useState<number | null>(null);
  return <NumberInput value={value} onChange={setValue} decimals={decimals} unit={unit} ariaLabel="Test number" />;
}

describe("NumberInput", () => {
  it("formats a whole number with thousands separators (weight_lbs use case)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText("Test number");
    await user.type(input, "42500");
    await user.tab();
    expect(input).toHaveValue("42,500");
  });

  it("rounds to the requested decimal places on blur", async () => {
    const user = userEvent.setup();
    render(<Harness decimals={2} />);
    const input = screen.getByLabelText("Test number");
    await user.type(input, "12.3456");
    await user.tab();
    expect(input).toHaveValue("12.35");
  });

  it("clears to empty on focus so typed digits never prepend onto a stale value (W-3 class bug)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText("Test number");
    await user.type(input, "1500");
    await user.tab();
    expect(input).toHaveValue("1,500");
    await user.click(input);
    expect(input).toHaveValue("1500");
  });

  it("renders the unit suffix when provided, without it being part of the value", () => {
    render(<Harness unit="lbs" />);
    expect(screen.getByText("lbs")).toBeInTheDocument();
  });

  it("no unit suffix rendered when omitted", () => {
    render(<Harness />);
    expect(screen.queryByText("lbs")).not.toBeInTheDocument();
  });
});
