import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackArrowHeader } from "../BackArrowHeader";

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

  it("falls back to backTo on a direct load/refresh (idx 0)", () => {
    window.history.replaceState({ idx: 0 }, "");
    render(
      <MemoryRouter>
        <BackArrowHeader backTo="/lists/dispatch/load-types" breadcrumb={["Lists", "Load Types"]} title="Load Types" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText("Back"));
    expect(navigateSpy).toHaveBeenCalledWith("/lists/dispatch/load-types");
  });

  describe("smart back (UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY)", () => {
    const originalState = window.history.state;
    afterEach(() => window.history.replaceState(originalState, ""));

    it("prefers real history over backTo once the user has navigated in-app", () => {
      window.history.replaceState({ idx: 1, key: "abc123", usr: null }, "");
      render(
        <MemoryRouter>
          <BackArrowHeader backTo="/lists/dispatch/load-types" breadcrumb={["Lists", "Load Types"]} title="Load Types" />
        </MemoryRouter>,
      );
      fireEvent.click(screen.getByLabelText("Back"));
      expect(navigateSpy).toHaveBeenCalledWith(-1);
      expect(navigateSpy).not.toHaveBeenCalledWith("/lists/dispatch/load-types");
    });
  });
});
