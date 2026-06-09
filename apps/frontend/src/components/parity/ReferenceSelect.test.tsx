import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock the inline create modal so the test focuses on ReferenceSelect's wiring
// (open on +Add, return-selected on create) without API/Toast/Modal deps.
vi.mock("../forms/shared/QuickCreateEntityModal", () => ({
  QuickCreateEntityModal: ({
    open,
    kind,
    onCreated,
  }: {
    open: boolean;
    kind: string;
    onCreated: (r: { id: string; label: string }) => void;
  }) =>
    open ? (
      <div data-testid="quick-create" data-kind={kind}>
        <button type="button" onClick={() => onCreated({ id: "new-1", label: "New Vendor" })}>
          mock-create
        </button>
      </div>
    ) : null,
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

  it("always shows the '+ Add new' button and opens the inline create on click", () => {
    setup();
    const addNew = screen.getByRole("button", { name: /\+ Add new vendor/i });
    expect(addNew).toBeInTheDocument();
    expect(screen.queryByTestId("quick-create")).toBeNull();
    fireEvent.click(addNew);
    expect(screen.getByTestId("quick-create")).toHaveAttribute("data-kind", "vendor");
  });

  it("returns to the parent with the newly-created value selected, then closes", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: /\+ Add new vendor/i }));
    fireEvent.click(screen.getByText("mock-create"));
    expect(onChange).toHaveBeenCalledWith("new-1");
    expect(screen.queryByTestId("quick-create")).toBeNull();
  });
});
