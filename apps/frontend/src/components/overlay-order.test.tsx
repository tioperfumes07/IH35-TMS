// @vitest-environment jsdom
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";
import { ParityDrawer } from "./parity/ParityDrawer";

function z(title: string) {
  const dialog = screen.getByRole("dialog", { name: title });
  const overlay = dialog.parentElement!;
  return Number(overlay.style.zIndex || overlay.className.match(/z-\[(\d+)\]/)?.[1] || 0);
}
function wrap(children: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

describe("shared overlay open order", () => {
  it.each(["data-combobox-listbox", "data-date-picker-popover"])("leaves Escape to an open picker (%s)", (attribute) => {
    const close = vi.fn();
    render(wrap(<Modal open title="Parent" onClose={close}>
      <ParityDrawer open title="Child" onClose={close}>
        <div {...{ [attribute]: attribute === "data-combobox-listbox" ? "portal" : "open" }}>Picker</div>
      </ParityDrawer>
    </Modal>));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
  });

  it("reopened sibling takes the top layer without changing an already open sibling", () => {
    function Siblings() {
      const [first, setFirst] = useState(true);
      return <>
        <button onClick={() => setFirst(true)}>Reopen</button>
        <Modal open={first} title="First" onClose={() => setFirst(false)}>First body</Modal>
        <ParityDrawer open title="Second" onClose={() => {}}>Second body</ParityDrawer>
        <button onClick={() => setFirst(false)}>Hide first</button>
      </>;
    }
    render(wrap(<Siblings />));
    expect(z("Second")).toBeGreaterThan(z("First"));
    fireEvent.click(screen.getByText("Hide first"));
    fireEvent.click(screen.getByText("Reopen"));
    expect(z("First")).toBeGreaterThan(z("Second"));
  });

  it.each([false, true])("opens a drawer above a modal without caller flags (initial=%s), Escape closes only child", (initial) => {
    const parentClose = vi.fn();
    function Pair() {
      const [child, setChild] = useState(initial);
      return <Modal open title="Parent" onClose={parentClose}>
        <button onClick={() => setChild(true)}>Open child</button>
        <ParityDrawer open={child} title="Child" onClose={() => setChild(false)}>Child body</ParityDrawer>
      </Modal>;
    }
    render(wrap(<Pair />));
    if (!initial) fireEvent.click(screen.getByText("Open child"));
    expect(z("Child")).toBeGreaterThan(z("Parent"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Child" })).not.toBeInTheDocument();
    expect(parentClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(parentClose).toHaveBeenCalledTimes(1);
  });

  it("places a modal above a drawer and isolates its close", () => {
    const parentClose = vi.fn();
    const childClose = vi.fn();
    render(wrap(<ParityDrawer open title="Parent" onClose={parentClose}>
      <Modal open title="Child" onClose={childClose}>Body</Modal>
    </ParityDrawer>));
    expect(z("Child")).toBeGreaterThan(z("Parent"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(childClose).toHaveBeenCalledTimes(1);
    expect(parentClose).not.toHaveBeenCalled();
  });

  it("keeps discard confirmation above the nested surface and blocks parent Escape", () => {
    const parentClose = vi.fn();
    const childClose = vi.fn();
    render(wrap(<Modal open title="Parent" onClose={parentClose}>
      <ParityDrawer open title="Child" onClose={childClose} confirmDiscardOnClose isDirty>Dirty</ParityDrawer>
    </Modal>));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(z("Discard unsaved changes?")).toBeGreaterThan(z("Child"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(parentClose).not.toHaveBeenCalled();
    expect(childClose).not.toHaveBeenCalled();
  });
});
