import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cancelTransferWithClient,
  initiateTransferWithClient,
  listPendingForDriverWithClient,
  setTransferCompanyScope,
} from "../request.service.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const EQUIPMENT = "33333333-3333-4333-8333-333333333333";
const FROM_DRIVER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TO_DRIVER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REQUEST_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

type Row = Record<string, unknown>;

function mockClient(handlers: Array<[string | RegExp, Row[]]>) {
  const query = vi.fn(async (sql: string) => {
    for (const [matcher, rows] of handlers) {
      const matched = matcher instanceof RegExp ? matcher.test(sql) : sql.includes(matcher);
      if (matched) return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  });
  return { client: { query }, query };
}

describe("equipment transfer request service (GAP-37)", () => {
  it("initiateTransfer inserts pending_outbound row and audits", async () => {
    const { client, query } = mockClient([
      ["SET LOCAL app.operating_company_id", []],
      ["FROM mdata.drivers", [{ id: FROM_DRIVER }, { id: TO_DRIVER }]],
      ["FROM mdata.equipment", [{ id: EQUIPMENT }]],
      ["FROM dispatch.equipment_transfer_requests", []],
      ["INSERT INTO dispatch.equipment_transfer_requests", [
        {
          uuid: REQUEST_UUID,
          operating_company_id: COMPANY,
          equipment_uuid: EQUIPMENT,
          equipment_kind: "trailer",
          from_driver_uuid: FROM_DRIVER,
          to_driver_uuid: TO_DRIVER,
          status: "pending_outbound",
          created_at: "2026-06-08T02:04:00.000Z",
        },
      ]],
      ["audit.append_event", []],
    ]);

    const result = await initiateTransferWithClient(client, USER, {
      operating_company_id: COMPANY,
      equipment_uuid: EQUIPMENT,
      equipment_kind: "trailer",
      from_driver_uuid: FROM_DRIVER,
      to_driver_uuid: TO_DRIVER,
      transfer_location: "Yard A",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.uuid).toBe(REQUEST_UUID);
    expect(query.mock.calls.some((c) => c[1]?.[0] === "dispatch.equipment_transfer.initiated")).toBe(true);
  });

  it("initiateTransfer rejects when an active transfer already exists", async () => {
    const { client } = mockClient([
      ["SET LOCAL app.operating_company_id", []],
      ["FROM mdata.drivers", [{ id: FROM_DRIVER }, { id: TO_DRIVER }]],
      ["FROM mdata.equipment", [{ id: EQUIPMENT }]],
      ["FROM dispatch.equipment_transfer_requests", [{ uuid: REQUEST_UUID }]],
    ]);

    const result = await initiateTransferWithClient(client, USER, {
      operating_company_id: COMPANY,
      equipment_uuid: EQUIPMENT,
      equipment_kind: "trailer",
      from_driver_uuid: FROM_DRIVER,
      to_driver_uuid: TO_DRIVER,
      transfer_location: "Yard A",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("transfer_already_active");
  });

  it("listPendingForDriver scopes outbound drop confirmations", async () => {
    const { client, query } = mockClient([
      ["SET LOCAL app.operating_company_id", []],
      ["FROM dispatch.equipment_transfer_requests", [
        {
          uuid: REQUEST_UUID,
          operating_company_id: COMPANY,
          equipment_uuid: EQUIPMENT,
          equipment_kind: "trailer",
          from_driver_uuid: FROM_DRIVER,
          to_driver_uuid: TO_DRIVER,
          initiated_by_user_uuid: USER,
          transfer_location: "Yard A",
          status: "pending_outbound",
          created_at: "2026-06-08T02:04:00.000Z",
        },
      ]],
    ]);

    const result = await listPendingForDriverWithClient(client, {
      operating_company_id: COMPANY,
      driver_uuid: FROM_DRIVER,
      direction: "outbound",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.requests).toHaveLength(1);
    const listSql = String(query.mock.calls.find((c) => String(c[0]).includes("from_driver_uuid"))?.[0] ?? "");
    expect(listSql).toContain("from_driver_uuid");
    expect(listSql).toContain("pending_outbound");
  });

  it("cancelTransfer marks active request cancelled", async () => {
    const { client } = mockClient([
      ["SET LOCAL app.operating_company_id", []],
      ["UPDATE dispatch.equipment_transfer_requests", [
        {
          uuid: REQUEST_UUID,
          operating_company_id: COMPANY,
          equipment_uuid: EQUIPMENT,
          equipment_kind: "trailer",
          from_driver_uuid: FROM_DRIVER,
          to_driver_uuid: TO_DRIVER,
          initiated_by_user_uuid: USER,
          transfer_location: "Yard A",
          status: "cancelled",
          created_at: "2026-06-08T02:04:00.000Z",
        },
      ]],
      ["audit.append_event", []],
    ]);

    const result = await cancelTransferWithClient(client, USER, {
      operating_company_id: COMPANY,
      request_uuid: REQUEST_UUID,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.request.status).toBe("cancelled");
  });

  it("setTransferCompanyScope sets app.operating_company_id for RLS", async () => {
    const { client, query } = mockClient([["SET LOCAL app.operating_company_id", []]]);
    await setTransferCompanyScope(client, COMPANY);
    expect(String(query.mock.calls[0]?.[0])).toContain("app.operating_company_id");
    expect(String(query.mock.calls[0]?.[0])).toContain(COMPANY);
  });
});

describe("equipment transfer routes wiring (GAP-37)", () => {
  const routesPath = resolve(import.meta.dirname, "../routes.ts");
  const indexPath = resolve(import.meta.dirname, "../../../index.ts");
  const routes = readFileSync(routesPath, "utf8");
  const index = readFileSync(indexPath, "utf8");

  it("registers all five dual-confirm transfer endpoints under /api/v1", () => {
    expect(routes).toContain("/api/v1/dispatch/equipment-transfers/initiate");
    expect(routes).toContain("/api/v1/dispatch/equipment-transfers/pending");
    expect(routes).toContain("/api/v1/dispatch/equipment-transfers/:uuid/confirm-outbound");
    expect(routes).toContain("/api/v1/dispatch/equipment-transfers/:uuid/confirm-inbound");
    expect(routes).toContain("/api/v1/dispatch/equipment-transfers/:uuid/cancel");
    expect(routes).toContain("registerEquipmentTransferRoutes");
    expect(index).toContain("registerEquipmentTransferRoutes");
  });
});
