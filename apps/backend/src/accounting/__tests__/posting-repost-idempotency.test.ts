/**
 * BANK-F04 — the repost capability, proven BOTH ways.
 *
 * (a) reverse -> repost must yield a NEW batch (a distinct idempotency key), because the old behaviour
 *     silently returned the ORIGINAL batch and the corrected expense never landed; and
 * (b) the existing initial_post / reversal keys must be BYTE-IDENTICAL to before, because this is the
 *     canonical poster and every already-stored key in accounting.posting_batches must keep matching.
 *
 * (b) is the assertion that protects production. A repost capability that quietly changed the shape of
 * existing keys would orphan every posted batch and make the poster re-post the entire ledger.
 */
import { describe, expect, it } from "vitest";
import { buildPostingMvpIdempotencyKey } from "../posting-engine.service.js";

const BASE = {
  operating_company_id: "91E0BF0A-133F-4CE8-A734-2586CFA66D96",
  source_transaction_type: "bank_categorization" as const,
  source_transaction_id: "76b6f9be-da0b-4e8f-a63e-abe5c1a22b20",
  source_transaction_line_id: null,
};

describe("BANK-F04 repost idempotency", () => {
  it("initial_post keys are UNCHANGED — the exact legacy shape, no revision segment", () => {
    const key = buildPostingMvpIdempotencyKey({ ...BASE, posting_purpose: "initial_post" });
    // Pinned literally: this is what is already stored in accounting.posting_batches on prod.
    expect(key).toBe(
      "ih35:posting-mvp:v1:91e0bf0a-133f-4ce8-a734-2586cfa66d96:bank_categorization:76b6f9be-da0b-4e8f-a63e-abe5c1a22b20:-:initial_post"
    );
  });

  it("passing a revision does NOT leak into initial_post or reversal keys", () => {
    const initial = buildPostingMvpIdempotencyKey({ ...BASE, posting_purpose: "initial_post" });
    const initialWithRev = buildPostingMvpIdempotencyKey({ ...BASE, posting_purpose: "initial_post", repost_revision: 3 });
    expect(initialWithRev).toBe(initial);

    const reversal = buildPostingMvpIdempotencyKey({ ...BASE, posting_purpose: "reversal" });
    const reversalWithRev = buildPostingMvpIdempotencyKey({ ...BASE, posting_purpose: "reversal", repost_revision: 3 });
    expect(reversalWithRev).toBe(reversal);
    expect(reversal.endsWith(":reversal")).toBe(true);
  });

  it("a repost key DIFFERS from the initial_post key — this is the whole defect", () => {
    const initial = buildPostingMvpIdempotencyKey({ ...BASE, posting_purpose: "initial_post" });
    const repost = buildPostingMvpIdempotencyKey({ ...BASE, posting_purpose: "repost", repost_revision: 1 });
    expect(repost).not.toBe(initial);
    expect(repost.endsWith(":repost:1")).toBe(true);
  });

  it("the SAME correction submitted twice dedups — same revision, same key", () => {
    const a = buildPostingMvpIdempotencyKey({ ...BASE, posting_purpose: "repost", repost_revision: 1 });
    const b = buildPostingMvpIdempotencyKey({ ...BASE, posting_purpose: "repost", repost_revision: 1 });
    expect(b).toBe(a);
  });

  it("successive corrections are DISTINCT — a correction of a correction posts again", () => {
    const first = buildPostingMvpIdempotencyKey({ ...BASE, posting_purpose: "repost", repost_revision: 1 });
    const second = buildPostingMvpIdempotencyKey({ ...BASE, posting_purpose: "repost", repost_revision: 2 });
    expect(second).not.toBe(first);
  });

  it("an omitted revision on a repost defaults to 1 rather than silently colliding with initial_post", () => {
    const defaulted = buildPostingMvpIdempotencyKey({ ...BASE, posting_purpose: "repost" });
    const explicit = buildPostingMvpIdempotencyKey({ ...BASE, posting_purpose: "repost", repost_revision: 1 });
    const initial = buildPostingMvpIdempotencyKey({ ...BASE, posting_purpose: "initial_post" });
    expect(defaulted).toBe(explicit);
    expect(defaulted).not.toBe(initial);
  });

  it("keys stay per-source and per-line — a repost never bleeds across transactions", () => {
    const a = buildPostingMvpIdempotencyKey({ ...BASE, posting_purpose: "repost", repost_revision: 1 });
    const otherSource = buildPostingMvpIdempotencyKey({
      ...BASE,
      source_transaction_id: "628deb2b-0262-46b1-ba9e-b614c24a7569",
      posting_purpose: "repost",
      repost_revision: 1,
    });
    const otherLine = buildPostingMvpIdempotencyKey({
      ...BASE,
      source_transaction_line_id: "line-2",
      posting_purpose: "repost",
      repost_revision: 1,
    });
    expect(otherSource).not.toBe(a);
    expect(otherLine).not.toBe(a);
  });
});
