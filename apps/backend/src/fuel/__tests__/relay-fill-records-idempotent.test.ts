/**
 * ACCT-F11107 — fuel.relay_fill_records failed every run on 13 duplicate-key errors (fuel_tx_source_row_hash_uk): the Relay-rail
 * record of a purchase another rail also records was voided, its fill document stayed live and unlinked, and the worker tried to
 * write the line's record again. A line that already has its (voided) record is done — an idempotent skip, not a failure.
 */
import { describe, expect, it } from "vitest";
import {
  isRelayLineAlreadyRecordedError,
  listRelayFillDocumentsWithoutRecords,
  recordAndLinkRelayFillDocument,
  relayFillRunVerdict,
} from "../fuel-expense-document.service.js";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FILL = "11111111-1111-4111-8111-111111111111";

describe("ACCT-F11107 relay fill records are idempotent", () => {
  it("recognises the unique violation on the line's source_row_hash", () => {
    expect(isRelayLineAlreadyRecordedError({ code: "23505", constraint: "fuel_tx_source_row_hash_uk" })).toBe(true);
    expect(isRelayLineAlreadyRecordedError({ code: "23505", message: 'duplicate key value violates unique constraint "fuel_tx_source_row_hash_uk"' })).toBe(true);
    expect(isRelayLineAlreadyRecordedError({ code: "23505", constraint: "some_other_uk" })).toBe(false);
    expect(isRelayLineAlreadyRecordedError(new Error("boom"))).toBe(false);
  });

  it("the document list leaves out a fill whose line already has its voided record", async () => {
    let sql = "";
    await listRelayFillDocumentsWithoutRecords({ query: async (s: string) => { sql = s; return { rows: [] }; } } as never, CO);
    expect(sql).toMatch(/fv\.source_row_hash = 'relay-line:' \|\| e\.operating_company_id::text \|\| ':' \|\| l\.id::text/);
    expect(sql).toMatch(/AND NOT EXISTS \(SELECT 1 FROM integrations\.relay_fuel_transaction_lines l/);
  });

  it("a duplicate-key error on the write is 'already_recorded', not a refusal", async () => {
    const dup = Object.assign(new Error('duplicate key value violates unique constraint "fuel_tx_source_row_hash_uk"'), { code: "23505" });
    const client = {
      async query(sql: string) {
        if (/^SAVEPOINT|^RELEASE|^ROLLBACK TO/.test(sql.trim())) return { rows: [] };
        if (/SELECT r\.relay_created_at::text AS at,/.test(sql)) return { rows: [{ at: "2026-09-03T20:15:00+00", unit_id: "u", driver_id: "d" }] };
        if (/FROM fuel\.fuel_transactions\s+WHERE operating_company_id = \$1::uuid AND relay_fuel_transaction_id/.test(sql)) throw dup;
        return { rows: [] };
      },
    };
    const r = await recordAndLinkRelayFillDocument(client as never, { operating_company_id: CO, expense_id: "e", relay_fill_id: FILL, load_id: null, driver_id: "d", unit_id: "u", actor_user_uuid: "a" });
    expect(r.outcome).toBe("already_recorded");
  });

  it("the run verdict: already-recorded and linked are done, named refusals are logged not failed, only an unexplained non-link fails", () => {
    const v = relayFillRunVerdict([
      { relay_fill_id: "a", outcome: "linked", reason: null },
      { relay_fill_id: "b", outcome: "already_recorded", reason: "x" },
      { relay_fill_id: "c", outcome: "refused", reason: "relay_fill_unit_unknown: ..." },
      { relay_fill_id: "d", outcome: "not_linked", reason: "no free fuel record of the fill" },
    ]);
    expect(v.refusals).toEqual(["c: relay_fill_unit_unknown: ..."]);
    expect(v.failures).toEqual(["d: no free fuel record of the fill"]);
    expect(relayFillRunVerdict([{ relay_fill_id: "x", outcome: "already_recorded", reason: null }]).failures).toEqual([]);
  });
});
