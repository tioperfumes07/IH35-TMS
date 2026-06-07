import { describe, expect, it, vi } from "vitest";
import { computeDaysUntilExpiry, computeSeverity, scanAllDrivers } from "../cert-monitor.service.js";

describe("computeDaysUntilExpiry", () => {
  it("returns null for empty values", () => {
    expect(computeDaysUntilExpiry(null)).toBeNull();
    expect(computeDaysUntilExpiry("")).toBeNull();
  });

  it("computes whole-day UTC difference", () => {
    const reference = new Date("2026-06-01T12:00:00.000Z");
    expect(computeDaysUntilExpiry("2026-06-01", reference)).toBe(0);
    expect(computeDaysUntilExpiry("2026-06-10", reference)).toBe(9);
    expect(computeDaysUntilExpiry("2026-05-30", reference)).toBe(-2);
  });
});

describe("computeSeverity", () => {
  it("maps day ranges to severity", () => {
    expect(computeSeverity(5)).toBe("critical");
    expect(computeSeverity(14)).toBe("warn");
    expect(computeSeverity(30)).toBe("warn");
    expect(computeSeverity(31)).toBe("info");
    expect(computeSeverity(60)).toBe("info");
    expect(computeSeverity(61)).toBeNull();
  });
});

describe("scanAllDrivers", () => {
  it("expands driver rows into cert alerts sorted by severity then days", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          driver_uuid: "d1",
          driver_name: "Ada Driver",
          cdl_expires_at: "2026-06-05",
          medical_card_expires_at: "2026-07-10",
          hazmat_endorsement_expires_at: null,
          twic_expires_at: null,
          passport_expires_at: null,
          drug_test_due_date: null,
        },
        {
          driver_uuid: "d2",
          driver_name: "Bob Driver",
          cdl_expires_at: "2026-06-20",
          medical_card_expires_at: null,
          hazmat_endorsement_expires_at: null,
          twic_expires_at: null,
          passport_expires_at: null,
          drug_test_due_date: null,
        },
      ],
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    const alerts = await scanAllDrivers({ query }, "11111111-1111-1111-1111-111111111111");
    vi.useRealTimers();

    expect(query).toHaveBeenCalledOnce();
    expect(alerts.map((a) => `${a.driver_uuid}:${a.cert_type}:${a.severity}`)).toEqual([
      "d1:cdl:critical",
      "d2:cdl:warn",
      "d1:medical_card:info",
    ]);
  });
});
