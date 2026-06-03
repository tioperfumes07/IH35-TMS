import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "../Modal";
import { FaultRuleModal } from "../maintenance/FaultRuleModal";
import { BookLoadModalV4 } from "../../pages/dispatch/components/BookLoadModalV4";
import { ToastProvider } from "../Toast";

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("modal x-close audit", () => {
  it("shared Modal: clicking X calls onClose", () => {
    const onClose = vi.fn();
    render(wrap(<Modal open onClose={onClose} title="Test modal">
      body
    </Modal>));
    fireEvent.click(screen.getByRole("button", { name: "Close Test modal" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("FaultRuleModal: clicking X calls onClose", () => {
    const onClose = vi.fn();
    render(
      wrap(
        <FaultRuleModal
          initial={null}
          onClose={onClose}
          onSave={() => undefined}
        />
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Close Add fault rule" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("BookLoadModalV4: clicking X calls onClose", () => {
    const onClose = vi.fn();
    render(
      wrap(
        <ToastProvider>
          <BookLoadModalV4
            open
            operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
            onClose={onClose}
            onCreated={vi.fn()}
          />
        </ToastProvider>
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Close Book load" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
