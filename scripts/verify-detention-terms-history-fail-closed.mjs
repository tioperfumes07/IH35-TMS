#!/usr/bin/env node
/**
 * verify-detention-terms-history-fail-closed.mjs (CUST-MONEY-F6985)
 *
 * FreeTimeDetentionEditor.tsx's terms editor (money-bearing detention rate / free-time minutes /
 * currency / Save button) and its Terms History table both rendered on a bare `query.data` check.
 * React Query RETAINS `data` from the last successful fetch across a failed refetch, so a stale
 * termsQuery.data kept the full rate editor -- including the Save button -- live and editable on
 * top of values the UI had just told the user (via its own ListErrorState banner) it could not
 * confirm were current. Same class already fixed once in this file's CustomerDetail.tsx sibling
 * this session (CUST-MONEY-F6278 / WorkOrderDetailPage's postingPreviewRows).
 *
 * This guard asserts, against the REAL file, that the conditional immediately preceding the terms
 * editor's opening <div className="space-y-2..."> and the conditional immediately preceding the
 * history <ParityTable also check `!<query>.isError`, not just `.data` truthiness.
 *
 * FAIL if either render gate regresses to a bare `.data` check.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-detention-terms-history-fail-closed";
const TARGET_FILE = "apps/frontend/src/components/customers/FreeTimeDetentionEditor.tsx";

function readReal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * Injectable core: pass `src` to exercise this exact function against synthetic content; omit it
 * to check the real repo file.
 */
export function check(src) {
  const failures = [];
  const source = src != null ? src : (() => { try { return readReal(TARGET_FILE); } catch { return null; } })();
  if (source == null) return [`${TARGET_FILE} not found`];

  // Anchor on the element that follows each gate (not the first `.data` match in the file, which
  // could be a decoy) so a reordering or an unrelated `.data` reference elsewhere can't false-pass.
  const termsFormIdx = source.indexOf('className="space-y-2 text-sm"');
  if (termsFormIdx < 0) {
    failures.push(`${TARGET_FILE}: terms editor form <div> not found -- extractor may be stale`);
  } else {
    const before = source.slice(Math.max(0, termsFormIdx - 300), termsFormIdx);
    if (!/!termsQuery\.isError\s*&&\s*termsQuery\.data/.test(before)) {
      failures.push(
        `${TARGET_FILE}: terms editor's render gate no longer checks !termsQuery.isError -- a failed ` +
          `refetch would show the retained rate editor (and its Save button) as if it were current`
      );
    }
  }

  const historyTableIdx = source.indexOf("<ParityTable");
  if (historyTableIdx < 0) {
    failures.push(`${TARGET_FILE}: history <ParityTable not found -- extractor may be stale`);
  } else {
    const before = source.slice(Math.max(0, historyTableIdx - 200), historyTableIdx);
    if (!/!historyQuery\.isError\s*&&\s*historyQuery\.data/.test(before)) {
      failures.push(
        `${TARGET_FILE}: history table's render gate no longer checks !historyQuery.isError -- a failed ` +
          `refetch would show retained history rows as if they were current`
      );
    }
  }

  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  const good = `
    {!termsQuery.isError && termsQuery.data ? (
      <div className="space-y-2 text-sm">terms form</div>
    ) : null}
    {!historyQuery.isError && historyQuery.data ? (
      <ParityTable rows={historyQuery.data} />
    ) : null}
  `;
  const regressedTerms = `
    {termsQuery.data ? (
      <div className="space-y-2 text-sm">terms form</div>
    ) : null}
    {!historyQuery.isError && historyQuery.data ? (
      <ParityTable rows={historyQuery.data} />
    ) : null}
  `;
  const regressedHistory = `
    {!termsQuery.isError && termsQuery.data ? (
      <div className="space-y-2 text-sm">terms form</div>
    ) : null}
    {historyQuery.data ? (
      <ParityTable rows={historyQuery.data} />
    ) : null}
  `;

  const checks = [
    ["fully-fixed shape produces zero failures", check(good).length === 0],
    ["terms editor regressing to a bare .data check is caught", check(regressedTerms).some((f) => f.includes("terms editor's render gate"))],
    ["history table regressing to a bare .data check is caught", check(regressedHistory).some((f) => f.includes("history table's render gate"))],
    ["real repo file currently satisfies this guard (no args = real file)", check().length === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = check();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — detention terms editor and terms history both fail closed on a failed refetch, never showing retained money-bearing data as current`);
}
