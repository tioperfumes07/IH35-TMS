import { describe, expect, it } from "vitest";
import {
  readPlannerEntityFiltersFromSearch,
  writePlannerEntityFiltersToSearch,
} from "./planner-range";

describe("planner entity filters URL cohort (board 12)", () => {
  it("reads applied multi-select filters from the query string", () => {
    const params = new URLSearchParams(
      "planner_driver_ids=drv-a,drv-b&planner_unit_ids=u-1&planner_status=available,in-use&planner_customer_ids=c-1",
    );
    expect(readPlannerEntityFiltersFromSearch(params)).toEqual({
      status: ["available", "in-use"],
      driverIds: ["drv-a", "drv-b"],
      unitIds: ["u-1"],
      customerIds: ["c-1"],
    });
  });

  it("drops unknown status ids (negative control)", () => {
    const params = new URLSearchParams("planner_status=available,bogus,in-shop");
    expect(readPlannerEntityFiltersFromSearch(params).status).toEqual(["available", "in-shop"]);
  });

  it("writes filters into the query and clears empty keys", () => {
    const base = new URLSearchParams("planner_driver_ids=old&foo=keep");
    const next = writePlannerEntityFiltersToSearch(base, {
      status: ["in-use"],
      driverIds: ["drv-z"],
      unitIds: [],
      customerIds: [],
    });
    expect(next.get("planner_status")).toBe("in-use");
    expect(next.get("planner_driver_ids")).toBe("drv-z");
    expect(next.get("planner_unit_ids")).toBeNull();
    expect(next.get("planner_customer_ids")).toBeNull();
    expect(next.get("foo")).toBe("keep");
  });
});
