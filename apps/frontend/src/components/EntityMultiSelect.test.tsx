import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { EntityMultiSelect, entityFilterIds } from "./EntityMultiSelect";
import { FILTER_CONTROL_HEIGHT_CLASS } from "../design/tokens";

const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("./parity/entityPickerRegistry", () => ({
  getEntityPickerConfig: () => ({ label: "Driver", serverSearch: true, list }),
  entityPickerListLimit: () => 200,
}));
function Harness({ company = "company-a", disabled = false }: { company?: string; disabled?: boolean }) {
  const [value, setValue] = useState<string | null>(null);
  return <><EntityMultiSelect kind="driver" operatingCompanyId={company} value={value} onChange={setValue} disabled={disabled}/><output data-testid="selected">{value}</output></>;
}
function mount(props: { company?: string; disabled?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><Harness {...props}/></QueryClientProvider>);
  return { ...view, update: (next: typeof props) => view.rerender(<QueryClientProvider client={client}><Harness {...next}/></QueryClientProvider>) };
}
beforeEach(() => { cleanup(); list.mockReset(); list.mockImplementation(async (_company, options) => options.search ? [{ value: "b", label: "Beta Driver" }] : [{ value: "a", label: "Alpha Driver" }, { value: "b", label: "Beta Driver" }]); });
describe("entity multi-select shared filter contract", () => {
  it("sizes selected removal controls with the shared height and removes only the chosen id", async () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "All drivers" }));
    fireEvent.click(await screen.findByRole("button", { name: "Select shown" }));
    const remove = screen.getByRole("button", { name: "Remove Alpha Driver" });
    expect(remove).toHaveClass(FILTER_CONTROL_HEIGHT_CLASS);
    fireEvent.click(remove);
    expect(screen.getByTestId("selected")).toHaveTextContent(/^b$/);
  });
  it("normalizes legacy one-id and CSV without silently discarding selected ids", () => {
    expect(entityFilterIds("a, b,a")).toEqual(["a", "b"]);
    expect(entityFilterIds(null)).toEqual([]);
  });
  it("keeps multiple selections across server searches and clears to All", async () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "All drivers" }));
    fireEvent.click(await screen.findByRole("button", { name: "Alpha Driver" }));
    fireEvent.change(screen.getByPlaceholderText("Type to narrow…"), { target: { value: "Beta" } });
    await waitFor(() => expect(list).toHaveBeenCalledWith("company-a", expect.objectContaining({ search: "Beta" })));
    fireEvent.click(await screen.findByRole("button", { name: "Beta Driver" }));
    expect(screen.getByTestId("selected")).toHaveTextContent("a,b");
    fireEvent.click(screen.getByRole("button", { name: "All drivers" }));
    expect(screen.getByTestId("selected")).toBeEmptyDOMElement();
  });
  it("Select shown preserves the complete union; company switch clears old selections", async () => {
    const view = mount(); fireEvent.click(screen.getByRole("button", { name: "All drivers" }));
    fireEvent.click(await screen.findByRole("button", { name: "Select shown" }));
    expect(screen.getByTestId("selected")).toHaveTextContent("a,b");
    view.update({ company: "company-b" });
    await waitFor(() => expect(screen.getByTestId("selected")).toBeEmptyDOMElement());
    expect(list).toHaveBeenCalledWith("company-b", expect.anything());
  });
  it("refuses over-limit selection visibly instead of sending or truncating it", async () => {
    list.mockResolvedValue(Array.from({ length: 101 }, (_, n) => ({ value: String(n), label: `Record ${n}` })));
    mount(); fireEvent.click(screen.getByRole("button", { name: "All drivers" }));
    fireEvent.click(await screen.findByRole("button", { name: "Select shown" }));
    expect(screen.getByRole("alert")).toHaveTextContent("up to 100");
    expect(screen.getByTestId("selected")).toBeEmptyDOMElement();
  });
  it("accepts exactly 100 and preserves that selection when a 101st is requested", async () => {
    list.mockImplementation(async (_company, opts) => opts.search ? [{ value: "last", label: "Record last" }] : Array.from({ length: 100 }, (_, n) => ({ value: String(n), label: `Record ${n}` })));
    mount(); fireEvent.click(screen.getByRole("button", { name: "All drivers" }));
    fireEvent.click(await screen.findByRole("button", { name: "Select shown" }));
    const before = screen.getByTestId("selected").textContent;
    expect(before?.split(",")).toHaveLength(100);
    fireEvent.change(screen.getByPlaceholderText("Type to narrow…"), { target: { value: "last" } });
    fireEvent.click(await screen.findByRole("button", { name: "Record last" }));
    expect(screen.getByRole("alert")).toHaveTextContent("up to 100");
    expect(screen.getByTestId("selected").textContent).toBe(before);
  });
  it("disabling an open filter closes its interactive panel", async () => {
    const view = mount(); fireEvent.click(screen.getByRole("button", { name: "All drivers" }));
    await screen.findByRole("group"); view.update({ disabled: true });
    await waitFor(() => expect(screen.queryByRole("group")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "All drivers" })).toBeDisabled();
  });
  it("exposes selected state and closes on Escape without clearing it", async () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "All drivers" }));
    const option = await screen.findByRole("button", { name: "Alpha Driver" });
    expect(option).toHaveAttribute("aria-pressed", "false"); fireEvent.click(option);
    expect(option).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.getByTestId("selected")).toHaveTextContent("a");
  });
  it("does not leak the previous company's roster into the new scope", async () => {
    list.mockImplementation(async (company) => company === "company-a" ? [{ value: "a", label: "Private Alpha" }] : [{ value: "z", label: "Private Zulu" }]);
    const view = mount(); fireEvent.click(screen.getByRole("button", { name: "All drivers" }));
    fireEvent.click(await screen.findByRole("button", { name: "Private Alpha" }));
    view.update({ company: "company-b" });
    await screen.findByRole("button", { name: "Private Zulu" });
    expect(screen.queryByText("Private Alpha")).not.toBeInTheDocument();
    expect(screen.getByTestId("selected")).toBeEmptyDOMElement();
  });
});
