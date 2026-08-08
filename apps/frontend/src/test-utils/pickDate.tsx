import { within, fireEvent } from "@testing-library/react";

/**
 * FE-TESTS-TYPE-INTO-DATEPICKER — drive the shared `DatePicker` the way a user does.
 *
 * Several screens migrated their date fields from a native `<input type="date">` to
 * `components/forms/DatePicker`, which renders a BUTTON plus a calendar popover and has no typeable input.
 * Tests written against the old markup kept calling `user.type(...)` / `fireEvent.change(...)`, which silently
 * set nothing — so the form's submit stayed disabled and the flow under test never ran, while the test still
 * LOOKED like it covered it. The failures never mention a date, which is why they read as unrelated bugs:
 * `PermitsPage` reported "createSafetyPermit not called" and `ServiceTimeline` "element does not have a value
 * setter".
 *
 * This opens the picker and clicks a real day cell, so the component's own `onChange` fires exactly as it does
 * in the browser. Use this instead of typing into a DatePicker.
 *
 * @param field the element wrapping the DatePicker (its label, or the container carrying its data-testid)
 * @param day   day-of-month to select in the month the picker opens on. Defaults to 15 — mid-month, so it is
 *              never a disabled leading/trailing blank and never out of range for a min="today" picker.
 */
export function pickDate(field: HTMLElement, day = 15): void {
  const trigger = within(field).getAllByRole("button")[0];
  if (!trigger) throw new Error("pickDate: no DatePicker trigger button found in the given field");
  fireEvent.click(trigger);
  const dayCell = within(field)
    .getAllByRole("button")
    .find((b) => b.textContent?.trim() === String(day) && !(b as HTMLButtonElement).disabled);
  if (!dayCell) {
    throw new Error(
      `pickDate: day ${day} not found in the open calendar — the picker did not open, or that day is disabled.`,
    );
  }
  fireEvent.click(dayCell);
}
