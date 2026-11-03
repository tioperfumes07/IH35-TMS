/**
 * ENG-29/53 — dwell evidence / odometer capture must not abort the miles persist txn.
 * The hourly tick is one withLuciaBypass BEGIN; a bare throw after persistLoadRealDrivenMiles
 * rolled back tip-proven fills (13690 → 1731.7). Guard the SAVEPOINT isolation in source.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../load-real-driven-miles.service.ts");

describe("runLoadRealDrivenMilesCronTick dwell evidence isolation (ENG-29/53)", () => {
  const src = readFileSync(SRC, "utf8");

  it("persists miles before dwell evidence and isolates evidence in a SAVEPOINT", () => {
    expect(src).toContain("SAVEPOINT real_driven_miles_dwell_evidence");
    expect(src).toContain("ROLLBACK TO SAVEPOINT real_driven_miles_dwell_evidence");
    expect(src).toContain("dwell_evidence_isolated_failure");
    const persistAt = src.indexOf("await persistLoadRealDrivenMiles(db, company.id, rows);");
    const savepointAt = src.indexOf("SAVEPOINT real_driven_miles_dwell_evidence");
    expect(persistAt).toBeGreaterThan(0);
    expect(savepointAt).toBeGreaterThan(persistAt);
  });

  it("orders NULL-miles loads first and re-picks stale NULL after newer stop times", () => {
    expect(src).toContain("ORDER BY (l.miles_driven_actual IS NULL) DESC, l.id");
    expect(src).toContain("s.actual_arrival_at > l.miles_driven_actual_computed_at");
    expect(src).toContain("s.actual_departure_at > l.miles_driven_actual_computed_at");
  });
});
