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
  // Day cells use onMouseDown (not onClick) to prevent blur from closing the picker first.
  fireEvent.mouseDown(dayCell);
}

/**
 * Pick an EXACT calendar date, navigating months to reach it.
 *
 * `pickDate` above clicks day-15 of whatever month happens to open, which is fine when a test only needs
 * "some valid date". It is NOT fine when the test asserts the submitted payload — e.g. PolicyDetail asserts
 * `effective_date: "2026-02-15"`, and picking August's 15th would force the assertion to be weakened to
 * whatever the picker felt like. Weakening it would delete the only check that the edited dates actually
 * reach the API, which is the whole point of that test.
 *
 * The DatePicker exposes month navigation with `aria-label="Previous month" | "Next month"` and a
 * `"Month YYYY"` heading, so the exact date is reachable: open, walk to the target month, click the day.
 *
 * @param field wrapper element for the DatePicker (its label, or the container carrying its data-testid)
 * @param iso   target date as `YYYY-MM-DD`
 */
export function pickExactDate(field: HTMLElement, iso: string): void {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`pickExactDate: expected YYYY-MM-DD, got "${iso}"`);
  const wantLabel = new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });

  const trigger = within(field).getAllByRole("button")[0];
  if (!trigger) throw new Error("pickExactDate: no DatePicker trigger button found in the given field");
  fireEvent.click(trigger);

  // DatePicker portals its calendar to document.body — within(field) won't find it.
  // Check inline first; fall back to document.body for the portaled case.
  const container: HTMLElement =
    within(field).queryAllByText(/^[A-Z][a-z]+ \d{4}$/).length > 0 ? field : document.body;

  // Walk at most 240 months (20 years) in either direction, then give up loudly rather than spin.
  for (let i = 0; i < 240; i += 1) {
    // queryAllByText avoids "multiple elements" throw if two pickers are briefly open at once.
    const headings = within(container).queryAllByText(/^[A-Z][a-z]+ \d{4}$/);
    const heading = headings[0] ?? null;
    if (!heading) throw new Error("pickExactDate: the calendar did not open — no 'Month YYYY' heading found.");
    const shown = heading.textContent?.trim() ?? "";
    if (shown === wantLabel) break;
    const shownDate = new Date(`${shown} 1`);
    const goBack = shownDate.getTime() > new Date(y, m - 1, 1).getTime();
    const nav = within(container).getByLabelText(goBack ? "Previous month" : "Next month");
    fireEvent.click(nav);
    if (i === 239) throw new Error(`pickExactDate: could not reach ${wantLabel} from ${shown} within 240 steps.`);
  }

  const dayCell = within(container)
    .getAllByRole("button")
    .find((b) => b.textContent?.trim() === String(d) && !(b as HTMLButtonElement).disabled);
  if (!dayCell) throw new Error(`pickExactDate: day ${d} not found in ${wantLabel} — it may be disabled by a min/max.`);
  // Day cells use onMouseDown (not onClick) to prevent blur from closing the picker first.
  fireEvent.mouseDown(dayCell);
}
