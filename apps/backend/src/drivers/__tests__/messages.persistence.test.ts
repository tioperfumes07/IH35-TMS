import { describe, expect, it, vi } from "vitest";
import {
  deliverDriverProfileMessage,
  DriverMessagePersistenceError,
  insertDriverReply,
  requireDriverMessageRow,
} from "../messages.service.js";

const OPCO = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const MESSAGE = "44444444-4444-4444-8444-444444444444";

describe("driver message persistence identity", () => {
  it("requires a canonical create identity", () => {
    expect(() => requireDriverMessageRow([], "create")).toThrow(DriverMessagePersistenceError);
  });

  it("fails a Driver PWA reply when INSERT RETURNING loses its identity", async () => {
    const client = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) };
    await expect(
      insertDriverReply(client, {
        operatingCompanyId: OPCO,
        driverId: DRIVER,
        driverUserId: USER,
        message: "reply",
      }),
    ).rejects.toMatchObject({ operation: "create" });
  });

  it("fails in-app delivery when the exact scoped status write changes no row", async () => {
    const client = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) };
    await expect(
      deliverDriverProfileMessage(client, {
        messageId: MESSAGE,
        operatingCompanyId: OPCO,
        driverId: DRIVER,
        channel: "in_app",
        message: "hello",
        actorUserId: USER,
      }),
    ).rejects.toMatchObject({ operation: "delivery_status" });
  });

  it("returns delivered only after the exact scoped status row is returned", async () => {
    const client = { query: vi.fn(async () => ({ rows: [{ id: MESSAGE }], rowCount: 1 })) };
    await expect(
      deliverDriverProfileMessage(client, {
        messageId: MESSAGE,
        operatingCompanyId: OPCO,
        driverId: DRIVER,
        channel: "in_app",
        message: "hello",
        actorUserId: USER,
      }),
    ).resolves.toEqual({ delivery_status: "delivered", delivery_ref: null });
  });
});
