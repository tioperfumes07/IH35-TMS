import { fireEvent, screen, within } from "@testing-library/react";

/**
 * FE-TESTS-SELECTOPTIONS-ON-COMBOBOX — drive the shared `Combobox` the way a user does.
 *
 * Several screens migrated their reference dropdowns from a native `<select>` to
 * `components/Combobox`, which renders an `<input role="combobox">` plus a popover `role="listbox"` of
 * `role="option"` items. Tests written against the old markup kept calling `user.selectOptions(el, id)`,
 * which only works on a real `<select>`/`<option>` pair. Against the picker it throws
 * `Value "<id>" not found in options` — a message that names the ID and never mentions the widget, so the
 * failures read as "the fixture is missing that row" rather than "this control is no longer a <select>".
 * That misreading is the whole point of this helper: `LoadReassignModal` looked like a driver-data bug.
 *
 * The Combobox opens on FOCUS (`onFocus` sets `open` and resets the query) and commits on the option's
 * `onClick`, so focusing then clicking is exactly the browser path — no typing required, and no dependence
 * on the option-filtering behaviour. Note a bare `fireEvent.click` does NOT focus, so it leaves the list
 * closed; that is why this helper focuses first.
 *
 * @param combo  the `role="combobox"` input for the picker (e.g. `screen.getAllByRole("combobox")[0]`)
 * @param option accessible name of the option to choose — the label a user reads, NOT the value/UUID.
 *               A `<select>` is addressed by value; a listbox option is addressed by its visible text.
 */
export function pickCombo(combo: HTMLElement, option: string | RegExp): void {
  fireEvent.focus(combo);
  fireEvent.click(combo);
  const listboxId = combo.getAttribute("aria-controls");
  const listbox = listboxId ? document.getElementById(listboxId) : null;
  const scope = listbox ? within(listbox) : screen;
  const matches = scope.queryAllByRole("option");
  if (matches.length === 0) {
    throw new Error(
      "pickCombo: the picker did not open — no role=\"option\" items were rendered after clicking the combobox.",
    );
  }
  const wanted = scope.queryAllByRole("option", { name: option })[0];
  if (!wanted) {
    const shown = matches.map((m) => `"${m.textContent?.trim()}"`).join(", ");
    throw new Error(
      `pickCombo: no option named ${String(option)} in the open list. Options were: ${shown}. ` +
        "Note this helper matches the option's VISIBLE TEXT, not its id/value.",
    );
  }
  fireEvent.click(wanted);
}
