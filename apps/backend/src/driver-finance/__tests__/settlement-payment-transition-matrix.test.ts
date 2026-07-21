/**
 * Phase 4 pre-work (0091-g7-1): pins the legal payment-state transition matrix
 * in settlement-payment.service.ts. The test IS the guard — no standalone
 * verify-*.mjs (Rule 17).
 *
 * Phase 2 double-pay fix delta (DESIGN-settlement-double-pay-row-lock-state-guard §2.3):
 * SAME-STATE (diagonal) calls are now IDEMPOTENT SUCCESS — the mutator returns the
 * existing row and writes NOTHING (no UPDATE, no event, no audit) — instead of
 * throwing invalid_payment_state_transition. Every off-diagonal illegal edge still
 * throws, and the ALLOWED matrix itself is unchanged.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  queryMock: vi.fn(),
  appendCrudAuditMock: vi.fn().mockResolvedValue(undefined),
  sendEmailMock: vi.fn().mockResolvedValue(undefined),
  enqueueSyncJobMock: vi.fn().mockResolvedValue(undefined),
  resolveDefaultAchTokenMock: vi.fn().mockResolvedValue("ach-token-test"),
}));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof mocked.queryMock }) => Promise<unknown>) =>
    fn({ query: mocked.queryMock }),
  withLuciaBypass: async (fn: (client: { query: typeof mocked.queryMock }) => Promise<unknown>) =>
    fn({ query: mocked.queryMock }),
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: mocked.appendCrudAuditMock,
}));

vi.mock("../../notifications/email.service.js", () => ({
  sendEmail: mocked.sendEmailMock,
}));

vi.mock("../../integrations/qbo/qbo-sync.service.js", () => ({
  enqueueSyncJob: mocked.enqueueSyncJobMock,
}));

vi.mock("../driver-payment-methods.service.js", () => ({
  resolveDefaultAchToken: mocked.resolveDefaultAchTokenMock,
}));

import {
  markBounced,
  markCleared,
  markPaidManually,
  markSentToBank,
  queuePayment,
} from "../settlement-payment.service.js";

type PaymentState = "unpaid" | "queued" | "sent_to_bank" | "cleared" | "bounced" | "manual_paid";

/** Canonical matrix copied from validateTransition (~L113–123). Do not "improve". */
const ALLOWED: Record<PaymentState, PaymentState[]> = {
  unpaid: ["queued", "manual_paid"],
  queued: ["sent_to_bank", "manual_paid", "bounced"],
  sent_to_bank: ["cleared", "bounced"],
  cleared: [],
  bounced: ["queued", "manual_paid"],
  manual_paid: [],
};

const ALL_STATES: PaymentState[] = ["unpaid", "queued", "sent_to_bank", "cleared", "bounced", "manual_paid"];

const OC = "oc000000-0000-0000-0000-000000000001";
const SETTLEMENT_ID = "ds000000-0000-0000-0000-000000000001";
const DRIVER_ID = "dr000000-0000-0000-0000-000000000001";
const USER_ID = "usr00000-0000-0000-0000-000000000001";

function baseSettlement(paymentState: PaymentState | null) {
  return {
    id: SETTLEMENT_ID,
    operating_company_id: OC,
    driver_id: DRIVER_ID,
    status: "final",
    payment_state: paymentState,
    payment_method: "ach",
    payment_bank_reference: null as string | null,
  };
}

function isAllowed(from: PaymentState, to: PaymentState): boolean {
  return ALLOWED[from].includes(to);
}

/**
 * Mock client: SELECT load returns `fromState`; UPDATE RETURNING echoes the target state.
 * Side-effect queries (events, owner emails, set_config) return empty rows.
 */
function mockDbForTransition(fromState: PaymentState | null, toState: PaymentState) {
  mocked.queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes("set_config('app.operating_company_id'")) {
      return { rows: [] };
    }
    // Classify UPDATE-with-SET before SELECT: the settlement lookup now ends in
    // "FOR UPDATE" (Phase 2 row lock), so a bare includes("UPDATE") misfiles it.
    if (
      sql.includes("SELECT") &&
      sql.includes("FROM driver_finance.driver_settlements") &&
      !/UPDATE\s+driver_finance\.driver_settlements/.test(sql)
    ) {
      return { rows: [baseSettlement(fromState)] };
    }
    if (/UPDATE\s+driver_finance\.driver_settlements/.test(sql) && sql.includes("RETURNING")) {
      return {
        rows: [
          {
            ...baseSettlement(toState),
            payment_bank_reference: toState === "sent_to_bank" ? "BANK-REF-1" : null,
            payment_method: toState === "manual_paid" ? "check" : "ach",
          },
        ],
      };
    }
    if (sql.includes("INSERT INTO driver_finance.settlement_payment_events")) {
      return { rows: [] };
    }
    if (sql.includes("FROM identity.users") || sql.includes("org.user_company_access")) {
      return { rows: [] };
    }
    return { rows: [] };
  });
}

function updateWasCalled(): boolean {
  return mocked.queryMock.mock.calls.some(
    ([sql]: [string]) => typeof sql === "string" && /UPDATE\s+driver_finance\.driver_settlements/.test(sql) && sql.includes("SET")
  );
}

function eventInsertWasCalled(): boolean {
  return mocked.queryMock.mock.calls.some(
    ([sql]: [string]) => typeof sql === "string" && sql.includes("INSERT INTO driver_finance.settlement_payment_events")
  );
}

async function invokeTransition(to: PaymentState): Promise<unknown> {
  switch (to) {
    case "queued":
      return queuePayment(SETTLEMENT_ID, OC, USER_ID);
    case "sent_to_bank":
      return markSentToBank(SETTLEMENT_ID, OC, "BANK-REF-1", USER_ID);
    case "cleared":
      return markCleared(SETTLEMENT_ID, OC, USER_ID);
    case "bounced":
      return markBounced(SETTLEMENT_ID, OC, "NSF", USER_ID);
    case "manual_paid":
      return markPaidManually(SETTLEMENT_ID, OC, "check", "CHK-1", USER_ID);
    case "unpaid":
      throw new Error("no_exported_transition_to_unpaid");
    default: {
      const _exhaustive: never = to;
      throw new Error(`unknown target ${_exhaustive}`);
    }
  }
}

/** Targets that have an exported transition function (no path TO unpaid). */
const TRANSITION_TARGETS: PaymentState[] = ["queued", "sent_to_bank", "cleared", "bounced", "manual_paid"];

describe("settlement payment transition matrix (0091-g7-1)", () => {
  beforeEach(() => {
    mocked.queryMock.mockReset();
    mocked.appendCrudAuditMock.mockClear();
    mocked.sendEmailMock.mockClear();
    mocked.enqueueSyncJobMock.mockClear();
    mocked.resolveDefaultAchTokenMock.mockReset();
    mocked.resolveDefaultAchTokenMock.mockResolvedValue("ach-token-test");
  });

  describe.each(TRANSITION_TARGETS)("transition → %s", (to) => {
    it.each(ALL_STATES)("from %s", async (from) => {
      mockDbForTransition(from, to);
      const allowed = isAllowed(from, to);

      if (from === to) {
        // Phase 2 idempotency latch: same-state is idempotent success and writes NOTHING.
        const result = (await invokeTransition(to)) as { payment_state: string };
        expect(result.payment_state).toBe(to);
        expect(updateWasCalled()).toBe(false);
        expect(eventInsertWasCalled()).toBe(false);
        expect(mocked.appendCrudAuditMock).not.toHaveBeenCalled();
      } else if (allowed) {
        const result = (await invokeTransition(to)) as { payment_state: string };
        expect(result.payment_state).toBe(to);
        expect(updateWasCalled()).toBe(true);
      } else {
        await expect(invokeTransition(to)).rejects.toThrow("invalid_payment_state_transition");
        expect(updateWasCalled()).toBe(false);
      }
    });
  });

  it("payment_state NULL coerces to unpaid (?? unpaid) — queuePayment allowed", async () => {
    mockDbForTransition(null, "queued");
    const result = (await queuePayment(SETTLEMENT_ID, OC, USER_ID)) as { payment_state: string };
    expect(result.payment_state).toBe("queued");
    expect(updateWasCalled()).toBe(true);
  });

  it("payment_state NULL coerces to unpaid — markSentToBank rejected (unpaid ↛ sent_to_bank)", async () => {
    mockDbForTransition(null, "sent_to_bank");
    await expect(markSentToBank(SETTLEMENT_ID, OC, "BANK-REF-1", USER_ID)).rejects.toThrow(
      "invalid_payment_state_transition"
    );
    expect(updateWasCalled()).toBe(false);
  });

  it("payment_state NULL coerces to unpaid — markPaidManually allowed", async () => {
    mockDbForTransition(null, "manual_paid");
    const result = (await markPaidManually(SETTLEMENT_ID, OC, "check", "CHK-1", USER_ID)) as {
      payment_state: string;
    };
    expect(result.payment_state).toBe("manual_paid");
    expect(updateWasCalled()).toBe(true);
  });

  it("matrix completeness: every (from,to) among ALL_STATES is classified exactly once", () => {
    const cells: Array<{ from: PaymentState; to: PaymentState; allowed: boolean }> = [];
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        cells.push({ from, to, allowed: isAllowed(from, to) });
      }
    }
    expect(cells).toHaveLength(36);
    // Spot-check locked edges from the service matrix comment.
    expect(isAllowed("unpaid", "queued")).toBe(true);
    expect(isAllowed("unpaid", "manual_paid")).toBe(true);
    expect(isAllowed("unpaid", "sent_to_bank")).toBe(false);
    expect(isAllowed("queued", "sent_to_bank")).toBe(true);
    expect(isAllowed("queued", "manual_paid")).toBe(true);
    expect(isAllowed("queued", "bounced")).toBe(true);
    expect(isAllowed("queued", "cleared")).toBe(false);
    expect(isAllowed("sent_to_bank", "cleared")).toBe(true);
    expect(isAllowed("sent_to_bank", "bounced")).toBe(true);
    expect(isAllowed("sent_to_bank", "queued")).toBe(false);
    expect(isAllowed("cleared", "queued")).toBe(false);
    expect(isAllowed("bounced", "queued")).toBe(true);
    expect(isAllowed("bounced", "manual_paid")).toBe(true);
    expect(isAllowed("manual_paid", "queued")).toBe(false);
    // Terminal states have zero outbound edges.
    expect(ALLOWED.cleared).toEqual([]);
    expect(ALLOWED.manual_paid).toEqual([]);
    // No transition TO unpaid exists in the matrix.
    for (const from of ALL_STATES) {
      expect(isAllowed(from, "unpaid")).toBe(false);
    }
  });
});
