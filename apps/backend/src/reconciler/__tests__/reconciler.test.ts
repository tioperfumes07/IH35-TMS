import { describe, expect, it } from "vitest";
import { canonicalActiveLoadInvoiceExclusionCte, canonicalActiveLoadWhereClause } from "../../dispatch/canonical-active-load-set.js";
import { I2_SQL, i2DeliveredLoadInvoiced, i2ExceptionForRow } from "../invariants/i2-delivered-load-invoiced.js";
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

describe("I2 — a delivered load has an issued invoice", () => {
  const base = {
    load_id: "00000000-0000-0000-0000-000000000002",
    load_number: "13600",
    load_status: "dispatched",
    faro_gross_cents: null as string | null,
    faro_invoice_numbers: null as string | null,
    faro_first_seen: null as string | null,
    authorized_at: null as string | null,
    unissued_invoice_statuses: null as string | null,
    status_since: "2026-09-15T09:00:00+00:00",
  };

  it("files a Faro-purchased load with no issued invoice, with the amount and Faro's date", () => {
    const e = i2ExceptionForRow(
      { ...base, faro_gross_cents: "490000", faro_invoice_numbers: "13600", faro_first_seen: "2026-09-21T20:00:00+00:00" },
      null
    );
    expect(e).toMatchObject({
      key: "I2/load/00000000-0000-0000-0000-000000000002/invoice",
      field: "invoice",
      entity_label: "13600",
      amount_cents: 490000,
      since_source: "factor.faro_invoice_lines.created_at",
      owner_seat: "CC-2",
    });
    expect(e?.reason).toBe("Faro bought invoice 13600 for $4,900.00 on this load, but our books have no issued invoice for it.");
  });

  it("uses recorded delivery evidence when Faro has not bought it, and names an unissued draft", () => {
    const e = i2ExceptionForRow({ ...base, unissued_invoice_statuses: "draft" }, "2026-09-20T14:00:00+00:00");
    expect(e?.since_source).toBe("mdata.load_stops.actual_departure_at");
    expect(e?.reason).toBe(
      "The final delivery stop departed on 2026-09-20, but no invoice has been issued. A draft invoice exists but was never issued."
    );
  });

  it("flags a Faro purchase on a cancelled load as the contradiction it is", () => {
    const e = i2ExceptionForRow(
      { ...base, load_status: "cancelled", faro_gross_cents: "480000", faro_invoice_numbers: "13593", faro_first_seen: "2026-09-12T00:00:00+00:00" },
      null
    );
    expect(e?.reason.endsWith("The load reads cancelled.")).toBe(true);
  });

  it("files nothing without delivery evidence, when status has not even progressed to delivered", () => {
    expect(i2ExceptionForRow(base, null)).toBeNull();
  });

  // Cursor's I2 finding (2026-09-23, docs/bus/OUTBOX-CURSOR.md): 9 live loads read
  // delivered-or-later with no issued invoice and carry none of the three evidence signals —
  // previously silently excluded by the exact same early-return the test above still covers.
  // "Delivered by status" is read from dispatch/canonical-active-load-set.ts's
  // isDeliveredOrLaterStatus, imported, never re-declared here.
  it("FILES a status-only contradiction: delivered_pending_docs with zero evidence and no invoice", () => {
    const e = i2ExceptionForRow({ ...base, load_status: "delivered_pending_docs" }, null);
    expect(e).not.toBeNull();
    expect(e).toMatchObject({
      key: "I2/load/00000000-0000-0000-0000-000000000002/invoice",
      field: "invoice",
      since_source: "mdata.loads.updated_at",
      since: "2026-09-15T09:00:00+00:00",
      amount_cents: null,
      amount_source: null,
      repair_engine: "POST /api/v1/accounting/invoices/from-load",
    });
    expect(e?.reason).toContain('status reads "delivered_pending_docs"');
    expect(e?.reason).toContain("no delivery evidence at all");
  });

  it("FILES the same contradiction for status=closed with only a voided invoice (6 of the 9 live loads)", () => {
    const e = i2ExceptionForRow({ ...base, load_status: "closed", unissued_invoice_statuses: null }, null);
    expect(e).not.toBeNull();
    expect(e?.reason).toContain('status reads "closed"');
  });

  it("prefers real evidence over the status-only branch when both are present", () => {
    // A load that is delivered-or-later by status AND has real evidence takes the normal
    // evidence-first path (Faro/stop-departure/manual-auth), never the status-only fallback.
    const e = i2ExceptionForRow(
      { ...base, load_status: "closed", faro_gross_cents: "100000", faro_invoice_numbers: "13999", faro_first_seen: "2026-09-18T00:00:00+00:00" },
      null
    );
    expect(e?.since_source).toBe("factor.faro_invoice_lines.created_at");
  });

  it("reads the canonical issued-invoice test and never the load status", () => {
    expect(I2_SQL).toContain(canonicalActiveLoadInvoiceExclusionCte("l.id"));
    expect(I2_SQL).toContain("factor.faro_invoice_lines");
    expect(I2_SQL).toContain("dispatch.manual_delivery_authorizations");
    expect(I2_SQL).not.toMatch(/l\.status(::text)?\s*(=|<>|IN|NOT IN)/);
  });

  it("asks the revrec poster's own departure rule for every candidate", async () => {
    const { client, statements } = recordingClient((sql) =>
      sql.includes("mdata.load_stops") ? [{ actual_departure_at: "2026-09-20T14:00:00+00:00" }] : [base]
    );
    const exceptions = await i2DeliveredLoadInvoiced.detect(client, COMPANY);
    expect(exceptions).toHaveLength(1);
    expect(statements.some((s) => s.includes("mdata.load_stops"))).toBe(true);
  });
});

describe("runReconciler", () => {
  it("registers I2, I8 and I-DEDUCT", () => {
    expect(RECONCILER_INVARIANTS.map((i) => i.id)).toEqual(["I2", "I8", "I-DEDUCT"]);
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
