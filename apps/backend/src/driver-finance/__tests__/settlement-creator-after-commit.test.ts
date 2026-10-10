import { describe, expect, it, vi } from "vitest";
import { overallOk, runCreatorAfterCommit } from "../settlement-creator-after-commit.js";
import { AUTO_SUBMIT_REFUSED_REASON } from "../../factoring/auto-submit-on-delivery.service.js";

const input = {
  operating_company_id: "co",
  settlement_id: "s",
  loads: [
    { load_id: "l1", load_number: "13498", factoring: "faro_transportation", delivered: true },
    { load_id: "l2", load_number: "13508", factoring: "faro_usmca", delivered: true },
  ],
};
const okSync = vi.fn(async () => [{ changed: true }, { changed: true }]);

describe("ROUND 443.7 b — an honest post result", () => {
  it("owner law ROUND 315: a Faro load waiting for the owner's submit is OK, not a failure", async () => {
    const r = await runCreatorAfterCommit("u", input, { submit: vi.fn(async () => ({ submitted: false, reason: AUTO_SUBMIT_REFUSED_REASON })), sync: okSync } as never);
    expect(r.factoring).toMatchObject({ ok: true, status: "owner_submits" });
    expect(r.factoring.per_load).toEqual([
      { load_number: "13498", status: "not_factored_by_usmca" },
      { load_number: "13508", status: "owner_submits" },
    ]);
  });
  it("forced factor-submit failure -> factoring failed with its reason, overall ok false", async () => {
    const r = await runCreatorAfterCommit("u", input, { submit: vi.fn(async () => { throw new Error("faro_api_down"); }), sync: okSync } as never);
    expect(r.factoring).toMatchObject({ ok: false, status: "failed", message: expect.stringContaining("faro_api_down") });
    const stages = { documents: { ok: true, status: "committed", message: "" }, ledger: { ok: true, status: "posted", message: "" }, ...r };
    expect(overallOk(stages)).toBe(false);
  });
  it("a submit that answers any other reason is a failure", async () => {
    const r = await runCreatorAfterCommit("u", input, { submit: vi.fn(async () => ({ submitted: false, reason: "no_invoice_for_load" })), sync: okSync } as never);
    expect(r.factoring.ok).toBe(false);
  });
  it("billing sync swallowing a per-load error is reported as failed, naming the load", async () => {
    const r = await runCreatorAfterCommit("u", input, {
      submit: vi.fn(async () => ({ submitted: false, reason: AUTO_SUBMIT_REFUSED_REASON })),
      sync: vi.fn(async () => [{ changed: true }, { changed: false, reason: "error" }]),
    } as never);
    expect(r.billing).toMatchObject({ ok: false, message: expect.stringContaining("13508") });
  });
  it("all stages green -> ok", async () => {
    const r = await runCreatorAfterCommit("u", input, { submit: vi.fn(async () => ({ submitted: false, reason: AUTO_SUBMIT_REFUSED_REASON })), sync: okSync } as never);
    expect(overallOk({ documents: { ok: true, status: "", message: "" }, ledger: { ok: true, status: "", message: "" }, ...r })).toBe(true);
  });
});
