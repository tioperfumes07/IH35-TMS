import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Vendor/customer/account/service use InlineCreateDrawer (CHROME-11). Mock it so the test
// focuses on ReferenceSelect wiring without drawer/API deps.
vi.mock("./InlineCreateDrawer", () => ({
  InlineCreateDrawer: ({
    open,
    kind,
    onCreated,
  }: {
    open: boolean;
    kind: string;
    onCreated: (r: { id: string; label: string }) => void;
  }) =>
    open ? (
      <div data-testid="inline-create" data-kind={kind}>
        <button type="button" onClick={() => onCreated({ id: "new-1", label: "New Vendor" })}>
          mock-create
        </button>
      </div>
    ) : null,
}));

vi.mock("../forms/shared/QuickCreateEntityModal", () => ({
  QuickCreateEntityModal: () => null,
}));

import { ReferenceSelect } from "./ReferenceSelect";

describe("ReferenceSelect (A2)", () => {
  function setup() {
    const onChange = vi.fn();
    render(
      <ReferenceSelect
        value={null}
        onChange={onChange}
        options={[{ value: "v1", label: "Acme", type: "Vendor" }]}
        createKind="vendor"
        operatingCompanyId="co-1"
        placeholder="Select vendor"
      />,
    );
    return { onChange };
  }

  function openDropdown() {
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("combobox"));
  }

  it("shows the '+ Add new' option when the combobox is open and opens inline create", () => {
    setup();
    openDropdown();
    const addNew = screen.getByRole("option", { name: /\+ Add new vendor/i });
    expect(addNew).toBeInTheDocument();
    expect(screen.queryByTestId("inline-create")).toBeNull();
    fireEvent.click(addNew);
    expect(screen.getByTestId("inline-create")).toHaveAttribute("data-kind", "vendor");
  });

  it("returns to the parent with the newly-created value selected, then closes", () => {
    const { onChange } = setup();
    openDropdown();
    fireEvent.click(screen.getByRole("option", { name: /\+ Add new vendor/i }));
    fireEvent.click(screen.getByText("mock-create"));
    expect(onChange).toHaveBeenCalledWith("new-1");
    expect(screen.queryByTestId("inline-create")).toBeNull();
  });
});
