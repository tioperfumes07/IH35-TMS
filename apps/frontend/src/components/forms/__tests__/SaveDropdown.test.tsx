import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SaveDropdown } from "../SaveDropdown";

beforeEach(() => {
  localStorage.clear();
});

describe("SaveDropdown", () => {
  it("primary button triggers onSave", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<SaveDropdown storageKey="sd-test-primary" onSave={onSave} />);
    const buttons = screen.getAllByRole("button");
    const primary = buttons.find((b) => b.textContent?.includes("Save"));
    expect(primary).toBeTruthy();
    await user.click(primary!);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("shows optional menu actions when handlers are provided", async () => {
    const onSave = vi.fn();
    const onSaveAndClose = vi.fn();
    const user = userEvent.setup();
    render(<SaveDropdown storageKey="sd-test-menu" onSave={onSave} onSaveAndClose={onSaveAndClose} />);

    const chevrons = screen.getAllByRole("button", { expanded: false });
    const chevron = chevrons[chevrons.length - 1];
    await user.click(chevron);

    await user.click(await screen.findByRole("menuitem", { name: /save and close/i }));
    expect(onSaveAndClose).toHaveBeenCalledTimes(1);
  });

  it("persists last primary action to localStorage", async () => {
    const onSave = vi.fn();
    const onSaveAndClose = vi.fn();
    const user = userEvent.setup();
    render(<SaveDropdown storageKey="sd-test-ls" primaryLabel="Submit" onSave={onSave} onSaveAndClose={onSaveAndClose} />);

    const chevrons = screen.getAllByRole("button", { expanded: false });
    await user.click(chevrons[chevrons.length - 1]);
    await user.click(await screen.findByRole("menuitem", { name: /save and close/i }));
    expect(onSaveAndClose).toHaveBeenCalled();

    const key = "ih35.saveDropdown.sd-test-ls";
    expect(localStorage.getItem(key)).toBe("save_and_close");
  });
});
