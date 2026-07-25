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
import { ToastProvider } from "../Toast";

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

// LST-PICKER-01/03 — the config-driven path. These assert the DEFECT is gone: a catalog outside the
// original hardcoded six now gets inline create with no new component and no edit to ReferenceSelect.
describe("ReferenceSelect — config-driven catalogs (LST-PICKER-01)", () => {
  function renderCatalogPicker(props: Partial<React.ComponentProps<typeof ReferenceSelect>> = {}) {
    const onChange = vi.fn();
    render(
      <ToastProvider>
        <ReferenceSelect
          value={null}
          onChange={onChange}
          options={[{ value: "FSC", label: "Fuel Surcharge" }]}
          createKind="additional_charge"
          operatingCompanyId="00000000-0000-4000-8000-000000000001"
          {...props}
        />
      </ToastProvider>,
    );
    return { onChange };
  }

  function openDropdown() {
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("combobox"));
  }

  it('offers "+ Create" as the FIRST ROW INSIDE the dropdown for a catalog kind the union never had', () => {
    renderCatalogPicker();
    openDropdown();
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("+ Create Accessorial charge");
    // §7 vocabulary: never "+ New" / "+ Add" on a config-driven catalog.
    expect(options[0].textContent).not.toMatch(/\+ (New|Add)\b/);
  });

  it("opens the ONE generic catalog drawer — not a per-catalog component", () => {
    renderCatalogPicker();
    openDropdown();
    expect(screen.queryByTestId("catalog-quick-create-drawer")).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /\+ Create Accessorial charge/i }));
    expect(screen.getByTestId("catalog-quick-create-drawer")).toBeInTheDocument();
  });

  it("shows the operator which canonical table the create writes (clause 5, visible)", () => {
    renderCatalogPicker();
    openDropdown();
    fireEvent.click(screen.getByRole("option", { name: /\+ Create Accessorial charge/i }));
    expect(screen.getByTestId("catalog-quick-create-target")).toHaveTextContent("catalogs.additional_charges");
  });

  it("keeps the legacy six on their original label and backend", () => {
    renderCatalogPicker({ createKind: "customer", options: [] });
    openDropdown();
    expect(screen.getByRole("option", { name: /\+ Add new customer/i })).toBeInTheDocument();
  });
});
