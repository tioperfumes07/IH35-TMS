import { describe, expect, it, vi } from "vitest";
import {
  createLoudAlertController,
  pickActiveConfirmationAlert,
  pickPendingThread,
  type ActiveAlert,
} from "../../notifications/loud-alert-controller";
import type { DriverChatMessage, DriverChatThread } from "../../api/chat";

function msg(over: Partial<DriverChatMessage>): DriverChatMessage {
  return {
    id: over.id ?? "m1",
    thread_id: over.thread_id ?? "t1",
    seq: over.seq ?? 1,
    sender_party_type: over.sender_party_type ?? "office",
    msg_type: over.msg_type ?? "confirmation_request",
    body: over.body ?? "Confirm pickup",
    status: over.status ?? "active",
    server_ts: over.server_ts ?? "2026-07-02T12:00:00Z",
    acked_at: over.acked_at ?? null,
  };
}

function thread(over: Partial<DriverChatThread>): DriverChatThread {
  return {
    id: over.id ?? "t1",
    kind: over.kind ?? "load",
    load_id: over.load_id ?? "l1",
    load_ref_cache: over.load_ref_cache ?? "L-100",
    subject: over.subject ?? null,
    status: over.status ?? "open",
    last_seq: over.last_seq ?? 1,
    updated_at: over.updated_at ?? "2026-07-02T12:00:00Z",
    has_pending_confirmation: over.has_pending_confirmation,
    has_unacknowledged_confirmation: over.has_unacknowledged_confirmation,
  };
}

const alert: ActiveAlert = { threadId: "t1", message: msg({ id: "c1" }) };

describe("NOTIF-A LoudAlertOverlay dismissal invariant (controller)", () => {
  it("the takeover CANNOT be dismissed without acknowledge — no other exit exists", async () => {
    const ack = vi.fn().mockResolvedValue(undefined);
    const c = createLoudAlertController(ack);

    c.present(alert);
    expect(c.isVisible()).toBe(true);

    // The controller exposes no dismiss/close/hide/snooze — acknowledge is the ONLY mutator that clears it.
    const keys = Object.keys(c);
    for (const forbidden of ["dismiss", "close", "hide", "snooze", "cancel"]) {
      expect(keys).not.toContain(forbidden);
    }

    // Still visible until acknowledge resolves.
    expect(c.isVisible()).toBe(true);
    await c.acknowledge();
    expect(ack).toHaveBeenCalledTimes(1);
    expect(c.isVisible()).toBe(false);
  });

  it("acknowledge is a no-op when nothing is showing", async () => {
    const ack = vi.fn().mockResolvedValue(undefined);
    const c = createLoudAlertController(ack);
    await c.acknowledge();
    expect(ack).not.toHaveBeenCalled();
  });

  it("present is idempotent for the same message", () => {
    const c = createLoudAlertController(vi.fn().mockResolvedValue(undefined));
    c.present(alert);
    c.present({ threadId: "t1", message: msg({ id: "c1", body: "changed" }) });
    expect(c.getActive()?.message.body).toBe("Confirm pickup");
  });
});

describe("NOTIF-A confirmation selection", () => {
  it("picks the newest active unacked confirmation_request", () => {
    const messages = [
      msg({ id: "old", seq: 1 }),
      msg({ id: "new", seq: 5 }),
      msg({ id: "text", seq: 6, msg_type: "text" }),
    ];
    const picked = pickActiveConfirmationAlert("t1", messages, new Set());
    expect(picked?.message.id).toBe("new");
  });

  it("skips acked and already-handled confirmations", () => {
    const messages = [
      msg({ id: "acked", seq: 4, acked_at: "2026-07-02T12:05:00Z" }),
      msg({ id: "handled", seq: 3 }),
    ];
    const picked = pickActiveConfirmationAlert("t1", messages, new Set(["handled"]));
    expect(picked).toBeNull();
  });

  it("pickPendingThread returns the freshest non-archived flagged thread", () => {
    const threads = [
      thread({ id: "a", has_pending_confirmation: true, updated_at: "2026-07-02T10:00:00Z" }),
      thread({ id: "b", has_pending_confirmation: true, updated_at: "2026-07-02T11:00:00Z" }),
      thread({ id: "c", has_pending_confirmation: true, status: "archived", updated_at: "2026-07-02T12:00:00Z" }),
      thread({ id: "d", has_pending_confirmation: false, updated_at: "2026-07-02T13:00:00Z" }),
    ];
    expect(pickPendingThread(threads)?.id).toBe("b");
  });
});
