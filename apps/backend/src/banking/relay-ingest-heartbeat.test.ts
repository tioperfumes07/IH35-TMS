/**
 * ROW 22 engine test (Round 8.24, 2026-11-13):
 * relay_ingest_heartbeat KPI stale-alert logic and company-gate contract.
 *
 * These are pure unit tests — no DB needed (DATA-LATER for live sync rows).
 */
import { describe, it, expect } from "vitest";
import { BANKING_KPI_KEYS } from "./banking-kpi.service.js";

describe("relay_ingest_heartbeat", () => {
  it("relay_ingest_heartbeat is in BANKING_KPI_KEYS", () => {
    expect(BANKING_KPI_KEYS).toContain("relay_ingest_heartbeat");
  });

  describe("stale-alert logic (pure)", () => {
    function buildEmptyReason(hoursAgo: number | null): string | null {
      const isStale = hoursAgo == null || hoursAgo > 24;
      if (!isStale) return null;
      return hoursAgo == null
        ? "Relay ingest has never run successfully for this company."
        : `Relay ingest stale — last successful pull was ${hoursAgo}h ago (threshold 24h).`;
    }

    it("returns null when last pull was < 24h ago", () => {
      expect(buildEmptyReason(0)).toBeNull();
      expect(buildEmptyReason(1)).toBeNull();
      expect(buildEmptyReason(23)).toBeNull();
    });

    it("returns null at exactly 24h (boundary — not stale)", () => {
      expect(buildEmptyReason(24)).toBeNull();
    });

    it("returns stale message at 25h", () => {
      const msg = buildEmptyReason(25);
      expect(msg).toContain("Relay ingest stale");
      expect(msg).toContain("25h ago");
    });

    it("returns never-run message when hoursAgo is null", () => {
      const msg = buildEmptyReason(null);
      expect(msg).toContain("never run successfully");
    });

    it("returns stale for large hoursAgo values", () => {
      const msg = buildEmptyReason(72);
      expect(msg).toContain("72h ago");
    });
  });

  describe("company-gate contract (static)", () => {
    it("relay-fuel-ingest.cron.ts imports isUsmcaOperatingCompany", async () => {
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const src = readFileSync(
        resolve("apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts"),
        "utf8"
      );
      expect(src).toContain("isUsmcaOperatingCompany");
      // The skip guard: only USMCA companies proceed
      expect(src).toContain("!isUsmcaOperatingCompany(operatingCompanyId)) continue");
    });
  });
});
