import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), engine: vi.fn(), membership: vi.fn(), auth: vi.fn() }));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: mocks.auth }));
vi.mock("../../auth/db.js", () => ({ withCurrentUser: (_id: string, fn: (c: unknown) => unknown) => fn({ query: mocks.query }) }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: mocks.membership }));
vi.mock("../pm-due-engine.service.js", () => ({ computePmDueEngineForCompany: mocks.engine }));
import { registerPmDueEngineRoutes } from "../pm-due-engine.routes.js";
import { captureRoutes } from "../../../test-helpers/capture-route-handler.js";

const company = "00000000-0000-4000-8000-000000000001";
describe("PM HTTP adapter retains auth and company-scoped canonical reader", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockReturnValue(true);
    mocks.query.mockResolvedValue({ rows: [] });
    mocks.membership.mockResolvedValue(undefined);
    mocks.engine.mockResolvedValue([{ pm_schedule_id: "fixture" }]);
  });
  it("sets company context and returns the existing engine response", async () => {
    const routes = captureRoutes();
    await registerPmDueEngineRoutes(routes.app);
    expect(routes.routes).toHaveLength(1);
    expect(routes.routes[0]).toMatchObject({ method: "get", path: "/api/v1/maintenance/pm-due-engine", options: { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } });
    const result = await routes.handler()({ user: { uuid: "reader" }, query: { operating_company_id: company } }, {});
    expect(mocks.membership).toHaveBeenCalledWith("reader", company);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("set_config('app.operating_company_id'"), [company]);
    expect(mocks.engine).toHaveBeenCalledExactlyOnceWith(expect.anything(), company);
    expect(result).toEqual({ rows: [{ pm_schedule_id: "fixture" }], computed_from: "telematics.unit_stop_events -> telematics.odometer_readings -> ABSENT", never: "fleet_average" });
  });
  it("does not read without authentication", async () => {
    mocks.auth.mockReturnValue(false);
    const routes = captureRoutes();
    await registerPmDueEngineRoutes(routes.app);
    await routes.handler()({ query: { operating_company_id: company } }, {});
    expect(mocks.engine).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("rejects a malformed company UUID before membership or queries", async () => {
    const routes = captureRoutes();
    await registerPmDueEngineRoutes(routes.app);
    const reply = { code: vi.fn(), send: vi.fn() };
    reply.code.mockReturnValue(reply);
    await routes.handler()({ user: { uuid: "reader" }, query: { operating_company_id: "invalid" } }, reply);
    expect(reply.code).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ error: "validation_error" }));
    expect(mocks.membership).not.toHaveBeenCalled();
    expect(mocks.engine).not.toHaveBeenCalled();
  });
  it("does not read after a membership refusal", async () => {
    mocks.membership.mockRejectedValue(new Error("forbidden"));
    const routes = captureRoutes();
    await registerPmDueEngineRoutes(routes.app);
    await expect(routes.handler()({ user: { uuid: "reader" }, query: { operating_company_id: company } }, {})).rejects.toThrow("forbidden");
    expect(mocks.engine).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
