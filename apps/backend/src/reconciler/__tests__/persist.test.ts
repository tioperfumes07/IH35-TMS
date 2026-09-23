import { describe, expect, it, vi } from "vitest";

import { persistReconcilerRun } from "../persist.js";
import type { ReconcilerException, ReconcilerRun } from "../types.js";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";

function ex(key: string, invariant = "I8"): ReconcilerException {
  return {
    key, invariant, entity_type: "load", entity_id: "11111111-1111-4111-8111-111111111111", entity_label: "13615",
    field: "unit", reason: "No truck is assigned to this load.", since: "2026-09-20T00:00:00Z",
    since_source: "mdata.loads.created_at", owner_seat: "CC-3", repair_engine: null,
  };
}

function recorder(openBefore: string[] = [], resolvedRows = 0) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      if (/SELECT exception_key/.test(sql)) return { rows: openBefore.map((k) => ({ exception_key: k })) };
      if (/UPDATE reconciler\.exceptions SET resolved_at/.test(sql)) return { rows: Array.from({ length: resolvedRows }, (_, i) => ({ id: String(i) })) };
      if (/SELECT count\(\*\)::int AS n FROM reconciler\.exceptions/.test(sql)) return { rows: [{ n: 1 }] };
      return { rows: [] };
    }),
  };
  return { client, calls };
}

const run = (results: ReconcilerRun["results"]): ReconcilerRun => ({
  operating_company_id: CO, ran_at: "2026-09-23T04:00:00Z", results,
  exception_count: 0, errored_invariants: results.filter((r) => r.status === "error").map((r) => r.invariant),
});

describe("persistReconcilerRun — the reconciler's history", () => {
  it("an invariant that errored resolves nothing: only invariants that ran are in the resolve scope", async () => {
    const { client, calls } = recorder(["I8/load/x/unit"]);
    await persistReconcilerRun(client as never, run([
      { invariant: "I8", title: "t", status: "ok", exceptions: [ex("I8/load/x/unit")] },
      { invariant: "I2", title: "t", status: "error", error: "boom", exceptions: [] },
    ]));
    const resolve = calls.find((c) => /SET resolved_at = now\(\)/.test(c.sql))!;
    expect(resolve.values[1]).toEqual(["I8"]);
    expect(resolve.values[2]).toEqual(["I8/load/x/unit"]);
    const runRow = calls.find((c) => /INSERT INTO reconciler\.runs/.test(c.sql))!;
    expect(runRow.values[4]).toEqual(["I2"]);
  });

  it("counts an exception as opened only when it was not already open", async () => {
    const { client } = recorder(["I8/load/a/unit"], 2);
    const s = await persistReconcilerRun(client as never, run([
      { invariant: "I8", title: "t", status: "ok", exceptions: [ex("I8/load/a/unit"), ex("I8/load/b/unit")] },
    ]));
    expect(s.opened_count).toBe(1);
    expect(s.resolved_count).toBe(2);
    expect(s.open_count).toBe(1);
  });

  it("a returning exception is reopened, never duplicated: one upsert on the company + stable key", async () => {
    const { client, calls } = recorder();
    await persistReconcilerRun(client as never, run([{ invariant: "I8", title: "t", status: "ok", exceptions: [ex("I8/load/a/unit")] }]));
    const upsert = calls.find((c) => /INSERT INTO reconciler\.exceptions/.test(c.sql))!;
    expect(upsert.sql).toMatch(/ON CONFLICT \(operating_company_id, exception_key\) DO UPDATE/);
    expect(upsert.sql).toMatch(/resolved_at\s+= NULL/);
    expect(upsert.sql).toMatch(/times_reopened = reconciler\.exceptions\.times_reopened/);
    expect(calls.some((c) => /\bDELETE\b/i.test(c.sql))).toBe(false);
  });
});
