import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MultiSelectDropdown } from "../MultiSelectDropdown";

// ROUND 12 — report-family designs draw each filter as a <button> straight inside the white filter bar (no wrapper).
describe("MultiSelectDropdown board + flat", () => {
  it("renders the trigger as a direct child of the bar; the menu opens beside it and still selects", () => {
    const onChange = vi.fn();
    const { container } = render(
      <div data-testid="bar">
        <MultiSelectDropdown label="Status" allLabel="Status ▾" options={[{ value: "a", label: "Alpha" }]} selected={[]} onChange={onChange} board flat data-testid="f" />
      </div>,
    );
    const trigger = screen.getByTestId("f");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.parentElement).toBe(container.querySelector('[data-testid="bar"]'));
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    expect(onChange).toHaveBeenCalledWith(["a"]);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("button", { name: /Alpha/ })).toBeNull();
  });
});
