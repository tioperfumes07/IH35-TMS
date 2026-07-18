import { describe, expect, it } from "vitest";
import {
  computeQboSyncFreshness,
  QBO_SYNC_STALE_AFTER_MS,
  QBO_SYNC_STALE_AFTER_SECONDS,
} from "./sync-freshness.js";

const NOW = Date.parse("2026-07-18T20:00:00.000Z");

describe("computeQboSyncFreshness", () => {
  it("uses the newest successful source and reports a UTC-safe age", () => {
    const freshness = computeQboSyncFreshness(
      [
        { source: "qbo_sync_runs", completedAt: "2026-07-18T17:00:00-03:00" },
        { source: "master_data_cdc", completedAt: "2026-07-18T18:00:00.000Z" },
      ],
      NOW
    );

    expect(freshness).toEqual({
      last_success_at: "2026-07-18T17:00:00-03:00",
      last_success_source: "qbo_sync_runs",
      last_success_age_seconds: 0,
      stale_after_seconds: QBO_SYNC_STALE_AFTER_SECONDS,
      freshness_status: "fresh",
      is_stale: false,
    });
  });

  it("becomes stale only after the existing 24-hour health threshold", () => {
    const exactlyAtThreshold = computeQboSyncFreshness(
      [{ source: "master_data_cdc", completedAt: new Date(NOW - QBO_SYNC_STALE_AFTER_MS).toISOString() }],
      NOW
    );
    const pastThreshold = computeQboSyncFreshness(
      [{ source: "master_data_cdc", completedAt: new Date(NOW - QBO_SYNC_STALE_AFTER_MS - 1_000).toISOString() }],
      NOW
    );

    expect(exactlyAtThreshold.is_stale).toBe(false);
    expect(exactlyAtThreshold.freshness_status).toBe("fresh");
    expect(pastThreshold.is_stale).toBe(true);
    expect(pastThreshold.freshness_status).toBe("stale");
    expect(pastThreshold.last_success_age_seconds).toBe(QBO_SYNC_STALE_AFTER_SECONDS + 1);
  });

  it("does not fabricate freshness when no successful timestamp exists", () => {
    expect(
      computeQboSyncFreshness(
        [
          { source: "qbo_sync_runs", completedAt: null },
          { source: "master_data_cdc", completedAt: "not-a-date" },
        ],
        NOW
      )
    ).toEqual({
      last_success_at: null,
      last_success_source: null,
      last_success_age_seconds: null,
      stale_after_seconds: QBO_SYNC_STALE_AFTER_SECONDS,
      freshness_status: "never",
      is_stale: false,
    });
  });
});
