import { describe, expect, it } from "vitest";
import { computeAssignmentAction } from "../vehicle-driver-lookup.service.js";

describe("vehicle-driver pairing overlap handling", () => {
  it("closes previous assignment and inserts a new one for reassignment", () => {
    const action = computeAssignmentAction(
      {
        id: "11111111-1111-1111-1111-111111111111",
        driver_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        started_at: "2026-05-23T19:00:00.000Z",
      },
      "assign",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "2026-05-23T20:00:00.000Z"
    );
    expect(action).toEqual({ close_open_assignment: true, insert_new_assignment: true });
  });

  it("drops stale events that would create overlapping windows", () => {
    const action = computeAssignmentAction(
      {
        id: "11111111-1111-1111-1111-111111111111",
        driver_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        started_at: "2026-05-23T20:00:00.000Z",
      },
      "assign",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "2026-05-23T19:59:00.000Z"
    );
    expect(action).toEqual({ close_open_assignment: false, insert_new_assignment: false });
  });
});
