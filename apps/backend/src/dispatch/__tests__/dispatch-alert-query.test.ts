import { describe, expect, it } from "vitest";
import { dispatchAlertOrderBy, dispatchAlertQueryFields, type DispatchAlertQuery } from "../dispatch-alert-query.js";

describe("dispatchAlertQueryFields", () => {
  it("accepts the new COL-01-ALERT-BOARDS-LOCATION-SORT 'location' sort key", () => {
    const result = dispatchAlertQueryFields.sort.safeParse("location");
    expect(result.success).toBe(true);
  });
});

describe("dispatchAlertOrderBy", () => {
  const baseQuery: DispatchAlertQuery = { sort: "event_at", direction: "asc" };

  it("resolves a defined column normally", () => {
    const orderBy = dispatchAlertOrderBy(
      { ...baseQuery, sort: "location" },
      { event_at: "de.started_at", location: "ls.city" },
    );
    expect(orderBy).toBe("ls.city ASC NULLS LAST");
  });

  it("respects direction=desc", () => {
    const orderBy = dispatchAlertOrderBy(
      { ...baseQuery, sort: "location", direction: "desc" },
      { event_at: "de.started_at", location: "ls.city" },
    );
    expect(orderBy).toBe("ls.city DESC NULLS LAST");
  });

  // COL-01-ALERT-BOARDS-LOCATION-SORT: the `sort` enum is shared across all 3 alert-board routes,
  // but each route only maps the keys IT supports. Before this hardening, a route whose `columns`
  // map omitted a globally-valid key produced literal `undefined ASC NULLS LAST` as SQL. Falling
  // back to the route's own event_at column keeps every route safe.
  it("falls back to the route's own event_at column when the requested key isn't in this route's map", () => {
    const orderBy = dispatchAlertOrderBy(
      { ...baseQuery, sort: "location" },
      { event_at: "l.load_number" }, // this route never wired "location"
    );
    expect(orderBy).toBe("l.load_number ASC NULLS LAST");
    expect(orderBy).not.toContain("undefined");
  });
});
