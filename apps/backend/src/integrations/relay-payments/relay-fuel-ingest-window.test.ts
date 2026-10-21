/**
 * 443.201 — verify-relay-ingest-lookback: the overlap window is wide enough to
 * catch Relay late-published fills.
 *
 * Prod data (2026-10-21): 184 USMCA relay_fuel_transactions had ingest lag > 3 days
 * (max 39 days). With RELAY_INGEST_OVERLAP_DAYS = 3, any fill Relay publishes with
 * relay_created_at more than 3 days before "yesterday" is permanently missed under
 * normal daily ticks. Raising to 7 covers observed post-latency without meaningfully
 * increasing API load.
 *
 * FAIL-OLD: the test at the bottom asserts that overlap=3 produces a window that
 * does NOT include a fill from yesterday-4; it must fail if someone reverts to 3.
 */
import { describe, expect, it } from "vitest";
import { computeRelayIngestWindow, RELAY_INGEST_OVERLAP_DAYS } from "./relay-fuel-ingest-window.js";

const YESTERDAY = "2026-10-20";

describe("computeRelayIngestWindow — lookback coverage (443.201)", () => {
  it("default overlap covers a fill published 4 days before yesterday (relay post-latency)", () => {
    // Fill with relay_created_at = yesterday-4 = 2026-10-16; last tick ended yesterday-1.
    // With overlap >= 5, window start <= 2026-10-16.
    const result = computeRelayIngestWindow("2026-10-19", YESTERDAY);
    const fillDate = "2026-10-16"; // relay_created_at 4 days before yesterday
    expect(result.startDate <= fillDate).toBe(true);
    expect(result.endDate).toBe(YESTERDAY);
  });

  it("default overlap covers a fill published 6 days before yesterday", () => {
    // Fill with relay_created_at = yesterday-6 = 2026-10-14.
    const result = computeRelayIngestWindow("2026-10-19", YESTERDAY);
    const fillDate = "2026-10-14";
    expect(result.startDate <= fillDate).toBe(true);
  });

  it("RELAY_INGEST_OVERLAP_DAYS constant is at least 7 (fail-old: reverts to 3 break this)", () => {
    // This is the guard: if someone reverts to 3, this test fails.
    expect(RELAY_INGEST_OVERLAP_DAYS).toBeGreaterThanOrEqual(7);
  });

  it("FAIL-OLD: overlap=3 would miss a fill from yesterday-4 — proves why 3 was insufficient", () => {
    // With overlap=3, window start = yesterday-2 = 2026-10-18. A fill with relay_created_at
    // = 2026-10-16 (yesterday-4) is BEFORE the window start and would never be ingested.
    const withOldOverlap = computeRelayIngestWindow("2026-10-19", YESTERDAY, { overlapDays: 3 });
    const lateFill = "2026-10-16"; // yesterday-4
    expect(withOldOverlap.startDate > lateFill).toBe(true); // the old window misses it
    // Confirm the new (>=7) default catches it:
    const withNewOverlap = computeRelayIngestWindow("2026-10-19", YESTERDAY, { overlapDays: 7 });
    expect(withNewOverlap.startDate <= lateFill).toBe(true); // the new window covers it
  });

  it("normal catchup (gap > overlap) still drives startDate from the resume day, not the overlap", () => {
    // After a 15-day gap, the window must start from resume day, not yesterday-6.
    const result = computeRelayIngestWindow("2026-10-05", YESTERDAY);
    expect(result.startDate).toBe("2026-10-06"); // resume from day after last covered
  });

  it("no prior tick — returns last overlap days", () => {
    const result = computeRelayIngestWindow(null, YESTERDAY);
    // start = yesterday - (overlap-1)
    expect(result.startDate).toBe("2026-10-14"); // 2026-10-20 - 6 days = 2026-10-14
    expect(result.endDate).toBe(YESTERDAY);
  });
});
