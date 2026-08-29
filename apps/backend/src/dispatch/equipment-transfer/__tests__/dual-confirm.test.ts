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
  it("confirmOutbound advances pending_outbound to outbound_confirmed and notifies from_driver", async () => {
    const client = mockClient([
      [
        "FROM dispatch.equipment_transfer_requests",
        [{
          uuid: REQUEST_UUID,
          from_driver_uuid: FROM_DRIVER,
          to_driver_uuid: TO_DRIVER,
          equipment_uuid: EQUIPMENT,
          equipment_kind: "trailer",
          status: "pending_outbound",
        }],
      ],
      ["UPDATE dispatch.equipment_transfer_requests", [{ uuid: REQUEST_UUID }]],
      ["audit.append_event", []],
      ["INSERT INTO outbox.events", []],
      ["to_regclass('pwa.driver_notifications')", [{ ok: true }]],
      ["INSERT INTO pwa.driver_notifications", []],
    ]);

    const result = await confirmOutbound(client, USER, COMPANY, REQUEST_UUID, FROM_DRIVER, OUTBOUND_EVIDENCE);
    expect(result.kind).toBe("ok");
    expect(client.query.mock.calls.some((c) => c[1]?.[0] === "dispatch.equipment_transfer.outbound_confirmed")).toBe(true);
    const outboxCall = client.query.mock.calls.find((c) => String(c[0]).includes("INSERT INTO outbox.events"));
    expect(outboxCall?.[1]?.[0]).toBe("dispatch.equipment_transfer.confirmed");
    const outboxPayload = JSON.parse(String(outboxCall?.[1]?.[1] ?? "{}"));
    expect(outboxPayload.driver_uuid).toBe(FROM_DRIVER);
  });

  it("confirmOutbound rejects wrong driver (authorization gap guard)", async () => {
    const client = mockClient([
      ["FROM dispatch.equipment_transfer_requests", [{ uuid: REQUEST_UUID, from_driver_uuid: FROM_DRIVER, status: "pending_outbound" }]],
    ]);

    const result = await confirmOutbound(client, USER, COMPANY, REQUEST_UUID, TO_DRIVER, OUTBOUND_EVIDENCE);
    expect(result.kind).toBe("driver_mismatch");
  });

  it("confirmInbound completes transfer, reassigns equipment, writes equipment_log, notifies from_driver, and links audit chain", async () => {
    const equipmentLogId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
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
      ["FROM mdata.equipment", [{ id: EQUIPMENT }]],
      ["UPDATE dispatch.equipment_transfer_requests", [{ uuid: REQUEST_UUID }]],
      ["UPDATE mdata.equipment", [{ id: EQUIPMENT }]],
      ["INSERT INTO mdata.equipment_log", [{ id: equipmentLogId }]],
      ["audit.append_event", []],
      ["INSERT INTO outbox.events", []],
      ["to_regclass('pwa.driver_notifications')", [{ ok: true }]],
      ["INSERT INTO pwa.driver_notifications", []],
    ]);

    const result = await confirmInbound(client, USER, COMPANY, REQUEST_UUID, TO_DRIVER, INBOUND_EVIDENCE);
    expect(result.kind).toBe("ok");

    const equipmentUpdate = client.query.mock.calls.find((c) => String(c[0]).includes("UPDATE mdata.equipment"));
    expect(equipmentUpdate?.[1]).toEqual([EQUIPMENT, COMPANY, TO_DRIVER]);
    const logInsert = client.query.mock.calls.find((c) => String(c[0]).includes("INSERT INTO mdata.equipment_log"));
    expect(logInsert).toBeTruthy();
    expect(logInsert?.[1]?.[0]).toBe(EQUIPMENT);
    expect(String(logInsert?.[1]?.[1])).toContain(`from_driver=${FROM_DRIVER}`);
    expect(String(logInsert?.[1]?.[1])).toContain(`to_driver=${TO_DRIVER}`);
    expect(client.query.mock.calls.some((c) => c[1]?.[0] === "dispatch.equipment_transfer.inbound_confirmed")).toBe(true);
    expect(client.query.mock.calls.some((c) => c[1]?.[0] === "dispatch.equipment_transfer.completed")).toBe(true);
    expect(client.query.mock.calls.some((c) => c[1]?.[0] === "mdata.equipment_log.created")).toBe(true);
    const outboxCall = client.query.mock.calls.find((c) => String(c[0]).includes("INSERT INTO outbox.events"));
    expect(outboxCall?.[1]?.[0]).toBe("dispatch.equipment_transfer.confirmed");
    const outboxPayload = JSON.parse(String(outboxCall?.[1]?.[1] ?? "{}"));
    expect(outboxPayload.driver_uuid).toBe(FROM_DRIVER);
  });

  it("confirmInbound rejects a missing or cross-company equipment row before audit/log/notify", async () => {
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
      ["FROM mdata.equipment", []],
    ]);

    const result = await confirmInbound(client, USER, COMPANY, REQUEST_UUID, TO_DRIVER, INBOUND_EVIDENCE);
    expect(result.kind).toBe("equipment_not_found");
    expect(client.query.mock.calls.some((c) => String(c[0]).includes("INSERT INTO mdata.equipment_log"))).toBe(false);
    expect(client.query.mock.calls.some((c) => String(c[0]).includes("audit.append_event"))).toBe(false);
    expect(client.query.mock.calls.some((c) => String(c[0]).includes("INSERT INTO outbox.events"))).toBe(false);
    expect(client.query.mock.calls.some((c) => String(c[0]).includes("UPDATE dispatch.equipment_transfer_requests"))).toBe(false);
  });

  it("confirmInbound throws when the locked equipment reassignment loses its persisted identity", async () => {
    const client = mockClient([
      ["FROM dispatch.equipment_transfer_requests", [{ uuid: REQUEST_UUID, to_driver_uuid: TO_DRIVER, from_driver_uuid: FROM_DRIVER, equipment_uuid: EQUIPMENT, status: "outbound_confirmed", outbound_evidence_uuid: OUTBOUND_EVIDENCE }]],
      ["FROM mdata.equipment", [{ id: EQUIPMENT }]],
      ["UPDATE dispatch.equipment_transfer_requests", [{ uuid: REQUEST_UUID }]],
      ["UPDATE mdata.equipment", []],
    ]);
    await expect(confirmInbound(client, USER, COMPANY, REQUEST_UUID, TO_DRIVER, INBOUND_EVIDENCE)).rejects.toThrow("equipment_reassign_failed");
    expect(client.query.mock.calls.some((c) => String(c[0]).includes("INSERT INTO mdata.equipment_log"))).toBe(false);
    expect(client.query.mock.calls.some((c) => String(c[0]).includes("audit.append_event"))).toBe(false);
  });

  it("confirmInbound rejects an empty equipment-log identity before audit or notification", async () => {
    const client = mockClient([
      ["FROM dispatch.equipment_transfer_requests", [{ uuid: REQUEST_UUID, to_driver_uuid: TO_DRIVER, from_driver_uuid: FROM_DRIVER, equipment_uuid: EQUIPMENT, status: "outbound_confirmed", outbound_evidence_uuid: OUTBOUND_EVIDENCE }]],
      ["FROM mdata.equipment", [{ id: EQUIPMENT }]],
      ["UPDATE dispatch.equipment_transfer_requests", [{ uuid: REQUEST_UUID }]],
      ["UPDATE mdata.equipment", [{ id: EQUIPMENT }]],
      ["INSERT INTO mdata.equipment_log", []],
    ]);
    await expect(confirmInbound(client, USER, COMPANY, REQUEST_UUID, TO_DRIVER, INBOUND_EVIDENCE)).rejects.toThrow("equipment_log_create_failed");
    expect(client.query.mock.calls.some((c) => String(c[0]).includes("audit.append_event"))).toBe(false);
    expect(client.query.mock.calls.some((c) => String(c[0]).includes("INSERT INTO outbox.events"))).toBe(false);
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
