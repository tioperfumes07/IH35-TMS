import { describe, expect, it } from "vitest";
import {
  CHAT_ESCALATION_CONFIG,
  selectEscalations,
  type EscalationCandidate,
} from "../../chat/escalation-config.js";

const NOW = new Date("2026-07-02T12:00:00.000Z");
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60000);

function candidate(over: Partial<EscalationCandidate>): EscalationCandidate {
  return {
    messageId: over.messageId ?? "m1",
    serverTs: over.serverTs ?? minsAgo(30),
    acked: over.acked ?? false,
    hasReadReceipt: over.hasReadReceipt ?? false,
    attempts: over.attempts ?? 0,
    lastEscalatedAt: over.lastEscalatedAt ?? null,
  };
}

describe("NOTIF-A selectEscalations", () => {
  it("selects a stale, unacked confirmation with no prior attempts", () => {
    const out = selectEscalations([candidate({ messageId: "stale" })], NOW);
    expect(out.map((c) => c.messageId)).toEqual(["stale"]);
  });

  it("excludes an acked confirmation (real confirmation_ack stops escalation)", () => {
    const out = selectEscalations([candidate({ messageId: "acked", acked: true })], NOW);
    expect(out).toHaveLength(0);
  });

  it("STILL selects a read-but-unacked confirmation (read receipt is NOT an acknowledgement)", () => {
    const out = selectEscalations(
      [candidate({ messageId: "read-unacked", hasReadReceipt: true, acked: false })],
      NOW,
    );
    expect(out.map((c) => c.messageId)).toEqual(["read-unacked"]);
  });

  it("excludes a confirmation younger than staleAfterMinutes", () => {
    const fresh = candidate({ messageId: "fresh", serverTs: minsAgo(CHAT_ESCALATION_CONFIG.staleAfterMinutes - 1) });
    expect(selectEscalations([fresh], NOW)).toHaveLength(0);
  });

  it("stops after maxAttempts (bounded retries)", () => {
    const maxed = candidate({
      messageId: "maxed",
      attempts: CHAT_ESCALATION_CONFIG.maxAttempts,
      lastEscalatedAt: minsAgo(60),
    });
    expect(selectEscalations([maxed], NOW)).toHaveLength(0);
  });

  it("waits the escalating interval between attempts", () => {
    // attempts=1 → wait intervalsMinutes[1] (=5) before the next re-fire.
    const waitIdx = 1;
    const waitMin = CHAT_ESCALATION_CONFIG.intervalsMinutes[waitIdx];
    const tooSoon = candidate({ messageId: "soon", attempts: waitIdx, lastEscalatedAt: minsAgo(waitMin - 1) });
    const ready = candidate({ messageId: "ready", attempts: waitIdx, lastEscalatedAt: minsAgo(waitMin + 1) });
    const out = selectEscalations([tooSoon, ready], NOW);
    expect(out.map((c) => c.messageId)).toEqual(["ready"]);
  });

  it("mixed batch: keeps only the eligible ones", () => {
    const out = selectEscalations(
      [
        candidate({ messageId: "keep-1" }),
        candidate({ messageId: "keep-read", hasReadReceipt: true }),
        candidate({ messageId: "drop-acked", acked: true }),
        candidate({ messageId: "drop-fresh", serverTs: minsAgo(0) }),
        candidate({ messageId: "drop-maxed", attempts: 3, lastEscalatedAt: minsAgo(100) }),
      ],
      NOW,
    );
    expect(out.map((c) => c.messageId).sort()).toEqual(["keep-1", "keep-read"]);
  });
});
