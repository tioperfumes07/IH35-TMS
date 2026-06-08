import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { confirmInboundWithClient, confirmOutboundWithClient } from "../dual-confirm.service.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const EQUIPMENT = "33333333-3333-4333-8333-333333333333";
const FROM_DRIVER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TO_DRIVER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REQUEST_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OUTBOUND_EVIDENCE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const INBOUND_EVIDENCE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

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

const pendingOutboundRow: Row = {
  uuid: REQUEST_UUID,
  operating_company_id: COMPANY,
  equipment_uuid: EQUIPMENT,
  equipment_kind: "trailer",
  from_driver_uuid: FROM_DRIVER,
  to_driver_uuid: TO_DRIVER,
  initiated_by_user_uuid: USER,
  transfer_location: "Yard A",
  status: "pending_outbound",
  outbound_confirmed_at: null,
  outbound_evidence_uuid: null,
  inbound_confirmed_at: null,
  inbound_evidence_uuid: null,
  created_at: "2026-06-08T02:04:00.000Z",
};

const outboundConfirmedRow: Row = {
  ...pendingOutboundRow,
  status: "outbound_confirmed",
  outbound_confirmed_at: "2026-06-08T02:10:00.000Z",
  outbound_evidence_uuid: OUTBOUND_EVIDENCE,
};

const completedRow: Row = {
  ...outboundConfirmedRow,
  status: "completed",
  inbound_confirmed_at: "2026-06-08T02:20:00.000Z",
  inbound_evidence_uuid: INBOUND_EVIDENCE,
};

describe("equipment transfer dual-confirm service (GAP-37)", () => {
  it("confirmOutbound advances pending_outbound to outbound_confirmed with evidence", async () => {
    const { client, query } = mockClient([
      ["SET LOCAL app.operating_company_id", []],
      ["FROM dispatch.equipment_transfer_requests", [pendingOutboundRow]],
      ["UPDATE dispatch.equipment_transfer_requests", [outboundConfirmedRow]],
      ["audit.append_event", []],
    ]);

    const result = await confirmOutboundWithClient(client, USER, {
      operating_company_id: COMPANY,
      request_uuid: REQUEST_UUID,
      driver_uuid: FROM_DRIVER,
      evidence_uuid: OUTBOUND_EVIDENCE,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.request.status).toBe("outbound_confirmed");
    expect(query.mock.calls.some((c) => c[1]?.[0] === "dispatch.equipment_transfer.outbound_confirmed")).toBe(true);
  });

  it("confirmOutbound rejects wrong driver (authorization gap guard)", async () => {
    const { client } = mockClient([
      ["SET LOCAL app.operating_company_id", []],
      ["FROM dispatch.equipment_transfer_requests", [pendingOutboundRow]],
    ]);

    const result = await confirmOutboundWithClient(client, USER, {
      operating_company_id: COMPANY,
      request_uuid: REQUEST_UUID,
      driver_uuid: TO_DRIVER,
      evidence_uuid: OUTBOUND_EVIDENCE,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("driver_mismatch");
  });

  it("confirmInbound completes transfer, reassigns equipment, and links audit chain", async () => {
    const { client, query } = mockClient([
      ["SET LOCAL app.operating_company_id", []],
      ["FROM dispatch.equipment_transfer_requests", [outboundConfirmedRow]],
      ["UPDATE dispatch.equipment_transfer_requests", [completedRow]],
      ["UPDATE mdata.equipment", []],
      ["audit.append_event", []],
    ]);

    const result = await confirmInboundWithClient(client, USER, {
      operating_company_id: COMPANY,
      request_uuid: REQUEST_UUID,
      driver_uuid: TO_DRIVER,
      evidence_uuid: INBOUND_EVIDENCE,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.request.status).toBe("completed");
      expect(result.data.request.inbound_evidence_uuid).toBe(INBOUND_EVIDENCE);
    }

    const equipmentUpdate = query.mock.calls.find((c) => String(c[0]).includes("UPDATE mdata.equipment"));
    expect(equipmentUpdate).toBeDefined();
    expect(equipmentUpdate?.[1]).toEqual([EQUIPMENT, TO_DRIVER, COMPANY]);

    expect(query.mock.calls.some((c) => c[1]?.[0] === "dispatch.equipment_transfer.inbound_confirmed")).toBe(true);
    expect(query.mock.calls.some((c) => c[1]?.[0] === "dispatch.equipment_transfer.completed")).toBe(true);
  });

  it("confirmInbound rejects wrong driver", async () => {
    const { client } = mockClient([
      ["SET LOCAL app.operating_company_id", []],
      ["FROM dispatch.equipment_transfer_requests", [outboundConfirmedRow]],
    ]);

    const result = await confirmInboundWithClient(client, USER, {
      operating_company_id: COMPANY,
      request_uuid: REQUEST_UUID,
      driver_uuid: FROM_DRIVER,
      evidence_uuid: INBOUND_EVIDENCE,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("driver_mismatch");
  });
});

describe("equipment transfer migration RLS (GAP-37)", () => {
  const migrationsDir = resolve(import.meta.dirname, "../../../../../db/migrations");
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
