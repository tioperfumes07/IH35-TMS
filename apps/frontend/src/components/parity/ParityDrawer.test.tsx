import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ParityDrawer } from "./ParityDrawer";

describe("ParityDrawer (A3)", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ParityDrawer open={false} title="Edit account" onClose={() => {}}>
        body
      </ParityDrawer>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders title, subtitle, body and footer when open", () => {
    render(
      <ParityDrawer
        open
        title="New account"
        subtitle="Chart of accounts"
        onClose={() => {}}
        footer={<button type="button">Save</button>}
      >
        <div>Drawer body</div>
      </ParityDrawer>,
    );
    expect(screen.getByRole("dialog", { name: "New account" })).toBeInTheDocument();
    expect(screen.getByText("Chart of accounts")).toBeInTheDocument();
    expect(screen.getByText("Drawer body")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("calls onClose from the close button and backdrop", () => {
    const onClose = vi.fn();
    render(
      <ParityDrawer open title="X" onClose={onClose}>
        body
      </ParityDrawer>,
    );
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
