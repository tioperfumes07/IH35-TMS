/**
 * ROW 97 — Banking Home drift board shows ONE row per bank account. Fail-old (live 2026-11-13): 15 alert rows for
 * 8 accounts — Relay Fuel Wallet twice (-$123.45/-$123.45 and -$123.45/$370.85) with nothing saying which is which.
 */
import { describe, expect, it } from "vitest";
import type { DriftAlert } from "../../../api/banking";
import { groupDriftAlertsByAccount } from "./drift-board-rows";

function alert(p: Partial<DriftAlert>): DriftAlert {
  return {
    id: "a", operating_company_id: "c", bank_account_id: "relay", reconciliation_session_id: null,
    detected_at: "2026-10-05T00:00:00Z", as_of_date: "2026-10-05", drift_kind: "live_balance",
    bank_balance_cents: 0, book_balance_cents: 0, drift_cents: 0, tolerance_cents: 100, severity: "warning",
    resolved_at: null, resolved_by_user_id: null, resolution_note: null, resolving_journal_entry_id: null,
    account_name: "Relay Fuel Wallet", account_mask: null, institution_name: null, ...p,
  };
}

describe("groupDriftAlertsByAccount", () => {
  it("one row per account: money from live_balance, stale_feed adds the issue, oldest detected_at wins", () => {
    const rows = groupDriftAlertsByAccount([
      alert({ id: "s", drift_kind: "stale_feed", bank_balance_cents: -12345, book_balance_cents: -12345, drift_cents: 0, detected_at: "2026-10-05T00:00:00Z" }),
      alert({ id: "l", drift_kind: "live_balance", bank_balance_cents: -12345, book_balance_cents: 37085, drift_cents: -49430, detected_at: "2026-10-20T00:00:00Z", severity: "critical" }),
      alert({ id: "b", bank_account_id: "bofa", account_name: "USMCA FREIGHT", drift_kind: "live_balance", bank_balance_cents: 972851, book_balance_cents: -8737289, drift_cents: 9710140 }),
    ]);
    expect(rows).toHaveLength(2);
    const relay = rows.find((r) => r.bank_account_id === "relay")!;
    expect(relay.alert_ids.sort()).toEqual(["l", "s"]);
    expect([relay.bank_cents, relay.book_cents, relay.diff_cents]).toEqual([-12345, 37085, -49430]);
    expect(relay.issues).toEqual(["Bank ≠ book", "Feed stale"]);
    expect(relay.detected_at).toBe("2026-10-05T00:00:00Z");
    expect(relay.severity).toBe("critical");
  });

  it("a stale feed alone carries no money figure", () => {
    const [row] = groupDriftAlertsByAccount([alert({ drift_kind: "stale_feed", bank_balance_cents: 0, book_balance_cents: 0 })]);
    expect([row.bank_cents, row.book_cents, row.diff_cents]).toEqual([null, null, null]);
    expect(row.issues).toEqual(["Feed stale"]);
  });

  it("a session variance outranks the live balance for the money shown", () => {
    const [row] = groupDriftAlertsByAccount([
      alert({ id: "l", drift_kind: "live_balance", drift_cents: 100 }),
      alert({ id: "v", drift_kind: "session_variance", drift_cents: 777 }),
    ]);
    expect(row.diff_cents).toBe(777);
    expect(row.issues[0]).toBe("Reconciliation off");
  });
});
