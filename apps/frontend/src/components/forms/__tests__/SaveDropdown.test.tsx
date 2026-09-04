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

  it("renders 'Save and send' disabled with a reason when saveAndSendDisabledReason is set (WIZ-49d)", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <SaveDropdown
        storageKey="sd-test-send-disabled"
        onSave={onSave}
        onSaveAndClose={vi.fn()}
        saveAndSendDisabledReason="Pending owner ruling: rate con vs dispatch sheet."
      />
    );

    const chevrons = screen.getAllByRole("button", { expanded: false });
    await user.click(chevrons[chevrons.length - 1]);

    const sendItem = await screen.findByRole("menuitem", { name: /save and send/i });
    expect((sendItem as HTMLButtonElement).disabled).toBe(true);
    expect(sendItem.getAttribute("title")).toMatch(/pending owner ruling/i);

    // A disabled placeholder must never become the primary action (never a silent no-op).
    await user.click(sendItem);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("renders caret menu items with per-usage menuLabels (Book Load owner words)", async () => {
    const onSave = vi.fn();
    const onSaveAndClose = vi.fn();
    const user = userEvent.setup();
    render(
      <SaveDropdown
        storageKey="sd-test-menu-labels"
        primaryLabel="Book + dispatch"
        onSave={onSave}
        onSaveAndClose={onSaveAndClose}
        onSaveAndPrint={vi.fn()}
        saveAndSendDisabledReason="Pending owner ruling (WIZ-49d)."
        menuLabels={{
          save: "Book and dispatch",
          save_and_close: "Book and save",
          save_and_print: "Book and print",
          save_and_send: "Book and send",
        }}
      />
    );

    // Primary button keeps primaryLabel ("Book + dispatch"), menu uses the owner's words.
    expect(screen.getByRole("button", { name: /book \+ dispatch/i })).toBeTruthy();

    const chevrons = screen.getAllByRole("button", { expanded: false });
    await user.click(chevrons[chevrons.length - 1]);

    expect(await screen.findByRole("menuitem", { name: /^book and dispatch$/i })).toBeTruthy();
    expect(await screen.findByRole("menuitem", { name: /^book and print$/i })).toBeTruthy();
    const sendItem = await screen.findByRole("menuitem", { name: /^book and send/i });
    expect((sendItem as HTMLButtonElement).disabled).toBe(true);

    await user.click(await screen.findByRole("menuitem", { name: /^book and save$/i }));
    expect(onSaveAndClose).toHaveBeenCalledTimes(1);
  });
});
