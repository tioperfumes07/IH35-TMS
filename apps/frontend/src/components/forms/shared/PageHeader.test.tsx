import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageHeader } from "./PageHeader";

// PageHeader's back control is a <button> that calls navigate(), not an <a href> — §7 requires the
// arrow on every module header, and it falls back to navigate(-1) when no backHref is given. These tests
// were written against the older anchor-with-href markup, so they asserted `href` and expected NO back
// control on a root page. Both are stale: assert the DESTINATION instead, which is the behaviour that
// actually matters and which an href-only check never proved was wired to anything.
const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateSpy };
});

beforeEach(() => navigateSpy.mockClear());

describe("PageHeader primitive (invariant #21)", () => {
  it("renders back + breadcrumb on drilled-in page", () => {
    render(
      <MemoryRouter>
        <PageHeader
          title="Work Order WO-T169-IS-05-06-2026-0035-23914"
          backHref="/maintenance"
          breadcrumb={[
            { label: "Maintenance", href: "/maintenance" },
            { label: "WO-T169-IS-...", href: "/maintenance/wo-1" },
            { label: "Details" },
          ]}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("page-header-back"));
    expect(navigateSpy).toHaveBeenCalledWith("/maintenance");
    expect(screen.getByTestId("page-header-breadcrumb")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Work Order WO-T169-IS-05-06-2026-0035-23914",
    );
  });

  it("renders back without breadcrumb (one level deep)", () => {
    render(
      <MemoryRouter>
        <PageHeader title="Maintenance" backHref="/home" subtitle="14 new in last 3 days" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("page-header-back"));
    expect(navigateSpy).toHaveBeenCalledWith("/home");
    expect(screen.queryByTestId("page-header-breadcrumb")).toBeNull();
    expect(screen.getByText("14 new in last 3 days")).toBeInTheDocument();
  });

  it("keeps the back arrow on a root-style page and falls back to history", () => {
    render(
      <MemoryRouter>
        <PageHeader title="Home" />
      </MemoryRouter>,
    );
    // §7: the arrow stays on every module header; with no backHref it goes back in history.
    fireEvent.click(screen.getByTestId("page-header-back"));
    expect(navigateSpy).toHaveBeenCalledWith(-1);
    expect(screen.queryByTestId("page-header-breadcrumb")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Home");
  });

  it("does not show breadcrumb when only one item is passed", () => {
    render(
      <MemoryRouter>
        <PageHeader title="X" breadcrumb={[{ label: "Only", href: "/only" }]} />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("page-header-breadcrumb")).toBeNull();
  });

  // UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY: a static backHref always won even when the user
  // genuinely navigated within the app to reach this page, sending them to the same hardcoded parent
  // regardless of where they actually came from. Real in-app history (window.history.state.idx > 0)
  // must now win over backHref.
  describe("smart back (UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY)", () => {
    const originalState = window.history.state;
    afterEach(() => {
      window.history.replaceState(originalState, "");
    });

    it("prefers real history over backHref once the user has navigated in-app", () => {
      window.history.replaceState({ idx: 1, key: "abc123", usr: null }, "");
      render(
        <MemoryRouter>
          <PageHeader title="Work Order" backHref="/maintenance" />
        </MemoryRouter>,
      );
      fireEvent.click(screen.getByTestId("page-header-back"));
      expect(navigateSpy).toHaveBeenCalledWith(-1);
      expect(navigateSpy).not.toHaveBeenCalledWith("/maintenance");
    });

    it("still falls back to backHref on a direct load/refresh (idx 0)", () => {
      window.history.replaceState({ idx: 0 }, "");
      render(
        <MemoryRouter>
          <PageHeader title="Work Order" backHref="/maintenance" />
        </MemoryRouter>,
      );
      fireEvent.click(screen.getByTestId("page-header-back"));
      expect(navigateSpy).toHaveBeenCalledWith("/maintenance");
    });
  });

  it("applies single-line ellipsis styles to H1 (invariant #23)", () => {
    const long =
      "ANTONIO RAMIREZ-MARTINEZ JR. — VERY LONG DISPLAY LINE THAT MUST NOT WRAP IN PRODUCTION CHROME";
    render(
      <MemoryRouter>
        <PageHeader title={long} backHref="/drivers" />
      </MemoryRouter>,
    );
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent(long);
    const style = window.getComputedStyle(h1);
    expect(style.whiteSpace).toBe("nowrap");
    expect(style.overflow).toBe("hidden");
    expect(style.textOverflow).toBe("ellipsis");
  });
});
