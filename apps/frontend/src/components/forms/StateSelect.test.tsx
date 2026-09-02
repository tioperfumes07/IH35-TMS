import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StateSelect } from "./StateSelect";

describe("StateSelect dismissal", () => {
  it("plain outside click closes the dropdown", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <StateSelect value="" onChange={onChange} />
        <input aria-label="Outside field" />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "State▾" }));
    expect(screen.getByPlaceholderText("Search state…")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Outside field"));
    expect(screen.queryByPlaceholderText("Search state…")).not.toBeInTheDocument();
  });

  // B9 / K2 regression guard: BookLoadModalV4's panel calls e.stopPropagation() on mousedown
  // (BOOK-LOAD-MODAL-INVISIBLE-BEHIND-DRAWER guard) so the document-level mousedown listener
  // this component also carries never fires there. This is the exact shape that trapped the
  // dropdown open live on Stop 1's Address/City fields -- a click "outside" that never reaches
  // document because an ancestor swallowed it first.
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

    await user.click(screen.getByRole("button", { name: "State▾" }));
    expect(screen.getByPlaceholderText("Search state…")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Address"));
    expect(screen.queryByPlaceholderText("Search state…")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("picking a state still commits and closes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StateSelect value="" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "State▾" }));
    await user.click(screen.getByText("Texas"));

    expect(onChange).toHaveBeenCalledWith("TX");
    expect(screen.queryByPlaceholderText("Search state…")).not.toBeInTheDocument();
  });
});
