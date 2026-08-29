import { membershipAware } from "../../../../test-helpers/membership-aware-query.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));

// --- Runtime harness: exercise the REAL shared qualification gate through reassignDriver. ---
const withCurrentUserMock = vi.fn();

vi.mock("../../../auth/db.js", () => ({
  withCurrentUser: (...args: unknown[]) => withCurrentUserMock(...(args as [unknown, unknown])),
}));

vi.mock("../../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
}));

const OPCO = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const USER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOAD = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";

type QueryLog = string[];

/**
 * DISPATCH-ASSIGNMENTS-QUICKSAVE-COMMIT-ROLLBACK-TEST-FAILURE: `withCurrentUser` is fully mocked
 * above (`vi.mock("../../../auth/db.js", ...)`), which means the real transaction wrapper —
 * `client.query("BEGIN")` / `"COMMIT"` on success / `"ROLLBACK"` on throw (see
 * `apps/backend/src/auth/db.ts`, `withCurrentUser`) — never runs in these tests. Every
 * `mockImplementation` below used to be a bare `(_uid, fn) => fn(client)` passthrough, so no
 * BEGIN/COMMIT/ROLLBACK statement ever reached the query log — while two assertions still expected
 * to find one. This mock restores that fidelity so the mocked transaction boundary matches the real
 * one `reassignDriver`/`reassignUnit`/`reassignTrailer` actually rely on (none of them issue their
 * own BEGIN/COMMIT/ROLLBACK — that responsibility belongs entirely to `withCurrentUser`).
 */
function withTransactionMock<C extends { query: (sql: string, values?: unknown[]) => Promise<unknown> }>(client: C) {
  return async (_uid: string, fn: (c: C) => Promise<unknown>) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }
  };
}

/**
 * Build a fake PoolClient. `credRow` is what the shared qualification gate query returns for the
 * driver (expired CDL / missing medical / hazmat-unqualified, etc.). The gate is NOT mocked — this
 * proves reassignDriver actually delegates to it and blocks.
 */
function makeClient(credRow: Record<string, unknown>, log: QueryLog, isHazmat = false) {
  return {
    query: membershipAware(vi.fn(async (sql: string) => {
      log.push(sql);
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/.test(sql)) return { rows: [] };
      // fetchLoadForUpdate
      if (sql.includes("FROM mdata.loads") && sql.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: LOAD,
              operating_company_id: OPCO,
              assigned_primary_driver_id: null,
              assigned_unit_id: null,
              assigned_secondary_driver_id: null,
              load_number: "L-1",
              is_hazmat: isHazmat,
            },
          ],
        };
      }
      // assertDriverActive (status + HOS) — driver is Active + not in violation, so this passes and
      // the credential gate becomes the decisive check.
      if (sql.includes("views.drivers_with_hos_status")) {
        return { rows: [{ id: DRIVER, status: "Active", is_in_violation: false }] };
      }
      // shared qualification gate query (mdata.drivers + safety.medical_cards + endorsement_h)
      if (sql.includes("safety.medical_cards") && sql.includes("endorsement_h")) {
        return { rows: [{ id: DRIVER, driver_name: "Test Driver", ...credRow }] };
      }
      // Any UPDATE means the block failed to stop the write.
      if (sql.includes("UPDATE mdata.loads")) {
        return { rows: [{ id: LOAD }] };
      }
      if (sql.includes("INSERT INTO dispatch.load_assignment_history")) {
        return { rows: [{ id: "66666666-6666-4666-8666-666666666666" }] };
      }
      return { rows: [] };
    })),
  };
}

const QUALIFIED = {
  is_deactivated: false,
  is_archived: false,
  is_status_inactive: false,
  cdl_missing: false,
  cdl_expired: false,
  cdl_expires_at: "2030-01-01",
  med_missing: false,
  med_expired: false,
  med_expiry_date: "2030-01-01",
  hazmat_blocked: false,
  hazmat_endorsement_expires_at: "2030-01-01",
};

describe("DISP-2 quicksave reassignDriver applies the shared driver-qualification gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("BLOCKS an expired-CDL driver with E_DRIVER_NOT_QUALIFIED and never writes the assignment", async () => {
    const log: QueryLog = [];
    const client = makeClient({ ...QUALIFIED, cdl_expired: true, cdl_expires_at: "2020-01-01" }, log);
    withCurrentUserMock.mockImplementation(withTransactionMock(client));

    const { reassignDriver } = await import("../quicksave.service.js");
    await expect(
      reassignDriver(USER, { operating_company_id: OPCO, load_uuid: LOAD, driver_uuid: DRIVER })
    ).rejects.toMatchObject({ code: "E_DRIVER_NOT_QUALIFIED", block: { reasons: ["cdl_expired"] } });

    expect(log.some((s) => s.includes("UPDATE mdata.loads"))).toBe(false);
    expect(log.some((s) => /^\s*ROLLBACK\s*$/.test(s))).toBe(true);
  });

  it("BLOCKS a missing-medical-card driver", async () => {
    const log: QueryLog = [];
    const client = makeClient({ ...QUALIFIED, med_missing: true, med_expiry_date: null }, log);
    withCurrentUserMock.mockImplementation(withTransactionMock(client));

    const { reassignDriver } = await import("../quicksave.service.js");
    await expect(
      reassignDriver(USER, { operating_company_id: OPCO, load_uuid: LOAD, driver_uuid: DRIVER })
    ).rejects.toMatchObject({ code: "E_DRIVER_NOT_QUALIFIED", block: { reasons: ["medical_card_missing"] } });
    expect(log.some((s) => s.includes("UPDATE mdata.loads"))).toBe(false);
  });

  it("BLOCKS a hazmat-unqualified driver on a hazmat load", async () => {
    const log: QueryLog = [];
    const client = makeClient({ ...QUALIFIED, hazmat_blocked: true, hazmat_endorsement_expires_at: null }, log, true);
    withCurrentUserMock.mockImplementation(withTransactionMock(client));

    const { reassignDriver } = await import("../quicksave.service.js");
    await expect(
      reassignDriver(USER, { operating_company_id: OPCO, load_uuid: LOAD, driver_uuid: DRIVER })
    ).rejects.toMatchObject({ code: "E_DRIVER_NOT_QUALIFIED", block: { reasons: ["hazmat_endorsement_missing"] } });
    expect(log.some((s) => s.includes("UPDATE mdata.loads"))).toBe(false);
  });

  it("ALLOWS a fully-qualified driver (writes the assignment + commits)", async () => {
    const log: QueryLog = [];
    const client = makeClient({ ...QUALIFIED }, log);
    withCurrentUserMock.mockImplementation(withTransactionMock(client));

    const { reassignDriver } = await import("../quicksave.service.js");
    const result = await reassignDriver(USER, { operating_company_id: OPCO, load_uuid: LOAD, driver_uuid: DRIVER });
    expect(result).toMatchObject({ load_id: LOAD, assigned_primary_driver_id: DRIVER });
    expect(log.some((s) => s.includes("UPDATE mdata.loads"))).toBe(true);
    expect(log.some((s) => /^\s*COMMIT\s*$/.test(s))).toBe(true);
  });
});

const CO_DRIVER = "33333333-3333-4333-8333-333333333333";
const UNIT = "44444444-4444-4444-8444-444444444444";
const CANONICAL_TRAILER = "55555555-5555-4555-8555-555555555555";

describe("DISP-F6157: quicksave must never write the co-driver uuid into a *_trailer_id history field", () => {
  beforeEach(() => vi.clearAllMocks());

  /** A load with a co-driver assigned (assigned_secondary_driver_id set) AND prior trailer history. */
  function makeClientWithCoDriverAndTrailer(log: QueryLog) {
    const insertedValues: unknown[][] = [];
    return {
      insertedValues,
      client: {
        query: membershipAware(vi.fn(async (sql: string, values?: unknown[]) => {
          log.push(sql);
          if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
          if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/.test(sql)) return { rows: [] };
          if (sql.includes("FROM mdata.loads") && sql.includes("FOR UPDATE")) {
            return {
              rows: [
                {
                  id: LOAD,
                  operating_company_id: OPCO,
                  assigned_primary_driver_id: DRIVER,
                  assigned_unit_id: UNIT,
                  assigned_secondary_driver_id: CO_DRIVER,
                  load_number: "L-1",
                  is_hazmat: false,
                },
              ],
            };
          }
          // resolveCanonicalTrailerId
          if (sql.includes("FROM dispatch.load_assignment_history") && sql.includes("new_trailer_id")) {
            return { rows: [{ new_trailer_id: CANONICAL_TRAILER }] };
          }
          if (sql.includes("FROM mdata.units u")) {
            return { rows: [{ id: UNIT, is_dispatch_blocked: false, dispatch_block_reason: null, is_oos: false, display_id: "T1" }] };
          }
          if (sql.includes("UPDATE mdata.loads")) return { rows: [{ id: LOAD }] };
          if (sql.includes("INSERT INTO dispatch.load_assignment_history")) {
            insertedValues.push(values ?? []);
            return { rows: [{ id: "66666666-6666-4666-8666-666666666666" }] };
          }
          return { rows: [] };
        })),
      },
    };
  }

  it("reassignUnit: carries the canonical trailer through unchanged, never the co-driver uuid", async () => {
    const log: QueryLog = [];
    const { client, insertedValues } = makeClientWithCoDriverAndTrailer(log);
    withCurrentUserMock.mockImplementation(withTransactionMock(client));

    const { reassignUnit } = await import("../quicksave.service.js");
    await reassignUnit(USER, { operating_company_id: OPCO, load_uuid: LOAD, unit_uuid: UNIT });

    expect(insertedValues).toHaveLength(1);
    const [previousTrailerId, newTrailerId] = insertedValues[0].slice(7, 9);
    expect(previousTrailerId).toBe(CANONICAL_TRAILER);
    expect(newTrailerId).toBe(CANONICAL_TRAILER);
    expect(previousTrailerId).not.toBe(CO_DRIVER);
    expect(newTrailerId).not.toBe(CO_DRIVER);
  });
});

describe("GAP-8 assignments quicksave", () => {
  it("service exports reassign helpers with audit prior/new values", () => {
    const src = fs.readFileSync(path.join(here, "../quicksave.service.ts"), "utf8");
    expect(src).toContain("reassignUnit");
    expect(src).toContain("reassignTrailer");
    expect(src).toContain("reassignDriver");
    expect(src).toContain("prior_value");
    expect(src).toContain("new_value");
    expect(src).toContain("E_VALIDATION_DRIVER_INACTIVE");
    expect(src).toContain("E_VALIDATION_UNIT_UNAVAILABLE");
    expect(src).toContain("E_UNIT_OOS");
    expect(src).toContain("is_oos");
    // DISP-2: reassignDriver must delegate to the shared DOT credential gate.
    expect(src).toContain("assertDriverQualifiedForLoad");
    expect(src).toContain("DriverNotQualifiedError");
  });

  it("routes register PATCH assign endpoints and map the qualification 422", () => {
    const src = fs.readFileSync(path.join(here, "../quicksave.routes.ts"), "utf8");
    expect(src).toContain("/api/v1/dispatch/loads/:uuid/assign-unit");
    expect(src).toContain("/api/v1/dispatch/loads/:uuid/assign-trailer");
    expect(src).toContain("/api/v1/dispatch/loads/:uuid/assign-driver");
    expect(src).toContain("registerDispatchAssignmentsQuicksaveRoutes");
    expect(src).toContain("DriverNotQualifiedError");
  });
});
