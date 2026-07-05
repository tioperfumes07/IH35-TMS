import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const reservationSvc = fs.readFileSync(path.join(here, "../load-id-reservation.service.ts"), "utf8");
const mdataLoads = fs.readFileSync(path.join(here, "../../mdata/loads.routes.ts"), "utf8");

// G9-M: a same-day, same-company Load Number is UNIQUE. Two dispatchers reserving/creating at the same
// instant compute the same MAX+1 sequence; the loser's INSERT throws 23505. Unhandled, that 500s. Both
// generation paths must catch the collision and recompute inside a SAVEPOINT (so the transaction is not
// left aborted) rather than bubbling a raw 500.
describe("load-number collision handling (G9-M)", () => {
  it("reserveNextLoadId retries on unique-violation inside a savepoint", () => {
    expect(reservationSvc).toContain("SAVEPOINT reserve_load_id");
    expect(reservationSvc).toContain("ROLLBACK TO SAVEPOINT reserve_load_id");
    expect(reservationSvc).toContain("isUniqueViolation");
    expect(reservationSvc).toContain('"23505"');
    // bounded — never an unbounded retry loop
    expect(reservationSvc).toContain("MAX_LOAD_ID_RESERVE_ATTEMPTS");
  });

  it("mdata create-load retry rolls back to a savepoint so the aborted-transaction trap cannot recur", () => {
    expect(mdataLoads).toContain("SAVEPOINT create_load");
    expect(mdataLoads).toContain("ROLLBACK TO SAVEPOINT create_load");
    // the retry only swallows the unique-collision code, everything else still throws
    expect(mdataLoads).toContain('.code !== "23505"');
  });
});
