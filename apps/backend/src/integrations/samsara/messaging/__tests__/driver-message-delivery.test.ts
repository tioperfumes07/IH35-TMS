import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverChatMessageToSamsara } from "../driver-message-delivery.service.js";

function db(sids: string[][], prior = false) {
  const writes: unknown[][] = [];
  return {
    writes,
    query: async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM chat.messages m JOIN chat.threads")) return { rows: [{ thread_id: "t1", oc: "c1", load_id: "l1", sender_party_type: "office", msg_type: "text", body: "Call dispatch" }] };
      if (sql.includes("payload->>'outcome' = 'sent'")) return { rows: prior ? [{ x: 1 }] : [] };
      if (sql.includes("FROM chat.participants p")) return { rows: sids.map((s, i) => ({ driver_id: `d${i}`, sids: s })) };
      if (sql.includes("INSERT INTO integrations.integration_sync_log")) { writes.push(values ?? []); return { rows: [] }; }
      return { rows: [] };
    },
  };
}

describe("ROUND 306 E-30 — chat message -> driver's Samsara app", () => {
  afterEach(() => { delete process.env.SAMSARA_DRIVER_MESSAGING_ENABLED; });

  it("does nothing while the flag is off", async () => {
    const send = vi.fn();
    const r = await deliverChatMessageToSamsara(db([["55066742"]]) as never, "m1", { sendDriverMessage: send });
    expect(r.outcome).toBe("disabled");
    expect(send).not.toHaveBeenCalled();
  });

  it("sends to every canonical Samsara account of each driver, skips unlinked drivers, records the delivery with the load", async () => {
    process.env.SAMSARA_DRIVER_MESSAGING_ENABLED = "true";
    const send = vi.fn().mockResolvedValue({ status: 200 });
    const d = db([["55066742"], ["1", "2"], []]);
    const r = await deliverChatMessageToSamsara(d as never, "m1", { sendDriverMessage: send });
    expect(r.outcome).toBe("sent");
    expect(send).toHaveBeenCalledWith(["55066742", "1", "2"], "Call dispatch");
    expect(r.per_driver.map((x) => x.reason)).toEqual([null, null, "driver_not_linked_to_samsara"]);
    expect(JSON.parse(String(d.writes[0]?.[5]))).toMatchObject({ message_id: "m1", load_id: "l1", outcome: "sent" });
  });

  it("never re-sends a delivered message", async () => {
    process.env.SAMSARA_DRIVER_MESSAGING_ENABLED = "true";
    const send = vi.fn();
    const r = await deliverChatMessageToSamsara(db([["55066742"]], true) as never, "m1", { sendDriverMessage: send });
    expect(r.outcome).toBe("already_delivered");
    expect(send).not.toHaveBeenCalled();
  });
});
