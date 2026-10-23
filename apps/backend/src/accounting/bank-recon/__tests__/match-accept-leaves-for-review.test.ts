import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// LEAD 443.279 (CC-2): a matched bank line must LEAVE For review on the column the For-review queue, the UNCATEGORIZED
// count, bulk-categorize and bulk post-as-bill read (status), not only review_state — fork proof: a Faro wire matched to
// its advance stayed 'pending_categorization' (bulk-postable a second time).
const src = readFileSync(resolve(__dirname, "../match.service.ts"), "utf8");
const oneToOne = src.slice(src.indexOf("export async function acceptMatchWithResolveDifference"), src.indexOf("export async function acceptExactMultiDocumentMatch"));
const multi = src.slice(src.indexOf("export async function acceptExactMultiDocumentMatch"), src.indexOf("export async function previewMatchVariance"));

describe("match accept leaves For review", () => {
  it("1:1 accept: the kind declaration after the clearing UPDATE also sets status = 'categorized'", () => {
    expect(oneToOne).toMatch(/SET resolution_kind = 'matched', status = 'categorized'/);
  });
  it("1:1 accept: a Faro-poster-cleared line also leaves For review", () => {
    expect(oneToOne).toMatch(/categorized_at = COALESCE\(categorized_at, now\(\)\),\s*status = 'categorized'/);
  });
  it("multi-document accept: the clearing UPDATE sets status = 'categorized' with resolution_kind 'matched'", () => {
    expect(multi).toMatch(/SET review_state = 'matched', resolution_kind = 'matched', status = 'categorized'/);
  });
});
