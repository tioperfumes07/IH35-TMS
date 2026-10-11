import { beforeEach, describe, expect, it, vi } from "vitest";

// Lead 443.49: a fence already in the owner's Samsara account is moved IN PLACE (same address id), never re-created.
const updateAddress = vi.fn();
const createAddress = vi.fn();
const getSamsaraConfigForCompany = vi.fn();
const decryptSamsaraSecret = vi.fn();
const appendCrudAudit = vi.fn();

vi.mock("../../../integrations/samsara/samsara-client.js", () => ({
  SamsaraApiError: class SamsaraApiError extends Error {
    constructor(message: string) { super(message); }
  },
  SamsaraClient: class {
    updateAddress = (...args: unknown[]) => updateAddress(...args);
    createAddress = (...args: unknown[]) => createAddress(...args);
  },
}));
vi.mock("../../../integrations/samsara/samsara.service.js", () => ({
  getSamsaraConfigForCompany: (...args: unknown[]) => getSamsaraConfigForCompany(...args),
  rowIsConfigured: (row: unknown) => Boolean(row),
}));
vi.mock("../../../lib/samsara-crypto.js", () => ({ decryptSamsaraSecret: (...args: unknown[]) => decryptSamsaraSecret(...args) }));
vi.mock("../../../audit/crud-audit.js", () => ({ appendCrudAudit: (...args: unknown[]) => appendCrudAudit(...args) }));

const OPCO = "aaaaaaaa-aaaa-aaaa-4aaa-aaaaaaaaaaaa";
const GEOFENCE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const base = { operating_company_id: OPCO, geofence_id: GEOFENCE, samsara_address_id: "2000000762878", latitude: 27.4, longitude: -80.3, label: "Feek Family — 1 Main St, Fort Pierce, FL" };

describe("SamsaraUpdateGeofenceHandler (443.49)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    decryptSamsaraSecret.mockReturnValue("token");
    getSamsaraConfigForCompany.mockResolvedValue({ is_enabled: true, encrypted_api_token: Buffer.from("enc"), api_token: "token", samsara_org_id: "org" });
    updateAddress.mockResolvedValue({ id: "2000000762878" });
  });
  it("updates the SAME Samsara address id with the real point; creates nothing", async () => {
    const { SamsaraUpdateGeofenceHandler } = await import("../samsara-update-geofence.handler.js");
    const r = await new SamsaraUpdateGeofenceHandler().deliver(base, { client: { query: vi.fn() } } as never);
    expect(updateAddress).toHaveBeenCalledWith("2000000762878", expect.objectContaining({ latitude: 27.4, longitude: -80.3 }));
    expect(createAddress).not.toHaveBeenCalled();
    expect(r.message).toBe("samsara_geofence_updated:2000000762878");
    expect(appendCrudAudit).toHaveBeenCalledWith(expect.anything(), expect.any(String), "telematics.samsara.geofence_moved_to_real_address", expect.anything(), "info", "443.49");
  });
  it("scopes the delivery to the event's company BEFORE reading the Samsara config (RLS)", async () => {
    const { SamsaraUpdateGeofenceHandler } = await import("../samsara-update-geofence.handler.js");
    const order: string[] = [];
    const query = vi.fn(async (sql: string) => { order.push(sql.includes("app.operating_company_id") ? "ctx" : "other"); return { rows: [] }; });
    getSamsaraConfigForCompany.mockImplementation(async () => { order.push("config"); return { is_enabled: true, encrypted_api_token: Buffer.from("enc"), api_token: "token", samsara_org_id: "org" }; });
    await new SamsaraUpdateGeofenceHandler().deliver(base, { client: { query } } as never);
    expect(order.indexOf("ctx")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("ctx")).toBeLessThan(order.indexOf("config"));
  });
  it("a missing Samsara id or an unconfigured Samsara throws (retried), never a silent 'delivered'", async () => {
    const { SamsaraUpdateGeofenceHandler } = await import("../samsara-update-geofence.handler.js");
    const h = new SamsaraUpdateGeofenceHandler();
    await expect(h.deliver({ ...base, samsara_address_id: "" }, { client: { query: vi.fn() } } as never)).rejects.toThrow("samsara_address_id_missing");
    getSamsaraConfigForCompany.mockResolvedValue(null);
    await expect(h.deliver(base, { client: { query: vi.fn() } } as never)).rejects.toThrow("samsara_not_configured");
  });
});
