import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StateSelect } from "./StateSelect";

describe("StateSelect — Combobox filter chrome (SETL-F441)", () => {
  it("uses a combobox (no ▾ caret button) at form-field height", async () => {
    const onChange = vi.fn();
    render(<StateSelect value="" onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "State" });
    expect(input).toBeInTheDocument();
    expect(input.className).toMatch(/h-7/);
    expect(screen.queryByText("▾")).not.toBeInTheDocument();
  });

  it("plain outside click closes the dropdown", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <StateSelect value="" onChange={onChange} />
        <input aria-label="Outside field" />
      </div>,
    );

    await user.click(screen.getByRole("combobox", { name: "State" }));
    expect(await screen.findByRole("listbox")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Outside field"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("outside click still closes when an ancestor stops mousedown propagation (BookLoadModalV4 panel shape)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div onMouseDown={(e) => e.stopPropagation()}>
        <StateSelect value="" onChange={onChange} />
        <input aria-label="Address" />
      </div>,
    );

    await user.click(screen.getByRole("combobox", { name: "State" }));
    expect(await screen.findByRole("listbox")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Address"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("picking a state still commits and closes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StateSelect value="" onChange={onChange} />);

    await user.click(screen.getByRole("combobox", { name: "State" }));
    await user.click(await screen.findByRole("option", { name: /TX — Texas/i }));

    expect(onChange).toHaveBeenCalledWith("TX");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
