/**
 * ENG-29/53 — dwell evidence / odometer capture must not abort the miles persist txn.
 * The hourly tick is one withLuciaBypass BEGIN; a bare throw after persistLoadRealDrivenMiles
 * rolled back tip-proven fills (13690 → 1731.7). Source-shape + fake-client behavior both required:
 * Codex #27976 — source-text alone lets an if(false) wrap of ROLLBACK escape.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../load-real-driven-miles.service.ts");

const h = vi.hoisted(() => ({
  persistStopDwellEvidence: vi.fn(),
  captureGeofenceOdometerEvents: vi.fn(async () => undefined),
  computeLoadRealDrivenMiles: vi.fn(async () => []),
  persistLoadRealDrivenMiles: vi.fn(async () => 1),
}));

vi.mock("../stop-dwell-evidence.service.js", () => ({
  persistStopDwellEvidence: h.persistStopDwellEvidence,
}));
vi.mock("../../integrations/samsara/geofences/geofence-odometer-capture.service.js", () => ({
  captureGeofenceOdometerEvents: h.captureGeofenceOdometerEvents,
}));

const { persistDwellEvidenceInSavepoint } = await import("../load-real-driven-miles.service.js");

type FakeDb = {
  sql: string[];
  milesCommitted: boolean;
  aborted: boolean;
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
};

function fakeDb(opts?: { skipRollback?: boolean }): FakeDb {
  const state: FakeDb = {
    sql: [],
    milesCommitted: true, // caller already persisted miles before invoking the helper
    aborted: false,
    query: async (sql: string) => {
      if (state.aborted && !/ROLLBACK TO SAVEPOINT|RELEASE SAVEPOINT/.test(sql)) {
        throw Object.assign(new Error("current transaction is aborted"), { code: "25P02" });
      }
      if (opts?.skipRollback && /ROLLBACK TO SAVEPOINT real_driven_miles_dwell_evidence/.test(sql)) {
        // Plant: pretend rollback was disabled — leave txn aborted so follow-up fails.
        state.aborted = true;
        return { rows: [] };
      }
      state.sql.push(sql);
      if (/ROLLBACK TO SAVEPOINT real_driven_miles_dwell_evidence/.test(sql)) {
        state.aborted = false;
      }
      return { rows: [] };
    },
  };
  return state;
}

const rowWithEvidence = {
  load_id: "load-1",
  unit_id: "unit-1",
  legs: [],
  miles_driven_actual: 1731.7,
  reason: "odometer",
  dwell_evidence: [
    {
      stop_id: "stop-1",
      load_id: "load-1",
      boundary: "arrival" as const,
      geofence_event_id: "evt-1",
      occurred_at: "2026-11-02T12:00:00.000Z",
    },
  ],
};

describe("runLoadRealDrivenMilesCronTick dwell evidence isolation (ENG-29/53)", () => {
  afterEach(() => {
    h.persistStopDwellEvidence.mockReset();
    h.captureGeofenceOdometerEvents.mockReset();
    h.computeLoadRealDrivenMiles.mockReset();
    h.persistLoadRealDrivenMiles.mockReset();
  });

  it("persists miles before dwell evidence and isolates evidence in a SAVEPOINT (source shape)", () => {
    const src = readFileSync(SRC, "utf8");
    expect(src).toContain("SAVEPOINT real_driven_miles_dwell_evidence");
    expect(src).toContain("ROLLBACK TO SAVEPOINT real_driven_miles_dwell_evidence");
    expect(src).toContain("dwell_evidence_isolated_failure");
    expect(src).toContain("persistDwellEvidenceInSavepoint");
    const persistAt = src.indexOf("await persistLoadRealDrivenMiles(db, company.id, rows);");
    const savepointHelperAt = src.indexOf("await persistDwellEvidenceInSavepoint(db, company.id, rows);");
    expect(persistAt).toBeGreaterThan(0);
    expect(savepointHelperAt).toBeGreaterThan(persistAt);
  });

  it("orders NULL-miles loads first and re-picks stale NULL after newer stop times", () => {
    const src = readFileSync(SRC, "utf8");
    expect(src).toContain("ORDER BY (l.miles_driven_actual IS NULL) DESC, l.id");
    expect(src).toContain("s.actual_arrival_at > l.miles_driven_actual_computed_at");
    expect(src).toContain("s.actual_departure_at > l.miles_driven_actual_computed_at");
  });

  it("dwell write failure rolls the savepoint back, keeps miles committed, and leaves the txn usable", async () => {
    h.persistStopDwellEvidence.mockRejectedValue(
      Object.assign(new Error("dwell write failed"), { code: "23505" }),
    );
    const db = fakeDb();
    expect(db.milesCommitted).toBe(true);

    const outcome = await persistDwellEvidenceInSavepoint(db as never, "co-1", [rowWithEvidence as never]);

    expect(outcome).toBe("rolled_back");
    expect(db.sql).toContain("SAVEPOINT real_driven_miles_dwell_evidence");
    expect(db.sql).toContain("ROLLBACK TO SAVEPOINT real_driven_miles_dwell_evidence");
    expect(db.sql.filter((s) => /RELEASE SAVEPOINT real_driven_miles_dwell_evidence/.test(s))).toHaveLength(1);
    expect(db.milesCommitted).toBe(true);
    expect(db.aborted).toBe(false);
    // Outer txn can continue / retry — a follow-up query must not see 25P02.
    await expect(db.query("SELECT 1")).resolves.toEqual({ rows: [] });
    expect(h.captureGeofenceOdometerEvents).not.toHaveBeenCalled();
  });

  it("dwell success releases the savepoint without rollback", async () => {
    h.persistStopDwellEvidence.mockResolvedValue({ events_written: 0 });
    const db = fakeDb();
    const outcome = await persistDwellEvidenceInSavepoint(db as never, "co-1", [rowWithEvidence as never]);
    expect(outcome).toBe("released");
    expect(db.sql).toContain("SAVEPOINT real_driven_miles_dwell_evidence");
    expect(db.sql).toContain("RELEASE SAVEPOINT real_driven_miles_dwell_evidence");
    expect(db.sql.some((s) => /ROLLBACK TO SAVEPOINT/.test(s))).toBe(false);
  });

  it("disabling ROLLBACK leaves the txn aborted so follow-up work fails (plant)", async () => {
    h.persistStopDwellEvidence.mockRejectedValue(new Error("dwell write failed"));
    const db = fakeDb({ skipRollback: true });
    await persistDwellEvidenceInSavepoint(db as never, "co-1", [rowWithEvidence as never]);
    // Without a real ROLLBACK TO SAVEPOINT the outer txn stays unusable — this is the Codex mutant
    // the source-text-only guard missed.
    await expect(db.query("SELECT 1")).rejects.toMatchObject({ code: "25P02" });
  });
});
