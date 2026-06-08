import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { confirmInbound, confirmOutbound } from "../dual-confirm.service.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const EQUIPMENT = "33333333-3333-4333-8333-333333333333";
const FROM_DRIVER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TO_DRIVER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REQUEST_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OUTBOUND_EVIDENCE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const INBOUND_EVIDENCE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

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

describe("equipment transfer dual-confirm service (GAP-37)", () => {
  it("confirmOutbound advances pending_outbound to outbound_confirmed", async () => {
    const client = mockClient([
      ["FROM dispatch.equipment_transfer_requests", [{ uuid: REQUEST_UUID, from_driver_uuid: FROM_DRIVER, status: "pending_outbound" }]],
      ["UPDATE dispatch.equipment_transfer_requests", [{ uuid: REQUEST_UUID }]],
      ["audit.append_event", []],
    ]);

    const result = await confirmOutbound(client, USER, COMPANY, REQUEST_UUID, FROM_DRIVER, OUTBOUND_EVIDENCE);
    expect(result.kind).toBe("ok");
    expect(client.query.mock.calls.some((c) => c[1]?.[0] === "dispatch.equipment_transfer.outbound_confirmed")).toBe(true);
  });

  it("confirmOutbound rejects wrong driver (authorization gap guard)", async () => {
    const client = mockClient([
      ["FROM dispatch.equipment_transfer_requests", [{ uuid: REQUEST_UUID, from_driver_uuid: FROM_DRIVER, status: "pending_outbound" }]],
    ]);

    const result = await confirmOutbound(client, USER, COMPANY, REQUEST_UUID, TO_DRIVER, OUTBOUND_EVIDENCE);
    expect(result.kind).toBe("driver_mismatch");
  });

  it("confirmInbound completes transfer, reassigns equipment, and links audit chain", async () => {
    const client = mockClient([
      [
        "FROM dispatch.equipment_transfer_requests",
        [{
          uuid: REQUEST_UUID,
          to_driver_uuid: TO_DRIVER,
          from_driver_uuid: FROM_DRIVER,
          equipment_uuid: EQUIPMENT,
          status: "outbound_confirmed",
          outbound_evidence_uuid: OUTBOUND_EVIDENCE,
        }],
      ],
      ["UPDATE dispatch.equipment_transfer_requests", [{ uuid: REQUEST_UUID }]],
      ["UPDATE mdata.equipment", []],
      ["audit.append_event", []],
    ]);

    const result = await confirmInbound(client, USER, COMPANY, REQUEST_UUID, TO_DRIVER, INBOUND_EVIDENCE);
    expect(result.kind).toBe("ok");

    const equipmentUpdate = client.query.mock.calls.find((c) => String(c[0]).includes("UPDATE mdata.equipment"));
    expect(equipmentUpdate?.[1]).toEqual([EQUIPMENT, COMPANY, TO_DRIVER]);
    expect(client.query.mock.calls.some((c) => c[1]?.[0] === "dispatch.equipment_transfer.inbound_confirmed")).toBe(true);
    expect(client.query.mock.calls.some((c) => c[1]?.[0] === "dispatch.equipment_transfer.completed")).toBe(true);
  });

  it("confirmInbound rejects wrong driver", async () => {
    const client = mockClient([
      ["FROM dispatch.equipment_transfer_requests", [{ uuid: REQUEST_UUID, to_driver_uuid: TO_DRIVER, status: "outbound_confirmed" }]],
    ]);

    const result = await confirmInbound(client, USER, COMPANY, REQUEST_UUID, FROM_DRIVER, INBOUND_EVIDENCE);
    expect(result.kind).toBe("driver_mismatch");
  });
});

describe("equipment transfer migration RLS (GAP-37)", () => {
  const migrationsDir = resolve(import.meta.dirname, "../../../../../../db/migrations");
  const migrationFile = readdirSync(migrationsDir).find((f) => f.includes("equipment_transfer_requests"));
  const migration = migrationFile ? readFileSync(resolve(migrationsDir, migrationFile), "utf8") : "";

  it("ships dispatch.equipment_transfer_requests with ih35_app RLS policy", () => {
    expect(migrationFile).toBeTruthy();
    expect(migration).toContain("dispatch.equipment_transfer_requests");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("app.operating_company_id");
    expect(migration).toContain("TO ih35_app");
    expect(migration).toContain("GRANT USAGE ON SCHEMA dispatch TO ih35_app");
  });
});
