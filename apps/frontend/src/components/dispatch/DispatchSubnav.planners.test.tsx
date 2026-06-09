import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  DispatchSubnav,
  dispatchSubNavActiveHref,
  dispatchBreadcrumbLabel,
} from "./DispatchSubnav";

describe("DispatchSubnav planner reachability + click-nav (Task 1)", () => {
  it("maps each planners hub route to its own active href (distinct from the calendar)", () => {
    expect(dispatchSubNavActiveHref("/dispatch/planners/driver", "")).toBe("/dispatch/planners/driver");
    expect(dispatchSubNavActiveHref("/dispatch/planners/truck", "")).toBe("/dispatch/planners/truck");
    expect(dispatchSubNavActiveHref("/dispatch/planners/loads", "")).toBe("/dispatch/planners/loads");
    expect(dispatchSubNavActiveHref("/dispatch/planner", "")).toBe("/dispatch/planner");
  });

  it("labels the breadcrumb for each planner destination", () => {
    expect(dispatchBreadcrumbLabel("/dispatch/planners/driver", "")).toBe("Driver Planner");
    expect(dispatchBreadcrumbLabel("/dispatch/planners/truck", "")).toBe("Truck Planner");
    expect(dispatchBreadcrumbLabel("/dispatch/planners/loads", "")).toBe("Loads Planner");
    expect(dispatchBreadcrumbLabel("/dispatch/planner", "")).toBe("Planner Calendar");
  });

  function renderNav() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/dispatch"]}>
          <DispatchSubnav operatingCompanyId="" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("Planning menu is closed until clicked, then stays open (click-to-toggle, not hover)", () => {
    renderNav();
    const planningBtn = screen.getByRole("menuitem", { name: /Planning/i });
    // hidden initially
    expect(screen.queryByRole("menuitem", { name: "Driver Planner" })).not.toBeInTheDocument();
    // click opens — and the previously-hidden planners are now reachable
    fireEvent.click(planningBtn);
    expect(screen.getByRole("menuitem", { name: "Driver Planner" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Truck Planner" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Loads Planner" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Planner Calendar" })).toBeInTheDocument();
    // mouse-out does NOT close it (persistent) — clicking the trigger again toggles closed
    fireEvent.click(planningBtn);
    expect(screen.queryByRole("menuitem", { name: "Driver Planner" })).not.toBeInTheDocument();
  });
});
