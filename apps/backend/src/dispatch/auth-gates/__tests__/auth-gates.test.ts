import { describe, expect, it } from "vitest";
import { checkGates } from "../gate-registry.service.js";
import "../wf-044-advisory.gate.js";
import "../wf-050-dvir-major.gate.js";
import "../wf-038-active-driver.gate.js";

describe("dispatch auth gates", () => {
  it("WF-038 blocks inactive driver", async () => {
    const client = { query: async () => ({ rows: [{ status: "Inactive", is_dispatch_blocked: false }] }) };
    const result = await checkGates({ operating_company_id: "oci", action_slug: "book_load", driver_uuid: "d1" }, client);
    expect(result.pass).toBe(false);
    expect(result.blockers.some((b) => b.workflow === "WF-038")).toBe(true);
  });

  it("passes active driver with no PM/DVIR issues", async () => {
    const client = { query: async (sql: string) => {
      if (sql.includes("mdata.drivers")) return { rows: [{ status: "Active", is_dispatch_blocked: false }] };
      return { rows: [] };
    }};
    const result = await checkGates({ operating_company_id: "oci", action_slug: "book_load", driver_uuid: "d1", unit_uuid: "u1" }, client);
    expect(result.pass).toBe(true);
  });
});
