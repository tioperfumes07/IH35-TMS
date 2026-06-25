import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DETECTOR_REGISTRY } from "./detector.service.js";

/**
 * BLOCK-1 guard — the anomaly detector threw Postgres 42P01 on every run because it referenced
 * `fuel.transactions` (no such relation; the real table is fuel.fuel_transactions). This guard:
 *  (1) fails if ANY backend source reintroduces the bad relation name `fuel.transactions`, and
 *  (2) proves the fuel-off-route detector is a safe no-op (returns [] without touching the DB).
 */

const BACKEND_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("anomaly detector — fuel.transactions guard (BLOCK-1)", () => {
  it("no backend SQL selects FROM/JOIN the phantom relation `fuel.transactions`", () => {
    const offenders: string[] = [];
    // SQL-context only (FROM/JOIN/INTO/UPDATE fuel.transactions) — NOT fuel.fuel_transactions, and not
    // prose mentions in comments/docs. Skip *.test.ts so this guard's own literal doesn't trip it.
    const bad = /\b(from|join|into|update)\s+fuel\.transactions\b/i;
    for (const file of walk(BACKEND_SRC)) {
      if (file.endsWith(".test.ts")) continue;
      const src = readFileSync(file, "utf8");
      if (bad.test(src)) offenders.push(file.replace(BACKEND_SRC, "..."));
    }
    expect(offenders, `referenced fuel.transactions (use fuel.fuel_transactions): ${offenders.join(", ")}`).toEqual([]);
  });

  it("fuel_off_route detector is a safe no-op (returns [] without a DB call)", async () => {
    const detector = DETECTOR_REGISTRY.fuel_off_route_geo;
    expect(detector).toBeTypeOf("function");
    const client = {
      query: async () => {
        throw new Error("detector must NOT query the DB while disabled");
      },
    };
    const findings = await detector(client as never, "00000000-0000-0000-0000-000000000000", {});
    expect(findings).toEqual([]);
  });
});
