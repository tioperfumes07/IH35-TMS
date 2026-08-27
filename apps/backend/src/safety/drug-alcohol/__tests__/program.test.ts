/**
 * Tests: Drug & Alcohol Program Service (GAP-81)
 * Uses in-memory mock client — no DB required.
 */
import { describe, expect, it, vi } from "vitest";
import {
  enrollDriver,
  flagPositive,
  listEnrollments,
  listTestRecords,
  recordResult,
  scheduleTest,
} from "../program.service.js";

// ─── Mock PoolClient ──────────────────────────────────────────────────────────

function mockClient(rows: Record<string, unknown>[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as import("pg").PoolClient;
}

// ─── Enrollment ───────────────────────────────────────────────────────────────

describe("enrollDriver", () => {
  it("inserts enrollment and returns row", async () => {
    const expected = {
      uuid: "abc-123",
      operating_company_id: "co-1",
      driver_uuid: "drv-1",
      consortium_name: "NTTS",
      enrolled_at: "2026-01-01",
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
    };
    const client = {
      query: vi.fn().mockResolvedValueOnce({ rows: [{ id: "drv-1" }] }).mockResolvedValueOnce({ rows: [expected] }),
    } as unknown as import("pg").PoolClient;
    const result = await enrollDriver(client, "co-1", "drv-1", "NTTS", "2026-01-01");
    expect(result).toEqual(expected);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("throws when the canonical driver is not active in company scope", async () => {
    const client = mockClient([]);
    await expect(enrollDriver(client, "co-1", "drv-1", "NTTS", "2026-01-01")).rejects.toThrow(
      "active_driver_not_in_operating_company"
    );
  });

  it("throws an honest duplicate when the active unique arbiter returns no row", async () => {
    const client = {
      query: vi.fn().mockResolvedValueOnce({ rows: [{ id: "drv-1" }] }).mockResolvedValueOnce({ rows: [] }),
    } as unknown as import("pg").PoolClient;
    await expect(enrollDriver(client, "co-1", "drv-1", "NTTS", "2026-01-01")).rejects.toThrow(
      "active_enrollment_exists"
    );
  });
});

describe("listEnrollments", () => {
  it("returns rows from query", async () => {
    const rows = [{ uuid: "e1", is_active: true }];
    const client = mockClient(rows);
    const result = await listEnrollments(client, "co-1");
    expect(result).toEqual(rows);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("da_program_enrollments"), [
      "co-1",
      true,
    ]);
    const callSql = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(callSql).toContain("driver_company_authorizations da_enrollment_label_dca");
    // SAF-F6366: safety.da_program_enrollments.operating_company_id is TEXT, not uuid --
    // da_enrollment_label_dca.company_id (uuid) must be cast to ::text or Postgres 42883s
    // "operator does not exist: uuid = text" on every call. Live-reproduced before fixing.
    expect(callSql).toContain("da_enrollment_label_dca.company_id::text = e.operating_company_id");
  });
});

// ─── Test scheduling ──────────────────────────────────────────────────────────

describe("scheduleTest", () => {
  it("inserts test record with pending result", async () => {
    const expected = {
      uuid: "t1",
      operating_company_id: "co-1",
      driver_uuid: "drv-1",
      test_type: "random",
      test_kind: "drug",
      scheduled_at: null,
      collected_at: null,
      result: "pending",
      chain_of_custody_id: null,
      sap_referral_uuid: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    const client = mockClient([expected]);
    const result = await scheduleTest(client, "co-1", "drv-1", "random", "drug");
    expect(result.result).toBe("pending");
    expect(result.test_type).toBe("random");
  });

  it("supports all six FMCSA test types", async () => {
    const testTypes = [
      "pre_employment",
      "random",
      "post_accident",
      "reasonable_suspicion",
      "return_to_duty",
      "follow_up",
    ] as const;

    for (const testType of testTypes) {
      const client = mockClient([{ uuid: "t", result: "pending", test_type: testType, test_kind: "drug" }]);
      const result = await scheduleTest(client, "co-1", "drv-1", testType, "drug");
      expect(result.test_type).toBe(testType);
    }
  });

  it("throws if DB returns no row", async () => {
    const client = mockClient([]);
    await expect(scheduleTest(client, "co-1", "drv-1", "random", "drug")).rejects.toThrow(
      "active_driver_not_in_operating_company"
    );
  });
});

describe("listTestRecords", () => {
  it("returns filtered rows", async () => {
    const rows = [{ uuid: "t1", result: "positive" }];
    const client = mockClient(rows);
    const result = await listTestRecords(client, "co-1", { result: "positive" });
    expect(result).toEqual(rows);
    const callSql = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(callSql).toContain("result = $2");
    expect(callSql).toContain("driver_company_authorizations da_test_label_dca");
    // SAF-F6366: safety.da_test_records.operating_company_id is TEXT, not uuid -- same fix as
    // listEnrollments above. Live-reproduced (42883) before fixing.
    expect(callSql).toContain("da_test_label_dca.company_id::text = t.operating_company_id");
  });
});

// ─── Result recording ─────────────────────────────────────────────────────────

describe("recordResult", () => {
  it("updates test record with result", async () => {
    const expected = { uuid: "t1", result: "negative", chain_of_custody_id: "COC-001" };
    const client = mockClient([expected]);
    const result = await recordResult(client, "co-1", "t1", "negative", "COC-001");
    expect(result.result).toBe("negative");
    expect(result.chain_of_custody_id).toBe("COC-001");
  });

  it("throws if no row found", async () => {
    const client = mockClient([]);
    await expect(recordResult(client, "co-1", "t1", "negative")).rejects.toThrow("test_record_not_found");
  });
});

describe("flagPositive", () => {
  it("sets result to positive and stores SAP referral", async () => {
    const expected = { uuid: "t1", result: "positive", sap_referral_uuid: "sap-1" };
    const client = mockClient([expected]);
    const result = await flagPositive(client, "co-1", "t1", "sap-1");
    expect(result.result).toBe("positive");
    expect(result.sap_referral_uuid).toBe("sap-1");
  });

  it("works without SAP referral UUID", async () => {
    const expected = { uuid: "t1", result: "positive", sap_referral_uuid: null };
    const client = mockClient([expected]);
    const result = await flagPositive(client, "co-1", "t1");
    expect(result.result).toBe("positive");
    expect(result.sap_referral_uuid).toBeNull();
  });

  it("throws if test not found", async () => {
    const client = mockClient([]);
    await expect(flagPositive(client, "co-1", "missing-uuid")).rejects.toThrow("test_record_not_found");
  });
});
