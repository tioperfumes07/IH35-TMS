import crypto from "node:crypto";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleEngineFaultEvent,
  parseEngineFaultWebhookPayload,
} from "../fault-handler.service.js";
import { lookupSpnCatalog, shouldAutoCreateWorkOrder } from "../severe-fault-catalog.js";

const { queryMock, withLuciaBypassMock } = vi.hoisted(() => {
  const queryMock = vi.fn().mockResolvedValue({ rows: [] });
  const withLuciaBypassMock = vi.fn(async <T>(fn: (client: { query: typeof queryMock }) => Promise<T>) =>
    fn({ query: queryMock })
  );
  return { queryMock, withLuciaBypassMock };
});

vi.mock("../../../../auth/db.js", () => ({
  withLuciaBypass: withLuciaBypassMock,
}));

vi.mock("../../../../maintenance/work-orders/auto-create-from-fault.js", () => ({
  autoCreateWorkOrderFromEngineFault: vi.fn(async () => "wo-severe-1"),
}));

vi.mock("../../../../notifications/fault-notifications.js", () => ({
  notifyEngineFaultWorkOrder: vi.fn(async () => ({ in_app: 1, email: 0, push: 0, sms: 0 })),
}));

vi.mock("../../samsara.service.js", async () => {
  const actual = await vi.importActual<typeof import("../../samsara.service.js")>("../../samsara.service.js");
  return {
    ...actual,
    resolveSamsaraWebhookSigningSecret: vi.fn(async () => "route-test-secret"),
    extractSamsaraWebhookMeta: actual.extractSamsaraWebhookMeta,
  };
});

import { autoCreateWorkOrderFromEngineFault } from "../../../../maintenance/work-orders/auto-create-from-fault.js";
import { registerSamsaraEngineFaultRoutes } from "../routes.js";

const OC = "00000000-0000-4000-8000-000000000001";
const UNIT = "00000000-0000-4000-8000-000000000010";

function sign(body: Buffer, secret: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function severePayload(eventId = "evt-severe-1") {
  return {
    id: eventId,
    vehicleId: "sam-veh-1",
    spn: 110,
    fmi: 0,
    timestamp: "2026-06-08T12:00:00.000Z",
  };
}

function warnPayload(eventId = "evt-warn-1") {
  return {
    id: eventId,
    vehicleId: "sam-veh-1",
    spn: 639,
    fmi: 1,
    timestamp: "2026-06-08T12:00:00.000Z",
  };
}

describe("severe-fault-catalog", () => {
  it("locks SPN 110 as critical auto-WO", () => {
    const entry = lookupSpnCatalog(110);
    expect(entry?.severity).toBe("critical");
    expect(entry?.autoCreateWo).toBe(true);
    expect(shouldAutoCreateWorkOrder("critical", 110)).toBe(true);
  });

  it("warn SPN 639 does not auto-create WO", () => {
    expect(shouldAutoCreateWorkOrder("warn", 639)).toBe(false);
  });
});

describe("parseEngineFaultWebhookPayload", () => {
  it("parses SPN/FMI and vehicle id", () => {
    const parsed = parseEngineFaultWebhookPayload(severePayload());
    expect(parsed).toMatchObject({
      samsara_event_id: "evt-severe-1",
      vehicle_id: "sam-veh-1",
      spn_code: 110,
      fmi_code: 0,
      severity: "critical",
    });
  });
});

describe("handleEngineFaultEvent", () => {
  afterEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
    vi.mocked(autoCreateWorkOrderFromEngineFault).mockClear();
  });

  it("creates WO for severe fault", async () => {
    const parsed = parseEngineFaultWebhookPayload(severePayload())!;
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ uuid: "event-1" }] })
      .mockResolvedValueOnce({ rows: [{ unit_id: UNIT, unit_number: "101" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ driver_id: null }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await handleEngineFaultEvent({ query: queryMock }, OC, parsed);
    expect(result.action).toBe("auto_wo");
    expect(result.auto_wo_uuid).toBe("wo-severe-1");
    expect(autoCreateWorkOrderFromEngineFault).toHaveBeenCalledOnce();
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT (samsara_event_id) DO NOTHING"), expect.any(Array));
  });

  it("logs warn faults without creating WO", async () => {
    const parsed = parseEngineFaultWebhookPayload(warnPayload())!;
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ uuid: "event-warn" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await handleEngineFaultEvent({ query: queryMock }, OC, parsed);
    expect(result.action).toBe("logged");
    expect(result.auto_wo_uuid).toBeNull();
    expect(autoCreateWorkOrderFromEngineFault).not.toHaveBeenCalled();
  });

  it("is idempotent on duplicate samsara_event_id", async () => {
    const parsed = parseEngineFaultWebhookPayload(severePayload("evt-dup"))!;
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const result = await handleEngineFaultEvent({ query: queryMock }, OC, parsed);
    expect(result.action).toBe("duplicate");
    expect(autoCreateWorkOrderFromEngineFault).not.toHaveBeenCalled();
  });

  it("sets tenant context for RLS", async () => {
    const parsed = parseEngineFaultWebhookPayload(warnPayload("evt-rls"))!;
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ uuid: "event-rls" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await handleEngineFaultEvent({ query: queryMock }, OC, parsed);
    expect(queryMock).toHaveBeenCalledWith(`SELECT set_config('app.operating_company_id', $1, true)`, [OC]);
  });
});

describe("registerSamsaraEngineFaultRoutes", () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValue({ rows: [] });
    withLuciaBypassMock.mockClear();
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  async function buildApp() {
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerSamsaraEngineFaultRoutes(app);
    await app.ready();
    return app;
  }

  it("rejects unsigned webhook", async () => {
    const app = await buildApp();
    const body = Buffer.from(JSON.stringify(severePayload("evt-bad-sig")));
    const res = await app.inject({
      method: "POST",
      url: `/api/integrations/samsara/engine-faults/webhook?operating_company_id=${OC}`,
      headers: { "content-type": "application/json", "x-samsara-signature": "deadbeef" },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });

  it("accepts signed severe webhook", async () => {
    const app = await buildApp();
    const payload = severePayload("evt-signed");
    const body = Buffer.from(JSON.stringify(payload));
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ uuid: "event-signed" }] })
      .mockResolvedValueOnce({ rows: [{ unit_id: UNIT, unit_number: "101" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ driver_id: null }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({
      method: "POST",
      url: `/api/integrations/samsara/engine-faults/webhook?operating_company_id=${OC}`,
      headers: {
        "content-type": "application/json",
        "x-samsara-signature": sign(body, "route-test-secret"),
      },
      payload: body,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, action: "auto_wo", auto_wo_uuid: "wo-severe-1" });
  });
});
