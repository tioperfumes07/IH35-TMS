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
 * Build a fake PoolClient. `credRow` is what the shared qualification gate query returns for the
 * driver (expired CDL / missing medical / hazmat-unqualified, etc.). The gate is NOT mocked — this
 * proves reassignDriver actually delegates to it and blocks.
 */
function makeClient(credRow: Record<string, unknown>, log: QueryLog, isHazmat = false) {
  return {
    query: vi.fn(async (sql: string) => {
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
      return { rows: [] };
    }),
  };
}

const QUALIFIED = {
  is_deactivated: false,
  is_archived: false,
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
    withCurrentUserMock.mockImplementation(async (_uid: string, fn: (c: typeof client) => Promise<unknown>) => fn(client));

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
    withCurrentUserMock.mockImplementation(async (_uid: string, fn: (c: typeof client) => Promise<unknown>) => fn(client));

    const { reassignDriver } = await import("../quicksave.service.js");
    await expect(
      reassignDriver(USER, { operating_company_id: OPCO, load_uuid: LOAD, driver_uuid: DRIVER })
    ).rejects.toMatchObject({ code: "E_DRIVER_NOT_QUALIFIED", block: { reasons: ["medical_card_missing"] } });
    expect(log.some((s) => s.includes("UPDATE mdata.loads"))).toBe(false);
  });

  it("BLOCKS a hazmat-unqualified driver on a hazmat load", async () => {
    const log: QueryLog = [];
    const client = makeClient({ ...QUALIFIED, hazmat_blocked: true, hazmat_endorsement_expires_at: null }, log, true);
    withCurrentUserMock.mockImplementation(async (_uid: string, fn: (c: typeof client) => Promise<unknown>) => fn(client));

    const { reassignDriver } = await import("../quicksave.service.js");
    await expect(
      reassignDriver(USER, { operating_company_id: OPCO, load_uuid: LOAD, driver_uuid: DRIVER })
    ).rejects.toMatchObject({ code: "E_DRIVER_NOT_QUALIFIED", block: { reasons: ["hazmat_endorsement_missing"] } });
    expect(log.some((s) => s.includes("UPDATE mdata.loads"))).toBe(false);
  });

  it("ALLOWS a fully-qualified driver (writes the assignment + commits)", async () => {
    const log: QueryLog = [];
    const client = makeClient({ ...QUALIFIED }, log);
    withCurrentUserMock.mockImplementation(async (_uid: string, fn: (c: typeof client) => Promise<unknown>) => fn(client));

    const { reassignDriver } = await import("../quicksave.service.js");
    const result = await reassignDriver(USER, { operating_company_id: OPCO, load_uuid: LOAD, driver_uuid: DRIVER });
    expect(result).toMatchObject({ load_id: LOAD, assigned_primary_driver_id: DRIVER });
    expect(log.some((s) => s.includes("UPDATE mdata.loads"))).toBe(true);
    expect(log.some((s) => /^\s*COMMIT\s*$/.test(s))).toBe(true);
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
