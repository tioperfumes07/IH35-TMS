import { describe, expect, it } from "vitest";
import { FEED_CHECKS } from "../feed-gate.checks.js";
import { FeedGateError, closeIntakeOnClient, runIntakeOnClient } from "../feed-gate.service.js";

type Q = { sql: string; params: unknown[] };
function fakeClient(opts: { checkRows: (key: string) => Array<{ ok: boolean | null; label: string; missing?: string }>; intakeStatus?: string }) {
  const calls: Q[] = [];
  const inserted: Array<{ key: string; status: string; missing: string | null }> = [];
  let intake = { id: "i1", operating_company_id: "co", feed_kind: "settlement", subject_table: "driver_finance.driver_settlements", subject_id: "s1", driver_id: "d1", status: opts.intakeStatus ?? "open", opened_at: "", last_run_no: 0, last_run_at: null, checks_total: 0, checks_failed: 0, passed_at: null, closed_at: null };
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM driver_finance.feed_intakes WHERE id = $1::uuid") && sql.includes("FOR UPDATE")) return { rows: [intake] };
      if (sql.startsWith("SELECT * FROM (")) {
        const def = FEED_CHECKS.settlement!.find((d) => sql.includes(d.sql));
        const rows = opts.checkRows(def?.key ?? "?");
        return { rows: rows.map((r) => ({ subject_table: "t", subject_id: "11111111-1111-4111-8111-111111111111", subject_label: r.label, ok: r.ok, missing: r.missing ?? null, fix_link: "/x", measured: {} })) };
      }
      if (sql.includes("INSERT INTO driver_finance.feed_intake_checks")) { inserted.push({ key: String(params[4]), status: params.length > 5 ? String(params[5]) : "na", missing: (params[9] as string | null) ?? null }); return { rows: [], rowCount: 1 }; }
      if (sql.includes("UPDATE driver_finance.feed_intakes SET last_run_no")) { intake = { ...intake, last_run_no: params[2] as number, checks_total: params[3] as number, checks_failed: params[4] as number, status: params[5] as string }; return { rows: [intake] }; }
      if (sql.includes("FROM driver_finance.feed_intake_checks WHERE intake_id")) return { rows: inserted.map((x, i) => ({ id: String(i), run_no: 1, check_group: "g", check_key: x.key, status: x.status, subject_table: "t", subject_id: null, subject_label: "L", missing: x.missing, fix_link: "/x", measured: {}, measured_at: "" })) };
      if (sql.includes("SET status = 'closed'")) return { rows: intake.status === "passed" ? [{ ...intake, status: "closed" }] : [] };
      if (sql.includes("SELECT status, checks_failed FROM driver_finance.feed_intakes")) return { rows: [{ status: intake.status, checks_failed: intake.checks_failed }] };
      return { rows: [] };
    },
  };
  return { client: client as never, calls, inserted, get intake() { return intake; } };
}

describe("FEED GATE runner", () => {
  it("every check row becomes a WORM check row; one red check blocks the intake and close is refused", async () => {
    const f = fakeClient({ checkRows: (key) => (key === "settlement.gross_equals_driver_bills" ? [{ ok: false, label: "Settlement P-1", missing: "gross_pay 195575c ≠ Σ driver bills 170947c" }] : [{ ok: true, label: "ok" }]) });
    const run = await runIntakeOnClient(f.client, "co", "i1");
    expect(run.intake.status).toBe("blocked");
    expect(run.intake.checks_failed).toBe(1);
    expect(run.intake.checks_total).toBe(FEED_CHECKS.settlement!.length);
    expect(f.inserted.find((x) => x.key === "settlement.gross_equals_driver_bills")?.missing).toMatch(/195575c/);
    await expect(closeIntakeOnClient(f.client, "co", "i1", "u")).rejects.toBeInstanceOf(FeedGateError);
  });
  it("all green → passed → close allowed; a check with no subject rows is recorded as 'na' and never counts", async () => {
    const f = fakeClient({ checkRows: (key) => (key === "fuel.matched_to_load_unit_driver" ? [] : [{ ok: true, label: "ok" }]) });
    const run = await runIntakeOnClient(f.client, "co", "i1");
    expect(run.intake.status).toBe("passed");
    expect(f.inserted.find((x) => x.key === "fuel.matched_to_load_unit_driver")?.status).toBe("na");
    expect(run.intake.checks_total).toBe(FEED_CHECKS.settlement!.length - 1);
    const closed = await closeIntakeOnClient(f.client, "co", "i1", "u");
    expect(closed.status).toBe("closed");
  });
  it("ok = NULL (not applicable for this subject state) is 'na', not a pass and not a fail", async () => {
    const f = fakeClient({ checkRows: (key) => (key === "load.stops_stamped" ? [{ ok: null, label: "Load 1" }] : [{ ok: true, label: "ok" }]) });
    const run = await runIntakeOnClient(f.client, "co", "i1");
    expect(f.inserted.find((x) => x.key === "load.stops_stamped")?.status).toBe("na");
    expect(run.intake.status).toBe("passed");
  });
  it("a closed intake is never re-run", async () => {
    const f = fakeClient({ checkRows: () => [{ ok: true, label: "ok" }], intakeStatus: "closed" });
    await expect(runIntakeOnClient(f.client, "co", "i1")).rejects.toMatchObject({ code: "feed_gate_intake_closed" });
  });
});
