import { describe, expect, it } from "vitest";
import { dispatchSubNavActiveHref, dispatchBreadcrumbLabel } from "./DispatchSubnav";

describe("DispatchSubnav planner navigation (hub reachability)", () => {
  it("maps each planners hub route to its own active href", () => {
    expect(dispatchSubNavActiveHref("/dispatch/planners/driver", "")).toBe("/dispatch/planners/driver");
    expect(dispatchSubNavActiveHref("/dispatch/planners/truck", "")).toBe("/dispatch/planners/truck");
    expect(dispatchSubNavActiveHref("/dispatch/planners/loads", "")).toBe("/dispatch/planners/loads");
  });

  it("keeps the single Planner Calendar route distinct from the hub", () => {
    expect(dispatchSubNavActiveHref("/dispatch/planner", "")).toBe("/dispatch/planner");
    expect(dispatchSubNavActiveHref("/dispatch/planner", "?panel=templates")).toBe(
      "/dispatch/planner?panel=templates",
    );
  });

  it("labels the breadcrumb for each planner destination", () => {
    expect(dispatchBreadcrumbLabel("/dispatch/planners/driver", "")).toBe("Driver Planner");
    expect(dispatchBreadcrumbLabel("/dispatch/planners/truck", "")).toBe("Truck Planner");
    expect(dispatchBreadcrumbLabel("/dispatch/planners/loads", "")).toBe("Loads Planner");
    expect(dispatchBreadcrumbLabel("/dispatch/planner", "")).toBe("Planner Calendar");
  });
});
