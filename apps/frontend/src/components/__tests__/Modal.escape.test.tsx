import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "../Modal";

describe("Modal keyboard", () => {
  it("Escape calls onClose when discard confirm is off", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open title="Test modal" onClose={onClose}>
        <p>Content</p>
      </Modal>
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape with confirmDiscardOnClose + isDirty opens discard dialog instead of closing immediately", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open title="Dirty modal" onClose={onClose} confirmDiscardOnClose isDirty>
        <p>Content</p>
      </Modal>
    );

    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /discard unsaved changes/i })).toBeTruthy();
  });

  it("Escape still closes when resizable is enabled", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open title="Resizable" onClose={onClose} resizable resizableStorageKey="modal-escape-test">
        <p>Content</p>
      </Modal>
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
