/**
 * ROUND 12 E-12 — the Samsara safety events the poll measured and dropped every day (followingDistance,
 * edgeRailroadCrossingViolation, unsafeParking, laneDeparture) now map to their own stored kinds.
 */
import { describe, expect, it } from "vitest";
import { HARSH_EVENT_KINDS, normalizeSafetyEventRow } from "../harsh-events-poll.cron.js";

const row = (label: string) => ({ id: `evt-${label}`, time: "2026-11-15T10:00:00Z", vehicle: { id: "281474" }, behaviorLabels: [{ label }] });

describe("E-12 Samsara safety kinds", () => {
  it.each([
    ["followingDistance", "following_distance"],
    ["edgeRailroadCrossingViolation", "railroad_crossing"],
    ["unsafeParking", "unsafe_parking"],
    ["laneDeparture", "lane_departure"],
    ["braking", "harsh_brake"],
  ])("%s → %s", (label, kind) => {
    const out = normalizeSafetyEventRow(row(label)) as Record<string, unknown> | null;
    expect(out).not.toBeNull();
    expect(JSON.stringify(out)).toContain(kind);
  });
  it("every mapped kind is one the CHECK accepts", () => {
    expect(HARSH_EVENT_KINDS).toEqual(expect.arrayContaining(["following_distance", "railroad_crossing", "lane_departure", "unsafe_parking"]));
  });
});
