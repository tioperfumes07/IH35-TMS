import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const reservationSvc = fs.readFileSync(path.join(here, "../load-id-reservation.service.ts"), "utf8");
const mdataLoads = fs.readFileSync(path.join(here, "../../mdata/loads.routes.ts"), "utf8");
const bookLoadSvc = fs.readFileSync(path.join(here, "../book-load.service.ts"), "utf8");

// GO-10 REV-B (F1-F4) — replaces the old G9-M retry-loop guard. The old design's own retry loop
// WAS the defect: two independent regex-parsed `MAX(...) FROM ... WHERE load_number LIKE ...`
// mints (this file's own `L-YYYYMMDD-NNNN` vs mdata/loads.routes.ts's own
// `L<COMPANY-TOKEN>-YYYYMMDD-NNNN`) could never see each other's rows, so both files independently
// retried past a MAX()+1 race that a real atomic counter never has in the first place. This guard
// asserts the new invariants instead of the old symptom-patch.
describe("Load Number allocation (GO-10 REV-B)", () => {
  it("kills the last-4-digits regex mint in both files -- F1", () => {
    // A last-4-digits substring silently truncates a real number ("13561" -> "3561"). Neither file
    // may parse a load_number this way ever again.
    expect(reservationSvc).not.toContain("substring(load_number FROM '([0-9]{4})$')");
    expect(reservationSvc).not.toContain("substring(reserved_load_number FROM '([0-9]{4})$')");
    expect(mdataLoads).not.toContain("substring(load_number FROM '([0-9]{4})$')");
    // and it must not have been "fixed" by only widening the digit count -- the whole
    // last-N-digits substring pattern is banned, not just the {4} width.
    expect(reservationSvc).not.toMatch(/substring\([a-z_]+ FROM '\(\[0-9\]\{\d+\}\)\$'\)/);
    expect(mdataLoads).not.toMatch(/substring\([a-z_]+ FROM '\(\[0-9\]\{\d+\}\)\$'\)/);
  });

  it("both files mint through the ONE shared allocator -- F2", () => {
    expect(reservationSvc).toContain("export async function allocateNextLoadNumber");
    expect(mdataLoads).toContain("allocateNextLoadNumber");
    // the old divergent per-file prefix formats are gone
    expect(reservationSvc).not.toContain("L-${ymd}-${seq}");
    expect(mdataLoads).not.toContain("toCompanyLoadToken");
    expect(mdataLoads).not.toContain("L${token}-${datePart}-");
  });

  it("kills the live MAX()+1 mint and the bounded retry-attempts constant -- F3", () => {
    expect(reservationSvc).not.toMatch(/COALESCE\(MAX\(/);
    expect(mdataLoads).not.toMatch(/COALESCE\(MAX\(/);
    expect(reservationSvc).not.toContain("MAX_LOAD_ID_RESERVE_ATTEMPTS");
    expect(mdataLoads).not.toContain("MAX_LOAD_ID_RESERVE_ATTEMPTS");
    // the allocator is atomic (lib.next_trace_no), not a live re-read of MAX(...)
    expect(reservationSvc).toContain("lib.next_trace_no");
  });

  it("seeds from a full-string numeric parse, never a hardcoded constant, and refuses to guess on an empty numeric set -- SEED lock", () => {
    expect(reservationSvc).toContain("load_number ~ '^[0-9]+$'");
    expect(reservationSvc).toContain("MAX(load_number::bigint)");
    expect(reservationSvc).toContain("FirstLoadNumberRequiredError");
    expect(reservationSvc).toContain("first_load_number_required");
  });

  it("mints plain digits only -- no date prefix, no company-token prefix, do not widen to 5 -- L3", () => {
    expect(reservationSvc).not.toMatch(/`L-\$\{[a-zA-Z]+\}-/);
    expect(reservationSvc).not.toContain("padStart(4");
    expect(reservationSvc).not.toContain("padStart(5");
  });

  it("catches 23505 AT INSERT on reserve-id, POST /api/v1/mdata/loads, and Book Load -- F4", () => {
    expect(reservationSvc).toContain("SAVEPOINT reserve_load_id");
    expect(reservationSvc).toContain("ROLLBACK TO SAVEPOINT reserve_load_id");
    expect(reservationSvc).toContain("LoadNumberConflictError");

    expect(mdataLoads).toContain("SAVEPOINT create_load");
    expect(mdataLoads).toContain("ROLLBACK TO SAVEPOINT create_load");
    expect(mdataLoads).toContain('.code !== "23505"');
    expect(mdataLoads).toContain("LoadNumberConflictError");

    expect(bookLoadSvc).toContain("SAVEPOINT book_load_insert");
    expect(bookLoadSvc).toContain("ROLLBACK TO SAVEPOINT book_load_insert");
    expect(bookLoadSvc).toContain('.code !== "23505"');
  });

  it("Book Load uses a typed load_number without minting when the company has no seed -- first_load_number_required", () => {
    expect(bookLoadSvc).toContain("if (!loadNumber && requestedLoadNumber)");
    expect(bookLoadSvc).toContain("FirstLoadNumberRequiredError");
  });

  it("the 409 body is structured { error, load_number, existing_id }, not a bare string -- F4", () => {
    expect(reservationSvc).toContain("existingId");
    expect(mdataLoads).toContain("existing_id");
    expect(bookLoadSvc).toContain("existing_id");
  });
});
