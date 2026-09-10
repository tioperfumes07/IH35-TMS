import { describe, expect, it, vi } from "vitest";
import { appendHistoricalSettlementAttributionsInClientTx, assertNoHistoricalSettlementCoverage,
  captureHistoricalAttributionEvidence, historicalEvidenceHash, readHistoricalSettlementAttributions,
  validateHistoricalAttributionGroups, type HistoricalAttributionInput } from "../settlement-historical-attribution.service.js";
import { postVoidReversal } from "../../accounting/void.service.js";
import { postNegativeSettlementLiabilityIfNeeded } from "../negative-settlement-liability.service.js";
import { stampTripClosedForBookendedSettlement } from "../settlements-load-bookended.service.js";
import { claimSettlementPayRunInClientTx } from "../settlement-payrun-claim.service.js";

const company = "company";
const input: HistoricalAttributionInput = { operatingCompanyId: company, sourceSettlementId: "original",
  sourcePayrunId: "run", sourceJournalEntryId: "journal", actorUserId: "actor", idempotencyKey: "repair",
  expectedSourceHash: "", groups: [{ targetSettlementId: "target", sourceDocumentRef: "5778",
    items: [{ loadId: "load", sourceSettlementLineId: "line" }] }] };

function fake(options: { pristine?: boolean; missingRun?: boolean; wrongCompany?: boolean; owned?: boolean; conflict?: boolean; twoNb?: boolean; priorTarget?: boolean } = {}) {
  const attributions: Array<{ id: string; idempotency_key: string; request_hash: string }> = [];
  let covered = false;
  const source = { id: "original", status: "closed", gross_pay: "500.00" };
  const posting = { id: "posting", amount_cents: "50000", debit_or_credit: "credit" };
  const line = { id: "line", amount: "500.00", is_active: false, load_id: "load" };
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes("SELECT id, trip_type, status::text")) return { rows: options.wrongCompany ? [] : options.twoNb
      ? [{ id: "load", trip_type: "NB", status: "delivered" }, { id: "load2", trip_type: "NB", status: "delivered" }]
      : [{ id: "load", trip_type: "NB", status: "delivered" }] };
    if (sql.includes("SELECT a.target_settlement_id::text")) return { rows: options.priorTarget ? [{ target_settlement_id: "target" }] : [] };
    if (sql.includes("SELECT id::text, driver_id::text, to_jsonb(s)")) return { rows: [
      { id: "original", driver_id: "driver", snapshot: source }, { id: "target", driver_id: "driver", snapshot: {} }] };
    if (sql.includes("evidence->>'request_hash'")) return { rows: attributions };
    if (sql.includes("SELECT to_jsonb(s) AS snapshot")) return { rows: [{ snapshot: source }] };
    if (sql.includes("to_jsonb(r) AS snapshot, to_jsonb(je)")) return { rows: options.missingRun ? [] : [{ snapshot: { id: "run" }, journal: { id: "journal" } }] };
    if (sql.includes("to_jsonb(p) AS snapshot")) return { rows: [{ snapshot: posting }] };
    if (sql.includes("to_jsonb(l) AS snapshot")) return { rows: [{ snapshot: { id: "load" } }] };
    if (sql.includes("to_jsonb(sl) AS snapshot")) return { rows: [{ snapshot: line }] };
    if (/to_jsonb\([drb]\) AS snapshot/.test(sql)) return { rows: [] };
    if (sql.includes("SELECT s.id FROM driver_finance.driver_settlements s")) return { rows: options.pristine === false ? [] : [{ id: "target" }] };
    if (sql.includes("SELECT l.id FROM mdata.loads l")) return { rows: options.owned === false ? [] : [{ id: "load" }] };
    if (sql.includes("SELECT a.id FROM driver_finance.historical_settlement_attributions a")) return { rows: covered || options.conflict ? [{ id: "existing" }] : [] };
    if (sql.includes("INSERT INTO driver_finance.historical_settlement_attributions")) {
      const evidence = JSON.parse(String(values[6]));
      const row = { id: "attribution", idempotency_key: String(values[8]), request_hash: evidence.request_hash };
      attributions.push(row); return { rows: [{ id: row.id }] };
    }
    return { rows: [] };
  });
  return { client: { query } as never, query, source, posting, line, setCovered: () => { covered = true; } };
}

async function prepared(mock: ReturnType<typeof fake>) {
  const { hash } = await captureHistoricalAttributionEvidence(mock.client, input);
  mock.query.mockClear();
  return { ...input, expectedSourceHash: hash };
}

describe("historical settlement attribution support", () => {
  it("hashes stable keys and detects changes in original postings and inactive source lines", async () => {
    expect(historicalEvidenceHash({ b: 2, a: 1 })).toBe(historicalEvidenceHash({ a: 1, b: 2 }));
    const mock = fake();
    const original = await captureHistoricalAttributionEvidence(mock.client, input);
    mock.posting.amount_cents = "50001";
    expect((await captureHistoricalAttributionEvidence(mock.client, input)).hash).not.toBe(original.hash);
    mock.posting.amount_cents = "50000";
    mock.line.is_active = true;
    expect((await captureHistoricalAttributionEvidence(mock.client, input)).hash).not.toBe(original.hash);
    expect(mock.query.mock.calls.find(([sql]) => sql.includes("to_jsonb(sl)"))![0]).not.toContain("is_active = true");
  });
  it("appends only attribution/audit evidence with NULL money and preserves original financial records", async () => {
    const mock = fake(); const request = await prepared(mock);
    expect(await appendHistoricalSettlementAttributionsInClientTx(mock.client, request)).toEqual(["attribution"]);
    const insert = mock.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO driver_finance.historical_settlement_attributions"))!;
    expect(insert[0]).toContain("'identity_only',NULL");
    expect(JSON.parse(String(insert[1][6]))).toMatchObject({ payment_status: "unverified", allocation_status: "unallocated" });
    expect(mock.query.mock.calls.some(([sql]) => /^\s*(UPDATE|DELETE)\b/.test(sql))).toBe(false);
    expect(mock.query.mock.calls.filter(([sql]) => /^\s*INSERT/.test(sql)).every(([sql]) => sql.includes("historical_settlement_attribution"))).toBe(true);
    expect(mock.source.gross_pay).toBe("500.00");
    expect(mock.line.is_active).toBe(false);
  });
  it("retries idempotently after the caller's identity repair without rewriting any evidence", async () => {
    const mock = fake(); const request = await prepared(mock);
    await appendHistoricalSettlementAttributionsInClientTx(mock.client, request);
    mock.source.status = "identity-updated";
    mock.query.mockClear();
    expect(await appendHistoricalSettlementAttributionsInClientTx(mock.client, request)).toEqual(["attribution"]);
    expect(mock.query.mock.calls.some(([sql]) => sql.includes("INSERT") || sql.includes("audit.append_event"))).toBe(false);
    await expect(appendHistoricalSettlementAttributionsInClientTx(mock.client, { ...request, expectedSourceHash: "different" }))
      .rejects.toThrow("idempotency conflict");
  });
  it.each([
    [{ pristine: false }, "unused settlement identities"],
    [{ missingRun: true }, "unavailable or reversed"],
    [{ wrongCompany: true }, "company scope mismatch"],
    [{ owned: false }, "ownership mismatch"],
    [{ conflict: true }, "already attributed"],
    [{ priorTarget: true }, "target already attributed"],
  ] as const)("refuses invalid ownership/history %j", async (options, message) => {
    const healthy = fake(); const request = await prepared(healthy);
    const mock = fake(options);
    await expect(appendHistoricalSettlementAttributionsInClientTx(mock.client, request)).rejects.toThrow(message);
    expect(mock.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO"))).toBe(false);
  });
  it("refuses source drift before appending anything", async () => {
    const mock = fake(); const request = await prepared(mock);
    mock.line.amount = "499.00";
    await expect(appendHistoricalSettlementAttributionsInClientTx(mock.client, request)).rejects.toThrow("changed since review");
    expect(mock.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO"))).toBe(false);
  });
  it("does not re-create a multi-NB historical tour", async () => {
    const mock = fake({ twoNb: true });
    await expect(appendHistoricalSettlementAttributionsInClientTx(mock.client, { ...input, groups: [{ ...input.groups[0],
      items: [...input.groups[0].items, { loadId: "load2", sourceSettlementLineId: null }] }] }))
      .rejects.toThrow("multiple active NB loads");
    expect(mock.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO"))).toBe(false);
  });
  it("rejects duplicate source ownership without querying the database", () => {
    expect(() => validateHistoricalAttributionGroups([input.groups[0], { ...input.groups[0], targetSettlementId: "target2", sourceDocumentRef: "5782" }]))
      .toThrow("two source groups");
    expect(() => validateHistoricalAttributionGroups([input.groups[0], { ...input.groups[0], sourceDocumentRef: "5782", items: [{ loadId: "other", sourceSettlementLineId: null }] }]))
      .toThrow("distinct target settlements");
    expect(() => validateHistoricalAttributionGroups([{ ...input.groups[0], items: [input.groups[0].items[0], input.groups[0].items[0]] }]))
      .toThrow("Duplicate");
  });
  it("blocks both original and target settlement before a new payrun claim", async () => {
    const mock = fake(); mock.setCovered();
    for (const settlementId of ["original", "target"]) {
      await expect(assertNoHistoricalSettlementCoverage(mock.client, company, settlementId))
        .rejects.toMatchObject({ code: "historical_settlement_coverage", statusCode: 409 });
      await expect(claimSettlementPayRunInClientTx(mock.client, { operatingCompanyId: company, settlementId, actorUserId: "actor" }))
        .rejects.toMatchObject({ code: "historical_settlement_coverage" });
    }
    expect(mock.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO driver_finance.payrun_gl_runs"))).toBe(false);
  });
  it.each(["journal_entry", "bill"] as const)("blocks %s reversal before bank unmatching or journal writes", async (entityType) => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes("SELECT je.id::text") ? [{ id: "journal" }] : [{ source_settlement_id: "original" }] }));
    await expect(postVoidReversal({ query } as never, { operatingCompanyId: company, entityType, entityId: "source", originalDate: "2026-08-01", memo: "reverse" }, { userId: "actor" }))
      .rejects.toMatchObject({ code: "historical_settlement_coverage" });
    expect(query.mock.calls).toHaveLength(2);
    expect(query.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT)/.test(sql))).toBe(false);
  });
  it("blocks new negative-settlement liability recovery", async () => {
    const mock = fake(); mock.setCovered();
    await expect(postNegativeSettlementLiabilityIfNeeded(mock.client, { operatingCompanyId: company, settlementId: "original",
      driverId: "driver", displayId: "S-2026-0011", netPay: -10 })).rejects.toMatchObject({ code: "historical_settlement_coverage" });
    expect(mock.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO"))).toBe(false);
  });
  it("blocks close-trip recheck before materializing or recomputing lines", async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes("settlement_model")
      ? [{ id: "original", driver_id: "driver", status: "closed", settlement_model: "load_bookended", trip_closed_at: "2026-08-01", first_load_id: "load", voided_at: null }]
      : sql.includes("historical_settlement_attributions") ? [{ id: "attribution" }] : [] }));
    await expect(stampTripClosedForBookendedSettlement({ query } as never, { operatingCompanyId: company, settlementId: "original", actorUserId: "actor" }))
      .rejects.toMatchObject({ code: "historical_settlement_coverage" });
    expect(query.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT)/.test(sql))).toBe(false);
  });
  it("reads original and target links with explicit company scope and current-revision filtering", async () => {
    const mock = fake();
    await readHistoricalSettlementAttributions(mock.client, company, "target");
    const [sql, values] = mock.query.mock.calls[0];
    expect(values).toEqual([company, "target"]);
    expect(sql).toContain("a.source_settlement_id = $2::uuid OR a.target_settlement_id = $2::uuid");
    expect(sql).toContain("successor.supersedes_id = a.id");
  });
});
