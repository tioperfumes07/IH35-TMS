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
