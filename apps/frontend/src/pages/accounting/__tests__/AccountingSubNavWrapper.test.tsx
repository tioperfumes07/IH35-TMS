import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountingSubNavWrapper } from "../AccountingSubNavWrapper";

// UI-BACK-BUTTON-MISSING-ENTIRELY: this wrapper is the module header for every one of the ~49
// routed /accounting/* pages and had NO back control at all -- a real systemwide-audit finding,
// distinct from (and additional to) the wrong-destination defect fixed elsewhere. Fallback target
// is /home, the established module-root convention used by SystemModulePage/ComplianceDashboardPage.
const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateSpy };
});

beforeEach(() => navigateSpy.mockClear());

describe("AccountingSubNavWrapper back button", () => {
  const originalState = window.history.state;
  afterEach(() => window.history.replaceState(originalState, ""));

  it("renders a back button", () => {
    render(
      <MemoryRouter>
        <AccountingSubNavWrapper title="Invoices">
          <div>content</div>
        </AccountingSubNavWrapper>
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Back")).toBeInTheDocument();
  });

  it("falls back to /home on a direct load/refresh (idx 0)", () => {
    window.history.replaceState({ idx: 0 }, "");
    render(
      <MemoryRouter>
        <AccountingSubNavWrapper title="Invoices">
          <div>content</div>
        </AccountingSubNavWrapper>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText("Back"));
    expect(navigateSpy).toHaveBeenCalledWith("/home");
  });

  it("prefers real history once the user has navigated in-app", () => {
    window.history.replaceState({ idx: 1, key: "def456", usr: null }, "");
    render(
      <MemoryRouter>
        <AccountingSubNavWrapper title="Invoices">
          <div>content</div>
        </AccountingSubNavWrapper>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText("Back"));
    expect(navigateSpy).toHaveBeenCalledWith(-1);
    expect(navigateSpy).not.toHaveBeenCalledWith("/home");
  });
});
