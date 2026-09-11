import { describe, expect, it } from "vitest";
import { checkGates } from "../gate-registry.service.js";
import "../wf-044-advisory.gate.js";
import "../wf-050-dvir-major.gate.js";
import "../wf-038-active-driver.gate.js";
import "../driver-compliance-01.gate.js";

describe("dispatch auth gates", () => {
  it("WF-038 blocks inactive driver", async () => {
    const client = { query: async () => ({ rows: [{ status: "Inactive", is_dispatch_blocked: false }] }) };
    const result = await checkGates({ operating_company_id: "oci", action_slug: "book_load", driver_uuid: "d1" }, client);
    expect(result.pass).toBe(false);
    expect(result.blockers.some((b) => b.workflow === "WF-038")).toBe(true);
  });

  it("passes active driver with no PM/DVIR issues and full credentials", async () => {
    const queries: string[] = [];
    const client = { query: async (sql: string) => {
      queries.push(sql);
      // DRIVER-COMPLIANCE-01's gate also selects from mdata.drivers -- differentiate on its own
      // cdl_number column before the generic WF-038 branch, or it would fall through and read an
      // undefined cdl_number/cdl_expires_at/dot_medical_expires_at as "missing", false-blocking a
      // fully-credentialed driver.
      if (sql.includes("cdl_number")) {
        return { rows: [{ cdl_number: "TAMP220307", cdl_expires_at: "2029-09-22", dot_medical_expires_at: "2027-12-31" }] };
      }
      if (sql.includes("mdata.drivers")) return { rows: [{ status: "Active", is_dispatch_blocked: false }] };
      return { rows: [] };
    }};
    const result = await checkGates({ operating_company_id: "oci", action_slug: "book_load", driver_uuid: "d1", unit_uuid: "u1" }, client);
    expect(result.pass).toBe(true);
    const driverSql = queries.find((sql) => sql.includes("mdata.drivers") && !sql.includes("cdl_number")) ?? "";
    expect(driverSql).toContain("driver_company_authorizations wf038_driver_dca");
    expect(driverSql).toContain("wf038_driver_dca.company_id = $2::uuid");
    expect(driverSql).toContain("wf038_driver_dca.is_authorized = true");
    expect(driverSql).toContain("wf038_driver_dca.deactivated_at IS NULL");
  });

  // DRIVER-COMPLIANCE-01 (owner/Claude Lead 2026-09-11): a driver with NULL cdl_number/
  // cdl_expires_at/dot_medical_expires_at used to pass WF-038 silently (it only checks
  // status='Active'). These assertions prove the new gate blocks at the SAME service boundary and
  // names the SPECIFIC missing field(s), not a generic failure.
  it("DRIVER-COMPLIANCE-01 blocks a driver with no dot_medical_expires_at (real measured shape: CDL populated, medical missing)", async () => {
    const client = { query: async (sql: string) => {
      if (sql.includes("cdl_number")) {
        return { rows: [{ cdl_number: "TAMP220307", cdl_expires_at: "2029-09-22", dot_medical_expires_at: null }] };
      }
      return { rows: [{ status: "Active", is_dispatch_blocked: false }] };
    }};
    const result = await checkGates({ operating_company_id: "oci", action_slug: "book_load", driver_uuid: "d1" }, client);
    expect(result.pass).toBe(false);
    const blocker = result.blockers.find((b) => b.workflow === "DRIVER-COMPLIANCE-01");
    expect(blocker).toBeTruthy();
    expect(blocker?.message).toContain("DOT medical certificate expiration date");
    expect(blocker?.message).not.toContain("CDL number");
    expect((blocker?.evidence as { missing?: string[] } | undefined)?.missing).toEqual(["DOT medical certificate expiration date"]);
  });

  it("DRIVER-COMPLIANCE-01 names every missing field when a driver has no credentials at all", async () => {
    const client = { query: async (sql: string) => {
      if (sql.includes("cdl_number")) {
        return { rows: [{ cdl_number: null, cdl_expires_at: null, dot_medical_expires_at: null }] };
      }
      return { rows: [{ status: "Active", is_dispatch_blocked: false }] };
    }};
    const result = await checkGates({ operating_company_id: "oci", action_slug: "quick_assign", driver_uuid: "d1" }, client);
    expect(result.pass).toBe(false);
    const blocker = result.blockers.find((b) => b.workflow === "DRIVER-COMPLIANCE-01");
    expect((blocker?.evidence as { missing?: string[] } | undefined)?.missing).toEqual([
      "CDL number",
      "CDL expiration date",
      "DOT medical certificate expiration date",
    ]);
  });
});
