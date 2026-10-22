// LEAD 443.219 G-STRICT — a list route never silently drops a query param. Fails on origin/main: no strict-query helper, and
// z.object() quietly ignores any key it does not know (the screen's filter is lost, the list is wrong, the response is 200).
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

const schema = z.object({ operating_company_id: z.string(), resolved: z.string().optional() });

describe("443.219 — strictListQuery", () => {
  it("outside production an unknown param is a validation failure (400), never ignored", async () => {
    const { strictListQuery } = await import("../strict-query.js");
    const s = strictListQuery(schema, "GET /x", { env: "test" });
    expect(s.safeParse({ operating_company_id: "co", unit_id: "u-1" }).success).toBe(false);
    expect(s.safeParse({ operating_company_id: "co", resolved: "false" }).success).toBe(true);
  });

  it("in production the request is served, the unknown param is LOGGED and stripped", async () => {
    const { strictListQuery } = await import("../strict-query.js");
    const log = vi.fn();
    const s = strictListQuery(schema, "GET /x", { env: "production", log });
    const r = s.safeParse({ operating_company_id: "co", unit_id: "u-1" });
    expect(r.success).toBe(true);
    expect(r.success && r.data).toEqual({ operating_company_id: "co" });
    expect(log).toHaveBeenCalledWith("strict_list_query_unknown_params", { route: "GET /x", params: ["unit_id"] });
  });
});
