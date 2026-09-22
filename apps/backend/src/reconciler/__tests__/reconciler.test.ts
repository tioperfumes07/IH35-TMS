import { describe, expect, it } from "vitest";
import { canonicalActiveLoadWhereClause } from "../../dispatch/canonical-active-load-set.js";
import { I8_SQL, i8DispatchedLoadComplete, i8ExceptionsForRow } from "../invariants/i8-dispatched-load-complete.js";
import { RECONCILER_INVARIANTS } from "../registry.js";
import { runReconciler } from "../run.js";
import type { Invariant, Queryable } from "../types.js";

const COMPANY = "5c854333-6ea5-4faa-af31-67cb272fef80";

function row(overrides: Partial<Parameters<typeof i8ExceptionsForRow>[0]> = {}) {
  return {
    load_id: "00000000-0000-0000-0000-000000000001",
    load_number: "13616",
    created_at: "2026-09-21T19:58:00+00:00",
    has_unit: true,
    has_trailer: true,
    has_driver: true,
    has_customer_reference: true,
    ...overrides,
  };
}

function recordingClient(rowsFor: (sql: string) => unknown[] | Error) {
  const statements: string[] = [];
  const client: Queryable = {
    async query(sql: string) {
      statements.push(sql.trim());
      const out = rowsFor(sql);
      if (out instanceof Error) throw out;
      return { rows: out as never[] };
    },
  };
  return { client, statements };
}

describe("I8 — a dispatched load has a truck, a trailer, a driver and a customer reference", () => {
  it("files one exception per missing field, keyed stably and labelled by load number", () => {
    const exceptions = i8ExceptionsForRow(row({ has_unit: false, has_customer_reference: false }));
    expect(exceptions.map((e) => e.field)).toEqual(["unit", "customer_reference"]);
    expect(exceptions[0]).toMatchObject({
      key: "I8/load/00000000-0000-0000-0000-000000000001/unit",
      invariant: "I8",
      entity_type: "load",
      entity_label: "13616",
      reason: "No truck is assigned to this load.",
      since_source: "mdata.loads.created_at",
      repair_engine: null,
    });
  });

  it("files nothing for a complete load", () => {
    expect(i8ExceptionsForRow(row())).toEqual([]);
  });

  it("reads the canonical active-load predicate, scoped to one company, real rows only", () => {
    expect(I8_SQL).toContain(canonicalActiveLoadWhereClause("l"));
    expect(I8_SQL).toContain("l.operating_company_id = $1::uuid");
    expect(I8_SQL).toContain("l.soft_deleted_at IS NULL");
    expect(I8_SQL).toContain("l.is_sample_data IS NOT TRUE");
    expect(I8_SQL).toContain("dispatch.load_assignment_history");
    expect(I8_SQL).not.toContain("load_trailer_equipment_id");
  });

  it("detect passes the company id and expands every row", async () => {
    const { client } = recordingClient(() => [row({ has_trailer: false }), row({ load_number: "13609", has_driver: false })]);
    const exceptions = await i8DispatchedLoadComplete.detect(client, COMPANY);
    expect(exceptions.map((e) => `${e.entity_label}:${e.field}`)).toEqual(["13616:trailer", "13609:driver"]);
  });
});

describe("runReconciler", () => {
  it("registers I8", () => {
    expect(RECONCILER_INVARIANTS.map((i) => i.id)).toContain("I8");
  });

  it("records a failing invariant as an error, rolls back its savepoint, and still runs the next one", async () => {
    const broken: Invariant = {
      id: "IX",
      title: "broken",
      ownerSeat: "CC-1",
      repairEngine: null,
      async detect(c) {
        await c.query("SELECT broken");
        return [];
      },
    };
    const { client, statements } = recordingClient((sql) =>
      sql.includes("SELECT broken") ? new Error('column "broken" does not exist') : [row({ has_unit: false })]
    );
    const run = await runReconciler(client, COMPANY, [broken, i8DispatchedLoadComplete]);

    expect(run.results.map((r) => [r.invariant, r.status])).toEqual([
      ["IX", "error"],
      ["I8", "ok"],
    ]);
    expect(run.results[0]).toMatchObject({ error: 'column "broken" does not exist', exceptions: [] });
    expect(run.errored_invariants).toEqual(["IX"]);
    expect(run.exception_count).toBe(1);
    expect(statements).toContain("ROLLBACK TO SAVEPOINT reconciler_invariant");
    expect(statements.filter((s) => s === "SAVEPOINT reconciler_invariant")).toHaveLength(2);
  });
});
