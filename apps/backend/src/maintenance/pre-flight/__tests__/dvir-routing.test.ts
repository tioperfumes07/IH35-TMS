import { describe, expect, it, vi } from "vitest";

vi.mock("../../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
}));

import { routeDefect } from "../dvir-routing.service.js";
import type { DbClient } from "../dvir-severity.service.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const DEFECT = "22222222-2222-4222-8222-222222222222";
const UNIT = "44444444-4444-4444-8444-444444444444";
const USER = "33333333-3333-4333-8333-333333333333";

type Handler = (sql: string, values?: unknown[]) => { rows: unknown[]; rowCount?: number };

function makeClient(handler: Handler) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client: DbClient = {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return handler(sql, values) as { rows: never[] };
    }),
  };
  return { client, calls };
}

const baseDefect = {
  id: DEFECT,
  operating_company_id: COMPANY,
  dvir_submission_id: "55555555-5555-4555-8555-555555555555",
  unit_id: UNIT,
  item_key: "brakes",
  notes: "Air brake leak at chamber",
  severity: "major",
};

describe("GAP-49 routeDefect", () => {
  it("404s when the defect is not found", async () => {
    const { client } = makeClient(() => ({ rows: [] }));
    const res = await routeDefect(client, USER, COMPANY, DEFECT);
    expect(res).toEqual({ error: "defect_not_found" });
  });

  it("auto-creates a work order for a MAJOR defect", async () => {
    let tagInserts = 0;
    const { client, calls } = makeClient((sql) => {
      if (sql.includes("FROM safety.dvir_defects")) return { rows: [baseDefect] };
      if (sql.includes("FROM safety.dvir_defect_severity_tags")) {
        // first call (effective lookup) → no tag yet; after classifier insert → major
        return tagInserts === 0
          ? { rows: [] }
          : { rows: [{ severity: "major", major_defect_code: "BRAKE_AIR_LEAK", routed: false, auto_wo_id: null }] };
      }
      if (sql.includes("INSERT INTO safety.dvir_defect_severity_tags")) {
        tagInserts += 1;
        return { rows: [{ id: `tag-${tagInserts}` }] };
      }
      if (sql.includes("maintenance.next_wo_display_id")) return { rows: [{ display_id: "DV-0001", sequence: 1 }] };
      if (sql.includes("INSERT INTO maintenance.work_orders")) return { rows: [{ id: "wo-1", display_id: "DV-0001" }] };
      return { rows: [] };
    });

    const res = await routeDefect(client, USER, COMPANY, DEFECT);
    expect(res).toMatchObject({ ok: true, severity: "major", action: "work_order_created", work_order_id: "wo-1" });
    expect(calls.some((c) => c.sql.includes("INSERT INTO maintenance.work_orders"))).toBe(true);
  });

  it("does NOT create a work order for a MINOR defect (queues next PM)", async () => {
    const minorDefect = { ...baseDefect, notes: "wiper streaks", item_key: "wipers", severity: "minor" };
    const { client, calls } = makeClient((sql) => {
      if (sql.includes("FROM safety.dvir_defects")) return { rows: [minorDefect] };
      if (sql.includes("FROM safety.dvir_defect_severity_tags")) {
        return { rows: [{ severity: "minor", major_defect_code: null, routed: false, auto_wo_id: null }] };
      }
      if (sql.includes("INSERT INTO safety.dvir_defect_severity_tags")) return { rows: [{ id: "tag-x" }] };
      return { rows: [] };
    });

    const res = await routeDefect(client, USER, COMPANY, DEFECT);
    expect(res).toMatchObject({ ok: true, severity: "minor", action: "queued_next_pm", work_order_id: null });
    expect(calls.some((c) => c.sql.includes("INSERT INTO maintenance.work_orders"))).toBe(false);
  });

  it("logs only for an OBSERVATION (no work order)", async () => {
    const { client, calls } = makeClient((sql) => {
      if (sql.includes("FROM safety.dvir_defects")) return { rows: [baseDefect] };
      if (sql.includes("FROM safety.dvir_defect_severity_tags")) {
        return { rows: [{ severity: "observation", major_defect_code: null, routed: false, auto_wo_id: null }] };
      }
      if (sql.includes("INSERT INTO safety.dvir_defect_severity_tags")) return { rows: [{ id: "tag-o" }] };
      return { rows: [] };
    });

    const res = await routeDefect(client, USER, COMPANY, DEFECT);
    expect(res).toMatchObject({ ok: true, severity: "observation", action: "logged_observation", work_order_id: null });
    expect(calls.some((c) => c.sql.includes("INSERT INTO maintenance.work_orders"))).toBe(false);
  });

  it("is idempotent — an already-routed defect is not re-routed", async () => {
    const { client, calls } = makeClient((sql) => {
      if (sql.includes("FROM safety.dvir_defects")) return { rows: [baseDefect] };
      if (sql.includes("FROM safety.dvir_defect_severity_tags")) {
        return { rows: [{ severity: "major", major_defect_code: "BRAKE_AIR_LEAK", routed: true, auto_wo_id: "wo-existing" }] };
      }
      return { rows: [] };
    });

    const res = await routeDefect(client, USER, COMPANY, DEFECT);
    expect(res).toMatchObject({ ok: true, action: "already_routed", work_order_id: "wo-existing" });
    expect(calls.some((c) => c.sql.includes("INSERT INTO maintenance.work_orders"))).toBe(false);
  });
});
