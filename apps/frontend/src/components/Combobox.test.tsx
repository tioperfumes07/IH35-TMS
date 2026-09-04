import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Combobox } from "./Combobox";

const options = [
  { value: "alpha", label: "Alpha" },
  { value: "bravo", label: "Bravo" },
];

describe("Combobox dismissal", () => {
  it("Escape closes without committing the highlighted option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Combobox options={options} value="alpha" onChange={onChange} />);

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{ArrowDown}{Escape}");

    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveValue("Alpha");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("outside click closes without committing the highlighted option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <Combobox options={options} value="alpha" onChange={onChange} />
        <button type="button">Outside</button>
      </div>,
    );

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{ArrowDown}");
    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveValue("Alpha");
    expect(onChange).not.toHaveBeenCalled();
  });

  // BUS-HARD-WAKE-COMBOBOX-TAB-F5: handleKeyDown had no Tab case -- the listbox portals into
  // document.body (not a DOM sibling of the input), so a still-open listbox's option buttons
  // could visually trap or confuse Tab navigation. Tab must close the listbox without committing
  // and without blocking the browser's own default focus-move (no preventDefault).
  it("Tab closes the listbox without committing the highlighted option, and does not block focus from moving on", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <Combobox options={options} value="alpha" onChange={onChange} />
        <button type="button">Next field</button>
      </div>,
    );

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-expanded", "true");

    await user.tab();

    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveValue("Alpha");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Next field" })).toHaveFocus();
  });
});

// WIZ-46 — the customer combobox on Book Load AND Edit Load blanked its selection on focus and only
// delivered the first typed character to the search. Two defects lived in the shared control. These
// guards fail on the pre-fix component and pass on the fix.
describe("WIZ-46 shared Combobox contract", () => {
  // D1 — focusing a picker that already holds a committed value must NOT clear the visible selection.
  // Pre-fix, displayValue was `open ? query : label`, so opening the listbox (which happens on focus)
  // showed an EMPTY box: the operator read "NCC Logistics" disappearing as the value being lost, the
  // field ended invalid, and Save greyed out. The FK must also be untouched — focus is not an edit.
  it("D1: focusing a committed value keeps it visible and does not clear the FK", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Combobox options={options} value="alpha" onChange={onChange} clearCommittedOnEdit />);

    const input = screen.getByRole("combobox");
    await user.click(input); // focus opens the listbox — the live repro of the blank

    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveValue("Alpha"); // pre-fix: "" — post-fix keeps the committed label
    expect(onChange).not.toHaveBeenCalled(); // focusing is not an edit; the FK must survive
  });

  // D2 (contract) — while the server search is in flight the picker surfaces it via `loading`, which
  // shows a dropdown spinner but must NEVER make the input non-interactive. The live bug was the call
  // site folding that same in-flight state into `disabled`: the browser blurred the focused input on
  // the first keystroke and characters 2..n were discarded, so only `search=N` reached the API. A
  // `loading` Combobox must accept a full multi-character query and deliver ALL of it to onSearch.
  it("D2: a loading combobox still delivers the full typed string to onSearch", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSearch = vi.fn();
    render(
      <Combobox
        options={[]}
        value={null}
        onChange={onChange}
        onSearch={onSearch}
        loading
        clearCommittedOnEdit
      />,
    );

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.type(input, "NCC");

    const terms = onSearch.mock.calls.map((c) => c[0] as string);
    expect(terms).toContain("NCC"); // the whole word, not just "N"
    expect(input).toHaveValue("NCC");
  });
});
