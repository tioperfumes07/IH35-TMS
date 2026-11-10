/**
 * ACCT-F11122 — a Relay fill's day is the Central business day. Prod 11-09: the UTC filter counted 117 October fills
 * ($57,640.75); the Central filter counts 112 ($54,553.79) — exactly Relay's October export.
 */
import { describe, expect, it } from "vitest";
import { relayFillDaySql, relayFillOnOrAfterDaySql, relayFillOnOrBeforeDaySql } from "../relay-fill-day.sql.js";

describe("relay fill business day", () => {
  it("buckets on the America/Chicago day, never the UTC date", () => {
    expect(relayFillDaySql("t")).toBe("(t.relay_created_at AT TIME ZONE 'America/Chicago')::date");
  });
  it("from/to compare the timestamptz to Central midnights (index-friendly)", () => {
    expect(relayFillOnOrAfterDaySql("r", "$2")).toBe("r.relay_created_at >= ($2::date::timestamp AT TIME ZONE 'America/Chicago')");
    expect(relayFillOnOrBeforeDaySql("r", "$3")).toBe("r.relay_created_at < (($3::date + 1)::timestamp AT TIME ZONE 'America/Chicago')");
  });
});
