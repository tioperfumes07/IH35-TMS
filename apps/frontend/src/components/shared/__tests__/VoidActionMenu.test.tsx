import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VoidActionMenu } from "../VoidActionMenu";

describe("VoidActionMenu", () => {
  it("with zero menuActions, renders a plain button and no caret — a single real action is not a split control", () => {
    const onSelect = vi.fn();
    render(<VoidActionMenu primary={{ key: "void", label: "Void", onSelect }} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("primary button runs primary.onSelect directly", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<VoidActionMenu primary={{ key: "void", label: "Void", onSelect }} />);
    await user.click(screen.getByRole("button", { name: "Void" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("with menuActions present, renders the caret and opens a real menu of only the passed actions", async () => {
    const onVoid = vi.fn();
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <VoidActionMenu
        primary={{ key: "void", label: "Void", onSelect: onVoid }}
        menuActions={[{ key: "delete", label: "Delete", onSelect: onDelete, destructive: true }]}
      />
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2); // primary + caret, never a third phantom action
    await user.click(screen.getByRole("button", { name: /more void options/i }));
    const menuItem = await screen.findByRole("menuitem", { name: "Delete" });
    await user.click(menuItem);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onVoid).not.toHaveBeenCalled();
  });

  it("never renders an action the caller did not pass — no disabled placeholder for an unwired capability", () => {
    render(<VoidActionMenu primary={{ key: "cancel", label: "Cancel", onSelect: vi.fn() }} />);
    expect(screen.queryByText(/void/i)).toBeNull();
    expect(screen.queryByText(/delete/i)).toBeNull();
  });

  it("disabled prop disables the primary button", () => {
    render(<VoidActionMenu primary={{ key: "void", label: "Void", onSelect: vi.fn() }} disabled />);
    expect(screen.getByRole("button", { name: "Void" })).toBeDisabled();
  });
});
