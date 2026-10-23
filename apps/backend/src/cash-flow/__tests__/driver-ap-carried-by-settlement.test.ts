import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { driverApBillCarriedBySettlementSql } from "../cash-flow-obligations.sql.js";

// LEAD 443.276 — one driver obligation counted once: a driver A/P bill inside a closed settlement is carried by the
// settlement row; every cash-flow reader of accounting.bills must apply the shared predicate.
const here = dirname(fileURLToPath(import.meta.url));
const service = readFileSync(join(here, "..", "cash-flow.service.ts"), "utf8");

/** Each SQL template literal that reads `FROM accounting.bills b`. */
function billReaders(src: string): string[] {
  const out: string[] = [];
  const re = /`([^`]*FROM accounting\.bills b[^`]*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

describe("driverApBillCarriedBySettlementSql", () => {
  const sql = driverApBillCarriedBySettlementSql("b");

  it("targets driver-category A/P bills only", () => {
    expect(sql).toContain("b.bill_category = 'driver'");
  });

  it("links the A/P bill to its per-load driver bill and that bill's ACTIVE settlement line", () => {
    expect(sql).toContain("cdb.accrued_bill_id = b.id");
    expect(sql).toContain("csl.source_driver_bill_id = cdb.id");
    expect(sql).toMatch(/csl\.is_active = true/);
  });

  it("only a settlement that is the payable carries the bill (closed or payment started), never an open one", () => {
    expect(sql).toContain("cds.status IN ('locked', 'final', 'approved', 'posted', 'closed')");
    expect(sql).toContain("COALESCE(cds.payment_state, 'unpaid') <> 'unpaid'");
    expect(sql).not.toContain("'open'");
  });

  it("rejects an unsafe alias", () => {
    expect(() => driverApBillCarriedBySettlementSql("b; drop table x")).toThrow();
  });
});

describe("every cash-flow reader of accounting.bills applies it (no reader double-counts settlement pay)", () => {
  const readers = billReaders(service);

  it("finds the 4 readers (daily prediction, 7-day net, actual-vs-projected, rolling ledger)", () => {
    expect(readers.length).toBe(4);
  });

  it.each(readers.map((r, i) => [i, r] as const))("reader %i excludes driver A/P carried by a settlement", (_i, sql) => {
    expect(sql).toContain("driverApBillCarriedBySettlementSql(\"b\")");
  });

  it("PLANT: a reader without the predicate is caught", () => {
    const planted = service.replace(/\n\s*AND NOT \$\{driverApBillCarriedBySettlementSql\("b"\)\}/, "");
    const missing = billReaders(planted).filter((r) => !r.includes("driverApBillCarriedBySettlementSql(\"b\")"));
    expect(missing.length).toBe(1);
  });
});
