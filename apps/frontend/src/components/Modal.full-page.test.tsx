// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

const wrap = (child: React.ReactNode) => <QueryClientProvider client={new QueryClient()}>{child}</QueryClientProvider>;
describe("shared Modal lg and opt-in full page", () => {
  it("uses 960px lg, expands and restores without remounting draft contents", () => {
    render(wrap(<Modal open title="Match" onClose={vi.fn()} size="lg" allowFullPage><input aria-label="Draft" defaultValue="Keep me" /></Modal>));
    const dialog = screen.getByRole("dialog", { name: "Match" });
    expect(dialog.style.maxWidth).toContain("960px");
    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "Unsaved" } });
    fireEvent.click(screen.getByRole("button", { name: "Expand to full page" }));
    expect(dialog.style.width).toBe("100vw");
    expect(dialog.style.height).toBe("100dvh");
    expect(screen.getByLabelText("Draft")).toHaveValue("Unsaved");
    fireEvent.click(screen.getByRole("button", { name: "Restore popup size" }));
    expect(dialog.style.maxWidth).toContain("960px");
    expect(screen.getByLabelText("Draft")).toHaveValue("Unsaved");
  });
  it("does not add a toggle to default decision dialogs", () => {
    render(wrap(<Modal open title="Decision" onClose={vi.fn()} size="sm">Body</Modal>));
    expect(screen.queryByRole("button", { name: "Expand to full page" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog").style.maxWidth).toContain("480px");
  });
  it("reopens in popup mode after closing an expanded dialog", () => {
    const props = { title: "Match", onClose: vi.fn(), size: "lg" as const, allowFullPage: true, children: "Body" };
    const { rerender } = render(wrap(<Modal {...props} open />));
    fireEvent.click(screen.getByRole("button", { name: "Expand to full page" }));
    rerender(wrap(<Modal {...props} open={false} />));
    rerender(wrap(<Modal {...props} open />));
    expect(screen.getByRole("dialog").style.maxWidth).toContain("960px");
  });
});
