import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// DRIVER-1 regression guard.
//
// The maintenance quick-add surface (POST /api/v1/maintenance/drivers) used to INSERT directly into
// mdata.drivers, bypassing the canonical driver-create guards (returning-driver detection, rehire-chain
// matching, identity-user conflict handling, CDL-conflict handling, richer create audit). It now delegates
// to the single canonical create path (createDriverCanonical in mdata/drivers.routes.ts). These static
// assertions keep it from silently forking back into a second, un-guarded INSERT path.
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "../drivers.routes.ts"), "utf8");

// Isolate ONLY the single-create POST handler. The CSV bulk-import route
// (POST /api/v1/maintenance/drivers/import) legitimately INSERTs rows and is out of scope for this guard,
// so we bound the slice at the next route registration.
function postCreateHandlerSource(): string {
  const start = source.indexOf('app.post("/api/v1/maintenance/drivers"');
  expect(start).toBeGreaterThanOrEqual(0);
  const after = source.slice(start + 1);
  const nextRoute = after.indexOf("app.patch(\"/api/v1/maintenance/drivers/:id\"");
  expect(nextRoute).toBeGreaterThanOrEqual(0);
  return after.slice(0, nextRoute);
}

describe("maintenance driver-create canonical delegation (DRIVER-1)", () => {
  it("imports the canonical create function", () => {
    expect(source).toContain('import { createDriverCanonical } from "../mdata/drivers.routes.js"');
  });

  it("the single-create POST delegates to createDriverCanonical", () => {
    const handler = postCreateHandlerSource();
    expect(handler).toContain("createDriverCanonical(");
  });

  it("the single-create POST does NOT INSERT into mdata.drivers directly (no bypass path)", () => {
    const handler = postCreateHandlerSource();
    expect(handler).not.toMatch(/INSERT\s+INTO\s+mdata\.drivers/i);
  });
});
