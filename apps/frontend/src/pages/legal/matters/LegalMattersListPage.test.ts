import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { daysUntil } from "./LegalMattersListPage";

// LEGAL-MATTERS-SOL-COUNTDOWN-TZ-OFFBYONE — daysUntil() previously built `new Date(dateStr)` then
// called `.setHours(0,0,0,0)`, which re-derives the target's calendar day in the browser's LOCAL
// timezone. statute_of_limitations_at is a `date` column that the backend's default pg driver
// serializes as a full UTC ISO instant (e.g. "2026-08-31T00:00:00.000Z"), so a viewer in any
// negative-UTC-offset zone (all of the continental US, including this company's own Central Time)
// saw the countdown understate the true days remaining by one. Fixed to parse the calendar digits
// directly and diff against companyToday() (America/Chicago) — fully independent of the viewer's
// browser timezone.
describe("daysUntil — LEGAL-MATTERS-SOL-COUNTDOWN-TZ-OFFBYONE", () => {
  beforeEach(() => {
    // "Today" fixed to 2026-08-25 12:00 UTC (07:00 CDT) — well inside Aug 25 in every US zone.
    vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts the correct number of days for a bare date-only string", () => {
    expect(daysUntil("2026-08-31")).toBe(6);
  });

  it("counts the correct number of days for a full UTC-midnight ISO instant (the real backend shape)", () => {
    // This is exactly the shape the bug mishandled: `new Date(...).setHours(0,0,0,0)` on this
    // string re-derives "Aug 30" for any browser west of UTC, undercounting by one day.
    expect(daysUntil("2026-08-31T00:00:00.000Z")).toBe(6);
  });

  it("returns 0 for a deadline that is today", () => {
    expect(daysUntil("2026-08-25T00:00:00.000Z")).toBe(0);
  });

  it("returns a negative count for a past deadline", () => {
    expect(daysUntil("2026-08-20T00:00:00.000Z")).toBe(-5);
  });

  it("returns null for empty/unparseable input", () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil(undefined)).toBeNull();
    expect(daysUntil("")).toBeNull();
    expect(daysUntil("not-a-date")).toBeNull();
  });
});
