// @vitest-environment jsdom
// LV-MASTER-DETAIL-ROW-CLICK-NAVIGATES-AWAY: every row in CustomerListSidebar/VendorListSidebar
// renders via CardLink with an onNavigate callback documented as "also selects the master-detail
// row" — the intent is a plain click selects in-place (stays on the master-detail page) while
// cmd/ctrl/shift/middle-click still opens the full detail page. Before this fix, onNavigate fired
// but never prevented the underlying <Link>'s own navigation, so every plain click navigated away
// regardless, silently discarding the master-detail split view.
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
expect.extend(matchers);
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CardLink } from "./CardLink";

afterEach(cleanup);

function Harness({ onNavigate }: { onNavigate: () => void }) {
  return (
    <MemoryRouter initialEntries={["/list"]}>
      <Routes>
        <Route
          path="/list"
          element={
            <CardLink href="/detail/123" onNavigate={onNavigate}>
              Row label
            </CardLink>
          }
        />
        <Route path="/detail/:id" element={<div>Full detail page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("CardLink", () => {
  it("plain left-click selects in place (calls onNavigate) and does NOT navigate away", () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("Row label"), { button: 0 });
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Full detail page")).not.toBeInTheDocument();
    expect(screen.getByText("Row label")).toBeInTheDocument();
  });

  // Real browser semantics: cmd/ctrl/shift-click open a NEW tab/window (native anchor behavior) —
  // they never navigate the CURRENT tab's SPA route, so a jsdom/MemoryRouter harness can't observe
  // "the full detail page" for these (there is no second tab to inspect). What the fix guarantees,
  // and what these assert, is that the row-select interception backs off for a modifier-click —
  // onNavigate is not called and preventDefault is not invoked, leaving the native anchor free to
  // do its normal thing.
  it("cmd-click does not intercept as a row-select (onNavigate not called)", () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    const event = fireEvent.click(screen.getByText("Row label"), { button: 0, metaKey: true });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(event).toBe(true); // fireEvent returns false only when preventDefault was called
  });

  it("ctrl-click does not intercept as a row-select (onNavigate not called)", () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    const event = fireEvent.click(screen.getByText("Row label"), { button: 0, ctrlKey: true });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(event).toBe(true);
  });

  it("shift-click does not intercept as a row-select (onNavigate not called)", () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    const event = fireEvent.click(screen.getByText("Row label"), { button: 0, shiftKey: true });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(event).toBe(true);
  });

  it("without an onNavigate prop, a plain click still navigates normally", () => {
    render(
      <MemoryRouter initialEntries={["/list"]}>
        <Routes>
          <Route path="/list" element={<CardLink href="/detail/123">Row label</CardLink>} />
          <Route path="/detail/:id" element={<div>Full detail page</div>} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("Row label"), { button: 0 });
    expect(screen.getByText("Full detail page")).toBeInTheDocument();
  });
});
