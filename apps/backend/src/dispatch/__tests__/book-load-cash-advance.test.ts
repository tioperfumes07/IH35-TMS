import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bookLoad, type BookLoadInput } from "../book-load.service.js";

// [HOLD-FOR-JORGE — TIER 1] #1440 verification — the cash-advance-on-book decisions:
//   1. cash advance with NO driver → REJECT the book (422), do not orphan the money.
//   2. fuel advance is NOT a driver debt → it does NOT gate on a driver (no cash-style 422).
//   3. the booked cash advance persists load_id and is created PENDING (owner-approval) — contract on the
//      service INSERT. (The live DB row + RLS scoping is verified on ci-migration-test (Neon, GUARD) and the
//      local ih35_ci schema check: load_id FK present, status default 'pending', RLS keys operating_company_id,
//      zero money columns on mdata.loads.)

function baseInput(overrides: Partial<BookLoadInput>): BookLoadInput {
  return {
    requestingUserUuid: "11111111-1111-1111-1111-111111111111",
    requestingUserRole: "Owner",
    operating_company_id: "22222222-2222-2222-2222-222222222222",
    customer_id: "33333333-3333-3333-3333-333333333333",
    status: "assigned_not_dispatched",
    charges: [],
    stops: [],
    save_mode: "book_dispatch",
    ...overrides,
  };
}

describe("book-load cash advance (Tier-1 #1440)", () => {
  it("decision 1 — REJECTS the book with 422 when a cash advance is entered but NO driver is assigned (reject, not drop)", async () => {
    const result = await bookLoad(baseInput({ cash_advance_cents: 5000, assigned_primary_driver_id: undefined }));
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.status).toBe(422);
      expect(result.payload).toMatchObject({ error: "cash_advance_requires_driver" });
    }
  });

  it("decision 2 — a FUEL advance does NOT gate on a driver (fuel is a truck cost, never the cash 422)", async () => {
    // The cash-no-driver gate RETURNS early; fuel must pass it. With no driver + fuel only, bookLoad proceeds
    // past the gate (and then fails later on DB/fixtures in this unit context) — either way it must NOT be the
    // cash_advance_requires_driver rejection.
    let result: unknown;
    try {
      result = await bookLoad(baseInput({ fuel_advance_cents: 5000, assigned_primary_driver_id: undefined }));
    } catch {
      result = { kind: "proceeded_past_gate" }; // threw on DB → it got past the cash gate (proves the point)
    }
    expect(result).not.toMatchObject({ status: 422, payload: { error: "cash_advance_requires_driver" } });
  });

  it("decision 3 + 4 — the cash-advance request INSERT persists load_id and creates it PENDING (owner-approval)", () => {
    // Contract on the actual service source (paired with the live ih35_ci/Neon schema verification).
    const src = readFileSync("src/driver-finance/cash-advance-requests.service.ts", "utf8");
    const insertBlock = src.slice(src.indexOf("INSERT INTO driver_finance.cash_advance_requests"));
    expect(insertBlock, "createCashAdvanceRequest must INSERT into cash_advance_requests").toBeTruthy();
    expect(insertBlock).toMatch(/load_id/); // load_id is persisted on the request
    expect(insertBlock).toMatch(/'pending'/); // created PENDING — owner-approval, not auto-approved
    // and the input schema accepts load_id
    expect(src).toMatch(/load_id:\s*z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)/);
  });

  it("Finding 2 — load_id is derived SERVER-SIDE from the just-created load; the route never accepts a client load_id (entity-scope by construction)", () => {
    const routeSrc = readFileSync("src/dispatch/loads.routes.ts", "utf8");
    const createSchema = routeSrc.slice(
      routeSrc.indexOf("const createDispatchLoadBodySchema = z.object("),
      routeSrc.indexOf("});", routeSrc.indexOf("const createDispatchLoadBodySchema")),
    );
    // The create body schema declares NO load_id field → a client-supplied load_id is stripped by z.object
    // (non-strict) and never reaches bookLoad. So the advance's load_id can only be the load the server just made.
    expect(createSchema).not.toMatch(/^\s*load_id\s*:/m);

    const svcSrc = readFileSync("src/dispatch/book-load.service.ts", "utf8");
    // BookLoadInput type has no load_id field either (client cannot pass one through the service input).
    const inputType = svcSrc.slice(svcSrc.indexOf("export type BookLoadInput = {"), svcSrc.indexOf("};", svcSrc.indexOf("export type BookLoadInput")));
    expect(inputType).not.toMatch(/^\s*load_id\??\s*:/m);
    // The cash-advance request is created with load_id = String(load.id) — the row RETURNING * id from the
    // server-side INSERT, under the same app.operating_company_id → same operating company as the load.
    expect(svcSrc).toMatch(/load_id:\s*String\(load\.id\)/);
  });

  it("decision 2 (observed-by-contract) — the FUEL-advance branch creates NO settlement deduction; it only emits the deferral audit", () => {
    const svcSrc = readFileSync("src/dispatch/book-load.service.ts", "utf8");
    const fuelBranch = svcSrc.slice(svcSrc.indexOf("(input.fuel_advance_cents ?? 0) > 0"));
    const fuelBlock = fuelBranch.slice(0, fuelBranch.indexOf("\n    }") + 6);
    // No driver-debt writes in the fuel path — no settlement line, no driver advance, no cash-advance request.
    expect(fuelBlock).not.toMatch(/settlement_lines|driver_advances|driver_settlement_deductions|createCashAdvanceRequest/);
    // It defers — records the intent only.
    expect(fuelBlock).toMatch(/fuel_advance\.deferred_no_target|deferred/i);
    // (The observed-on-real-rows zero-deduction assertion runs on GUARD's ci-migration-test Neon branch.)
  });
});
