#!/usr/bin/env node
/**
 * verify-audit-events-bulk-call-preview-truncation.mjs (verify-step 4644)
 *
 * Root cause: `apps/frontend/src/pages/audit/AuditEventsList.tsx`'s `bulkCallPreview(id)` helper
 * called `entityLabel(null, id, "Record")`, which per entityLabel's own contract ALWAYS returns
 * "Record — not visible" whenever `id` is a non-empty string (there is never a `name` argument
 * passed here). This helper backs BOTH the Bulk Call column's cell text AND the click-to-filter
 * button's own visible label on `/admin/audit-events` (mounted route, Owner/Administrator/
 * Manager/Accountant), so every row with a `bulk_call_id` rendered its filter button as literally
 * "Record — not visible" instead of a short id preview. Confirmed via the repo's OWN pre-existing
 * test (`AuditEventsList.test.tsx`), which was RED before this fix:
 * `expect(bulkCallPreview("bulk-call-abc-123")).toBe("bulk-cal…")` failed, receiving
 * "Record — not visible". Unlike the F6301-class self-referential entityLabel misuse (fixed 6x
 * this session), this is a DIFFERENT misuse: entityLabel resolves a foreign ENTITY's name, but
 * bulk_call_id is a literal batch-operation token being matched for a filter, not a linked entity.
 *
 * Fix: swap to a plain 8-char-prefix + ellipsis truncation, matching the file's own pre-existing
 * test expectation exactly.
 *
 * Usage:
 *   node scripts/verify-audit-events-bulk-call-preview-truncation.mjs            # scan
 *   node scripts/verify-audit-events-bulk-call-preview-truncation.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/frontend/src/pages/audit/AuditEventsList.tsx";

const NOT_VISIBLE_CALL_RE = /return\s+entityLabel\(null,\s*id,\s*"Record"\)/;
const TRUNCATION_RE = /id\.length\s*>\s*8\s*\?\s*`\$\{id\.slice\(0,\s*8\)\}…`\s*:\s*id/;

export function checkBulkCallPreviewTruncation(src) {
  const offenders = [];
  if (NOT_VISIBLE_CALL_RE.test(src)) {
    offenders.push(
      `${FILE}: bulkCallPreview() still calls entityLabel(null, id, "Record") — the Bulk Call column and its click-to-filter button will render "Record — not visible" for every row again.`,
    );
  }
  if (!TRUNCATION_RE.test(src)) {
    offenders.push(`${FILE}: bulkCallPreview() is not wired to the 8-char-prefix + ellipsis truncation.`);
  }
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const offenders = checkBulkCallPreviewTruncation(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    function bulkCallPreview(id) {
      if (!id) return "—";
      return entityLabel(null, id, "Record");
    }
  `;
  const fixed = fs.readFileSync(path.join(repoRoot, FILE), "utf8");

  const buggyOffenders = checkBulkCallPreviewTruncation(buggy);
  const fixedOffenders = checkBulkCallPreviewTruncation(fixed);

  if (buggyOffenders.length >= 2 && fixedOffenders.length === 0) {
    console.log("verify-audit-events-bulk-call-preview-truncation selftest OK");
    process.exit(0);
  }
  console.error("verify-audit-events-bulk-call-preview-truncation selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-audit-events-bulk-call-preview-truncation FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-audit-events-bulk-call-preview-truncation OK — bulkCallPreview() shows a short id preview, never entityLabel's not-visible tombstone",
  );
}
