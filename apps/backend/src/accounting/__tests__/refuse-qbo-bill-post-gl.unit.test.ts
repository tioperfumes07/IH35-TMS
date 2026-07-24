/**
 * Parallel-books control: QBO-origin bills must never post a TMS JE.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");
const enginePath = path.join(ROOT, "apps/backend/src/accounting/posting-engine.service.ts");

describe("refuse QBO bill post-gl (static contract)", () => {
  const src = fs.readFileSync(enginePath, "utf8");

  it("declares QBO_BILL_POST_GL_REFUSED on PostingErrorCode", () => {
    expect(src).toContain('"QBO_BILL_POST_GL_REFUSED"');
  });

  it("refuses buildBillLines when source_system is qbo", () => {
    expect(src).toMatch(/source_system[\s\S]{0,120}qbo[\s\S]{0,200}QBO_BILL_POST_GL_REFUSED/);
  });

  it("does not mark refused QBO bills as failed posting batches", () => {
    expect(src).toMatch(/QBO_BILL_POST_GL_REFUSED/);
    expect(src).toMatch(/error\.code !== "QBO_BILL_POST_GL_REFUSED"/);
  });
});
