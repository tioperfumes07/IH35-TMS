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
});
