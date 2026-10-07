import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackArrowHeader } from "../BackArrowHeader";
import { inModuleBackHref } from "../../../lib/structuralBreadcrumb";

// BackArrowHeader is the THIRD back-button component in the codebase (alongside both PageHeader
// components) -- it backs the whole catalog-list-page family (dispatch/driver/maintenance/fuel/
// fleet/accounting/reference catalogs, ~35+ direct + delegated pages). It was a plain
// <Link to={backTo}>, always sending the user to the same hardcoded parent regardless of where
// they actually navigated from -- the same UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY defect
// class fixed on the other two headers, now fixed here too.
const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateSpy };
});

beforeEach(() => navigateSpy.mockClear());

describe("BackArrowHeader", () => {
  it("always renders a back button", () => {
    render(
      <MemoryRouter>
        <BackArrowHeader backTo="/lists/dispatch/load-types" breadcrumb={["Lists", "Load Types"]} title="Load Types" />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Back")).toBeInTheDocument();
  });

  // ROUND 435-CUR (#25581) superseded the history-based back: Up never navigates(-1) and never leaves its module.
  // These two cases replace the old "falls back to backTo at idx 0" / "prefers real history" assertions.
  it("goes to backTo when it is in the same module, even when real history exists", () => {
    window.history.replaceState({ idx: 3, key: "abc123", usr: null }, "");
    render(
      <MemoryRouter initialEntries={["/lists/dispatch/load-types/abc"]}>
        <BackArrowHeader backTo="/lists/dispatch/load-types" breadcrumb={["Lists", "Load Types"]} title="Load Types" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText("Back"));
    expect(navigateSpy).toHaveBeenCalledWith(inModuleBackHref("/lists/dispatch/load-types/abc", "/lists/dispatch/load-types"));
    expect(navigateSpy).not.toHaveBeenCalledWith(-1);
  });

  it("never follows a backTo into another module — it goes to this page's structural parent", () => {
    render(
      <MemoryRouter initialEntries={["/lists/dispatch/load-types/abc"]}>
        <BackArrowHeader backTo="/accounting/bills" breadcrumb={["Lists", "Load Types"]} title="Load Types" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText("Back"));
    const target = navigateSpy.mock.calls[0]?.[0];
    expect(target).toBe(inModuleBackHref("/lists/dispatch/load-types/abc", "/accounting/bills"));
    expect(target).not.toBe("/accounting/bills");
    expect(target).not.toBe(-1);
  });
});
