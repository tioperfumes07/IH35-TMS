import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// 443.100 — two concurrent bookings in one company deadlocked: mdata.loads' trg_assign_trace_no upserts the company's
// 'LD' row in lib.trace_counters on INSERT, the auto-allocated path takes the 'LOAD' row BEFORE its INSERT, and the
// manual-number path seeded 'LOAD' AFTER its INSERT ('LD' then 'LOAD'). One lock order everywhere: 'LOAD' first.
const src = readFileSync(fileURLToPath(new URL("../book-load.service.ts", import.meta.url)), "utf8");

export function seedPrecedesInsertInSavepoint(code: string): boolean {
  const sp = code.indexOf("SAVEPOINT book_load_insert`");
  const seed = code.indexOf("await seedLoadNumberCounterFromManualEntry(", sp);
  const insert = code.indexOf("INSERT INTO mdata.loads (", sp);
  const release = code.indexOf("RELEASE SAVEPOINT book_load_insert", sp);
  return sp >= 0 && seed > sp && insert > seed && release > insert && code.indexOf("await seedLoadNumberCounterFromManualEntry(", release) < 0;
}

describe("book-load counter lock order (443.100)", () => {
  it("seeds the LOAD counter inside the savepoint, before the load INSERT, and never after it", () => {
    expect(seedPrecedesInsertInSavepoint(src)).toBe(true);
  });
  it("catches the inverted order (seed after the INSERT)", () => {
    const seedCall = "await seedLoadNumberCounterFromManualEntry(client, input.operating_company_id, loadNumber);";
    const inverted = src.replace(seedCall, "").replace("RELEASE SAVEPOINT book_load_insert`);", `RELEASE SAVEPOINT book_load_insert\`);\n${seedCall}`);
    expect(inverted).not.toBe(src);
    expect(seedPrecedesInsertInSavepoint(inverted)).toBe(false);
  });
});
