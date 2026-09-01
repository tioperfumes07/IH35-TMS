import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DateTimePicker } from "./DateTimePicker";
import { formatDateTimeLocalUS, isoToDateTimeLocalValue } from "../../lib/formatDate";

// C3 — the shared DateTimePicker that replaces `<input type="datetime-local">`.
// The contract that matters for every migrated call site: value in / value out is the SAME
// zoneless local wall-clock string "YYYY-MM-DDTHH:mm" the native control used, so no stored value
// changes shape; and the operator never sees an ISO string.

describe("formatDateTimeLocalUS", () => {
  it("renders US format, never ISO", () => {
    expect(formatDateTimeLocalUS("2026-07-25T14:30")).toBe("07/25/2026, 2:30 PM");
  });

  it("renders midnight as 12 AM and noon as 12 PM (not 0 / not 24)", () => {
    expect(formatDateTimeLocalUS("2026-07-25T00:00")).toBe("07/25/2026, 12:00 AM");
    expect(formatDateTimeLocalUS("2026-07-25T12:00")).toBe("07/25/2026, 12:00 PM");
  });

  it("returns empty string for empty/unparseable input instead of 'Invalid Date'", () => {
    expect(formatDateTimeLocalUS("")).toBe("");
    expect(formatDateTimeLocalUS(null)).toBe("");
    expect(formatDateTimeLocalUS("not-a-date")).toBe("");
  });

  it("does NOT shift the day when the browser is west of UTC (the TZ bug this avoids)", () => {
    // A zoneless wall-clock string must display exactly as stored. If the implementation ever
    // routed through `new Date(value)` and re-projected it, an early-morning value would slip to
    // the previous day for a viewer behind UTC. Parsing the parts makes this invariant.
    expect(formatDateTimeLocalUS("2026-07-25T00:30")).toBe("07/25/2026, 12:30 AM");
    expect(formatDateTimeLocalUS("2026-01-01T00:00")).toBe("01/01/2026, 12:00 AM");
  });
});

describe("isoToDateTimeLocalValue", () => {
  it("round-trips with new Date(local).toISOString()", () => {
    const iso = new Date(2026, 6, 25, 14, 30).toISOString();
    const local = isoToDateTimeLocalValue(iso);
    expect(local).toBe("2026-07-25T14:30");
    expect(new Date(local).toISOString()).toBe(iso);
  });

  it("returns empty string for an empty filter so Reset stays cleared", () => {
    expect(isoToDateTimeLocalValue("")).toBe("");
    expect(isoToDateTimeLocalValue(null)).toBe("");
  });
});

describe("DateTimePicker", () => {
  it("shows the US-formatted value on the date input, never the raw ISO string", () => {
    render(<DateTimePicker value="2026-07-25T14:30" onChange={vi.fn()} aria-label="Occurred at" />);
    const dateInput = screen.getByLabelText("Occurred at");
    expect(dateInput).toHaveValue("07/25/2026");
    expect(dateInput).not.toHaveValue("2026-07-25");
  });

  it("shows the MM/DD/YYYY placeholder when empty", () => {
    render(<DateTimePicker value="" onChange={vi.fn()} aria-label="Occurred at" />);
    expect(screen.getByLabelText("Occurred at")).toHaveAttribute("placeholder", "MM/DD/YYYY");
  });

  it("commits a typed MM/DD/YYYY date on blur", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DateTimePicker value="2026-07-25T14:30" onChange={onChange} aria-label="Occurred at" />);

    const dateInput = screen.getByLabelText("Occurred at");
    await user.clear(dateInput);
    await user.type(dateInput, "08/01/2026");
    await user.tab();

    expect(onChange).toHaveBeenCalledWith("2026-08-01T14:30");
  });

  it("emits a zoneless YYYY-MM-DDTHH:mm string — the native datetime-local contract", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DateTimePicker value="2026-07-25T14:30" onChange={onChange} aria-label="Occurred at" />);

    await user.click(screen.getByLabelText("Occurred at calendar"));
    await user.click(screen.getByRole("button", { name: "2026-07-10" }));

    expect(onChange).toHaveBeenCalledWith("2026-07-10T14:30");
  });

  it("preserves the time when only the day changes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DateTimePicker value="2026-07-25T23:45" onChange={onChange} aria-label="Occurred at" />);

    await user.click(screen.getByLabelText("Occurred at calendar"));
    await user.click(screen.getByRole("button", { name: "2026-07-01" }));

    expect(onChange).toHaveBeenCalledWith("2026-07-01T23:45");
  });

  it("opens a dialog and closes on Escape without bubbling to parent handlers", async () => {
    const parentEscape = vi.fn();
    const user = userEvent.setup();
    render(
      <div onKeyDown={(e) => e.key === "Escape" && parentEscape()}>
        <DateTimePicker value="2026-07-25T14:30" onChange={vi.fn()} aria-label="Occurred at" />
      </div>,
    );

    await user.click(screen.getByLabelText("Occurred at calendar"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(parentEscape).not.toHaveBeenCalled();
  });

  it("jumps month and year via selects instead of only arrow buttons", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DateTimePicker value="2026-07-25T14:30" onChange={onChange} aria-label="Occurred at" />);

    await user.click(screen.getByLabelText("Occurred at calendar"));
    await user.selectOptions(screen.getByLabelText("Month"), "January");
    await user.selectOptions(screen.getByLabelText("Year"), "2027");
    await user.click(screen.getByRole("button", { name: "2027-01-15" }));

    expect(onChange).toHaveBeenCalledWith("2027-01-15T14:30");
  });

  it("disables days that are entirely outside min/max, and keeps the boundary day selectable", async () => {
    const user = userEvent.setup();
    render(
      <DateTimePicker value="2026-07-25T14:30" onChange={vi.fn()} aria-label="Occurred at" min="2026-07-10T08:00" />
    );
    await user.click(screen.getByLabelText("Occurred at calendar"));

    expect(screen.getByRole("button", { name: "2026-07-09" })).toBeDisabled();
    // The boundary day still has in-range minutes (08:00-23:59), so the time field decides.
    expect(screen.getByRole("button", { name: "2026-07-10" })).not.toBeDisabled();
  });

  it("clears to an empty string rather than emitting an invalid value", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DateTimePicker value="2026-07-25T14:30" onChange={onChange} aria-label="Occurred at" />);

    await user.click(screen.getByLabelText("Occurred at calendar"));
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(onChange).toHaveBeenCalledWith("");
  });
});
