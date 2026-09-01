import { render, screen } from "@testing-library/react";
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
