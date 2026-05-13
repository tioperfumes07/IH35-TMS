import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDiscardDialog } from "../ConfirmDiscardDialog";

describe("ConfirmDiscardDialog", () => {
  it("calls onCancel when Cancel is pressed", async () => {
    const onCancel = vi.fn();
    const onDiscard = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDiscardDialog open onCancel={onCancel} onDiscard={onDiscard} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("calls onDiscard when Discard is pressed", async () => {
    const onCancel = vi.fn();
    const onDiscard = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDiscardDialog open onCancel={onCancel} onDiscard={onDiscard} />);
    await user.click(screen.getByRole("button", { name: /^discard$/i }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
