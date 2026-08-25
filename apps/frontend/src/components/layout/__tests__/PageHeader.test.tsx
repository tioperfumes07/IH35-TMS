import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageHeader } from "../PageHeader";

// components/layout/PageHeader is the SECOND PageHeader in the codebase (see the component's own
// comment) -- genuinely different file from components/forms/shared/PageHeader, so its smart-back
// fix (UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY) needs its own coverage.
const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateSpy };
});

beforeEach(() => navigateSpy.mockClear());

describe("layout PageHeader", () => {
  it("always renders a back button, even on a root-style page with no backHref", () => {
    render(
      <MemoryRouter>
        <PageHeader title="Home" />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Back")).toBeInTheDocument();
  });

  it("uses navigate(-1) when onBack is not provided and no in-app history exists", () => {
    window.history.replaceState({ idx: 0 }, "");
    render(
      <MemoryRouter>
        <PageHeader title="Home" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText("Back"));
    expect(navigateSpy).toHaveBeenCalledWith(-1);
  });

  it("calls onBack instead of navigating when provided (panel/drawer headers)", () => {
    const onBack = vi.fn();
    window.history.replaceState({ idx: 3 }, "");
    render(
      <MemoryRouter>
        <PageHeader title="Panel" backHref="/somewhere" onBack={onBack} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText("Back"));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  describe("smart back (UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY)", () => {
    const originalState = window.history.state;
    afterEach(() => {
      window.history.replaceState(originalState, "");
    });

    it("prefers real history over backHref once the user has navigated in-app", () => {
      window.history.replaceState({ idx: 2, key: "xyz789", usr: null }, "");
      render(
        <MemoryRouter>
          <PageHeader title="Invoice" backHref="/accounting/invoices" />
        </MemoryRouter>,
      );
      fireEvent.click(screen.getByLabelText("Back"));
      expect(navigateSpy).toHaveBeenCalledWith(-1);
      expect(navigateSpy).not.toHaveBeenCalledWith("/accounting/invoices");
    });

    it("still falls back to backHref on a direct load/refresh (idx 0)", () => {
      window.history.replaceState({ idx: 0 }, "");
      render(
        <MemoryRouter>
          <PageHeader title="Invoice" backHref="/accounting/invoices" />
        </MemoryRouter>,
      );
      fireEvent.click(screen.getByLabelText("Back"));
      expect(navigateSpy).toHaveBeenCalledWith("/accounting/invoices");
    });
  });
});
