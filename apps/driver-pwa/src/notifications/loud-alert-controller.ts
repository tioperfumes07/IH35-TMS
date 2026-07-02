// NOTIF-A (A1) — pure loud-alert controller. Owns the takeover's core invariant so it can be unit
// tested without a DOM: an active alert can ONLY be cleared by acknowledge() (which posts the
// EXISTING confirmation_ack path). There is deliberately NO dismiss/close/snooze method — the
// takeover cannot be waved away. This module has zero React/DOM/Audio imports on purpose.
import type { DriverChatMessage, DriverChatThread } from "../api/chat";

export type ActiveAlert = {
  threadId: string;
  message: DriverChatMessage;
};

/**
 * Pick the confirmation to raise a loud alert for from a candidate thread's messages.
 * Selects the newest ACTIVE, UNACKED confirmation_request not already handled this session.
 * A read receipt (acked_at is set only by a real confirmation_ack) is the only thing that clears it.
 */
export function pickActiveConfirmationAlert(
  threadId: string,
  messages: DriverChatMessage[],
  handledMessageIds: ReadonlySet<string>,
): ActiveAlert | null {
  const candidate = messages
    .filter(
      (m) =>
        m.msg_type === "confirmation_request" &&
        m.status === "active" &&
        !m.acked_at &&
        !handledMessageIds.has(m.id),
    )
    .sort((a, b) => b.seq - a.seq)[0];
  return candidate ? { threadId, message: candidate } : null;
}

/** Choose which thread the watcher should inspect: the freshest non-archived thread flagged pending. */
export function pickPendingThread(threads: DriverChatThread[]): DriverChatThread | null {
  return (
    threads
      .filter((t) => t.status !== "archived" && t.has_pending_confirmation)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0] ?? null
  );
}

export type AckFn = (alert: ActiveAlert) => Promise<void>;

/**
 * Minimal state machine for the takeover. `present()` raises it; `acknowledge()` is the ONLY exit.
 * Exposes no other mutator — the "cannot be dismissed without Acknowledge" guarantee is structural.
 */
export function createLoudAlertController(ack: AckFn) {
  let active: ActiveAlert | null = null;
  let acknowledging = false;

  return {
    getActive(): ActiveAlert | null {
      return active;
    },
    isVisible(): boolean {
      return active !== null;
    },
    isAcknowledging(): boolean {
      return acknowledging;
    },
    /** Raise the takeover for an alert (no-op if the same message is already showing). */
    present(alert: ActiveAlert): void {
      if (active && active.message.id === alert.message.id) return;
      active = alert;
    },
    /** The ONLY way to clear the takeover: post the confirmation_ack, then hide. */
    async acknowledge(): Promise<void> {
      if (!active || acknowledging) return;
      acknowledging = true;
      try {
        await ack(active);
        active = null;
      } finally {
        acknowledging = false;
      }
    },
  };
}

export type LoudAlertController = ReturnType<typeof createLoudAlertController>;
