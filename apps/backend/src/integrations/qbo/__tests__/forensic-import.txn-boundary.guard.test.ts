import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

// G5-2 pool/lock-safety guard.
// The forensic attachment import must NOT hold a DB transaction open across the
// external HTTP calls (QBO `qboDownloadAttachment` + R2 `r2.send`). Those network
// calls are slow/failable; holding a pooled connection + open txn across them
// exhausts the pool and risks long lock holds. HTTP must happen BEFORE `BEGIN`,
// and nothing between `BEGIN` and `COMMIT` may perform network I/O.
//
// This is a static source guard (per repo policy: "every bug fix gets a static CI
// guard so it can't regress").

const here = dirname(fileURLToPath(import.meta.url));
const SERVICE_PATH = join(here, "..", "forensic-import.service.ts");
const source = readFileSync(SERVICE_PATH, "utf8");

/** Slice out the body of an exported async function by brace-matching from its declaration. */
function extractFunctionBody(src: string, signatureFragment: string): string {
  const start = src.indexOf(signatureFragment);
  expect(start, `could not locate ${signatureFragment}`).toBeGreaterThan(-1);
  const braceStart = src.indexOf("{", start);
  let depth = 0;
  for (let i = braceStart; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(braceStart, i + 1);
    }
  }
  throw new Error(`unbalanced braces while extracting ${signatureFragment}`);
}

describe("forensic-import attachment transaction boundary (G5-2)", () => {
  const body = extractFunctionBody(source, "export async function importAttachments");

  it("performs the QBO attachment HTTP download BEFORE opening the transaction", () => {
    const httpIdx = body.indexOf("qboDownloadAttachment(");
    const beginIdx = body.indexOf('client.query("BEGIN")');
    expect(httpIdx, "qboDownloadAttachment call not found").toBeGreaterThan(-1);
    expect(beginIdx, "BEGIN not found").toBeGreaterThan(-1);
    expect(httpIdx).toBeLessThan(beginIdx);
  });

  it("does NOT call qboDownloadAttachment or r2.send between BEGIN and COMMIT", () => {
    const beginIdx = body.indexOf('client.query("BEGIN")');
    const commitIdx = body.indexOf('client.query("COMMIT")');
    expect(beginIdx).toBeGreaterThan(-1);
    expect(commitIdx).toBeGreaterThan(beginIdx);
    const txnSpan = body.slice(beginIdx, commitIdx);
    expect(txnSpan).not.toContain("qboDownloadAttachment");
    expect(txnSpan).not.toContain("r2.send");
  });

  it("still persists attachments via INSERT ... attachments_snapshot inside the transaction", () => {
    const beginIdx = body.indexOf('client.query("BEGIN")');
    const commitIdx = body.indexOf('client.query("COMMIT")');
    const txnSpan = body.slice(beginIdx, commitIdx);
    // Persisted-data invariants unchanged by the boundary move.
    expect(txnSpan).toContain("INSERT INTO qbo_archive.attachments_snapshot");
    expect(txnSpan).toContain("ON CONFLICT DO NOTHING");
    expect(txnSpan).toContain("UPDATE qbo_archive.import_batches");
  });
});
