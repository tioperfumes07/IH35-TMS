import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DatePicker } from "./DatePicker";

// MOD-02/03 — typed MM/DD/YYYY + Escape closes picker only + month/year jump
// (GO-MECH-0901). Same operator pain as DateTimePicker Defect 6; insurance policy
// expiry uses DatePicker, not DateTimePicker.

describe("DatePicker", () => {
  it("shows the US-formatted value on a text input, never a button-only value", () => {
    render(<DatePicker value="2026-07-25" onChange={vi.fn()} aria-label="Policy expiry" />);
    const dateInput = screen.getByLabelText("Policy expiry");
    expect(dateInput.tagName).toBe("INPUT");
    expect(dateInput).toHaveValue("07/25/2026");
    expect(dateInput).not.toHaveValue("2026-07-25");
  });

  it("commits a typed MM/DD/YYYY date on blur", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DatePicker value="2026-07-25" onChange={onChange} aria-label="Policy expiry" />);

    const dateInput = screen.getByLabelText("Policy expiry");
    await user.clear(dateInput);
    await user.type(dateInput, "08/01/2027");
    await user.tab();

    expect(onChange).toHaveBeenCalledWith("2027-08-01");
  });

  it("opens a dialog and closes on Escape without bubbling to parent handlers", async () => {
    const parentEscape = vi.fn();
    const user = userEvent.setup();
    render(
      <div onKeyDown={(e) => e.key === "Escape" && parentEscape()}>
        <DatePicker value="2026-07-25" onChange={vi.fn()} aria-label="Policy expiry" />
      </div>,
    );

    await user.click(screen.getByLabelText("Policy expiry calendar"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(parentEscape).not.toHaveBeenCalled();
  });

  // U21 (owner, 2026-10-03): "the calendars cannot change the YEAR". selectOptions above sets the value directly, so it
  // passed while a real mouse could never OPEN the Year / Month select: the popover called preventDefault on every
  // mousedown, which stops a native <select> from opening. fireEvent returns false when the default was prevented.
  it("lets a mouse press OPEN the Year and Month selects (mousedown is not default-prevented on them)", async () => {
    const user = userEvent.setup();
    render(<DatePicker value="2026-07-25" onChange={vi.fn()} aria-label="Policy expiry" />);
    await user.click(screen.getByLabelText("Policy expiry calendar"));
    expect(fireEvent.mouseDown(screen.getByLabelText("Year"))).toBe(true);
    expect(fireEvent.mouseDown(screen.getByLabelText("Month"))).toBe(true);
    // a day button still keeps focus in the field (its mousedown default stays prevented)
    expect(fireEvent.mouseDown(screen.getByRole("button", { name: "2026-07-15" }))).toBe(false);
  });

  it("jumps month and year via selects instead of only arrow buttons", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DatePicker value="2026-07-25" onChange={onChange} aria-label="Policy expiry" />);

    await user.click(screen.getByLabelText("Policy expiry calendar"));
    await user.selectOptions(screen.getByLabelText("Month"), "January");
    await user.selectOptions(screen.getByLabelText("Year"), "2027");
    await user.click(screen.getByRole("button", { name: "2027-01-15" }));

    expect(onChange).toHaveBeenCalledWith("2027-01-15");
  });
});
