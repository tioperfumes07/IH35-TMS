import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cancelTransfer,
  initiateTransfer,
  listPendingForDriver,
  setTransferCompanyScope,
} from "../request.service.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const EQUIPMENT = "33333333-3333-4333-8333-333333333333";
const FROM_DRIVER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TO_DRIVER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REQUEST_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function mockClient(handlers: Array<[string | RegExp, Record<string, unknown>[]]>) {
  const query = vi.fn(async (sql: string) => {
    for (const [matcher, rows] of handlers) {
      const matched = matcher instanceof RegExp ? matcher.test(sql) : sql.includes(matcher);
      if (matched) return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  });
  return { query };
}

describe("equipment transfer request service (GAP-37)", () => {
  it("initiateTransfer inserts pending_outbound row and audits", async () => {
    const client = mockClient([
      ["FROM mdata.drivers", [{ id: FROM_DRIVER }, { id: TO_DRIVER }]],
      ["FROM mdata.equipment", [{ id: EQUIPMENT }]],
      ["FROM dispatch.equipment_transfer_requests", []],
      ["INSERT INTO dispatch.equipment_transfer_requests", [{ uuid: REQUEST_UUID }]],
      ["audit.append_event", []],
    ]);

    const uuid = await initiateTransfer(client, USER, {
      operating_company_id: COMPANY,
      equipment_uuid: EQUIPMENT,
      equipment_kind: "trailer",
      from_driver_uuid: FROM_DRIVER,
      to_driver_uuid: TO_DRIVER,
      transfer_location: "Yard A",
    });

    expect(uuid).toBe(REQUEST_UUID);
    expect(client.query.mock.calls.some((c) => c[1]?.[0] === "dispatch.equipment_transfer.initiated")).toBe(true);
  });

  it("initiateTransfer rejects duplicate active transfer", async () => {
    const client = mockClient([
      ["FROM mdata.drivers", [{ id: FROM_DRIVER }, { id: TO_DRIVER }]],
      ["FROM mdata.equipment", [{ id: EQUIPMENT }]],
      ["FROM dispatch.equipment_transfer_requests", [{ uuid: REQUEST_UUID }]],
    ]);

    await expect(
      initiateTransfer(client, USER, {
        operating_company_id: COMPANY,
        equipment_uuid: EQUIPMENT,
        equipment_kind: "trailer",
        from_driver_uuid: FROM_DRIVER,
        to_driver_uuid: TO_DRIVER,
        transfer_location: "Yard A",
      })
    ).rejects.toThrow("transfer_already_active");
  });

  it("listPendingForDriver scopes outbound drop confirmations", async () => {
    const client = mockClient([
      ["FROM dispatch.equipment_transfer_requests", [{ uuid: REQUEST_UUID, status: "pending_outbound" }]],
    ]);

    const rows = await listPendingForDriver(client, COMPANY, FROM_DRIVER, "outbound");
    expect(rows).toHaveLength(1);
    expect(String(client.query.mock.calls[0]?.[0])).toContain("from_driver_uuid");
    expect(client.query.mock.calls[0]?.[1]?.[2]).toBe("pending_outbound");
  });

  it("cancelTransfer marks active request cancelled", async () => {
    const client = mockClient([
      ["UPDATE dispatch.equipment_transfer_requests", [{ uuid: REQUEST_UUID }]],
      ["audit.append_event", []],
    ]);

    const ok = await cancelTransfer(client, USER, COMPANY, REQUEST_UUID);
    expect(ok).toBe(true);
  });

  it("setTransferCompanyScope sets app.operating_company_id for RLS", async () => {
    const client = mockClient([["SET LOCAL app.operating_company_id", []]]);
    await setTransferCompanyScope(client, COMPANY);
    expect(String(client.query.mock.calls[0]?.[0])).toContain("app.operating_company_id");
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
