#!/usr/bin/env node
/**
 * verify-wo-posting-preview-fails-closed.mjs (MAINT-MONEY-F7012-WO-POSTING-PREVIEW-FAILED-REFETCH-RENDERS-CACHED-GL)
 *
 * WorkOrderDetailPage renders an "unavailable" banner when getWorkOrderPostingPreview's query
 * (`previewQ`) errors, but React Query retains the prior successful `data` under the same query
 * key across a failed refetch — so a SEPARATE render block keyed only on `previewQ.data` (not on
 * `isError`) can render simultaneously with that banner, showing a stale cached total, currency,
 * line count, and DR/CR preview lines as though they were current GL. `postingPreviewRows` (the
 * memo feeding the preview's ParityTable) has the same gap if it derives from `previewQ.data`
 * without also checking `previewQ.isError`.
 *
 * FAIL if either the render gate or the rows memo can show retained data while isError is true.
 * PASS if both are gated on !previewQ.isError.
 *
 * Self-test: --selftest.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx";
const LABEL = "verify-wo-posting-preview-fails-closed";

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

/** Text of the `const postingPreviewRows = useMemo<...>(...)` call, including its dep array. */
function postingPreviewRowsBlock(src) {
  const start = src.indexOf("const postingPreviewRows = useMemo");
  if (start < 0) return "";
  const end = src.indexOf(");", start);
  if (end < 0) return "";
  return src.slice(start, end + 2);
}

/** Text of the `{previewQ.data ? (` / `{!previewQ.isError && previewQ.data ? (` render block,
 * from the section marker up to the matching `</section>`. */
function previewSectionBlock(src) {
  const marker = 'data-testid="wo-detail-posting-preview-section"';
  const start = src.indexOf(marker);
  if (start < 0) return "";
  const end = src.indexOf("</section>", start);
  if (end < 0) return "";
  return src.slice(start, end);
}

export function check(sources) {
  const failures = [];
  const src = sources ? sources.workOrderDetail : (() => { try { return read(TARGET); } catch { return null; } })();
  if (src == null) return [`${TARGET} not found`];

  const rowsBlock = postingPreviewRowsBlock(src);
  if (!rowsBlock) {
    failures.push(`${TARGET}: postingPreviewRows useMemo not found`);
  } else if (!/previewQ\.isError/.test(rowsBlock)) {
    failures.push(
      `${TARGET}: postingPreviewRows must check previewQ.isError — otherwise it derives rows from ` +
        `React-Query-retained stale data after a failed refetch (MAINT-MONEY-F7012 regression)`
    );
  }

  const sectionBlock = previewSectionBlock(src);
  if (!sectionBlock) {
    failures.push(`${TARGET}: posting-preview section (data-testid=wo-detail-posting-preview-section) not found`);
  } else {
    // The section has THREE separate `{...previewQ.data...? (` conditionals (loading, "endpoint
    // not deployed" == null check, and the real content gate) — anchor on the one that actually
    // renders FlatFieldGrid, not just the first previewQ.data mention (a prior version of this
    // guard matched the unrelated "== null" conditional and produced a false PASS against a real
    // mutation; caught only by mutation-testing the real file, not the selftest's synthetic
    // fixtures, which never had three candidate conditionals).
    const flatFieldGridIdx = sectionBlock.indexOf("FlatFieldGrid");
    const dataGateMatches = flatFieldGridIdx < 0
      ? []
      : [...sectionBlock.slice(0, flatFieldGridIdx).matchAll(/\{([^{}]*previewQ\.data[^{}]*)\?\s*\(/g)];
    const dataGateMatch = dataGateMatches.length ? dataGateMatches[dataGateMatches.length - 1] : null;
    if (flatFieldGridIdx < 0 || !dataGateMatch) {
      failures.push(`${TARGET}: could not find the previewQ.data-gated FlatFieldGrid render block inside the posting-preview section`);
    } else if (!/previewQ\.isError/.test(dataGateMatch[1])) {
      failures.push(
        `${TARGET}: the previewQ.data render gate ("{${dataGateMatch[1].trim()} ? (") must also check ` +
          `!previewQ.isError — React Query retains the prior successful payload across a failed ` +
          `refetch, so isError can be true while data is still truthy (MAINT-MONEY-F7012 regression)`
      );
    }
  }

  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  // All three fixtures include the SAME decoy `== null` conditional the real file has (the
  // "endpoint not deployed yet" block) — this is the regression fixture for this guard's own
  // first-draft bug: a naive "first previewQ.data match" anchor matched that decoy instead of the
  // real content gate and produced a false PASS against a genuinely broken badGate mutation.
  const decoy = `{!previewQ.isLoading && !previewQ.isError && previewQ.data == null ? (<div>not deployed</div>) : null}`;
  const good = `
    const postingPreviewRows = useMemo(() => (previewQ.isError ? [] : previewQ.data?.lines ?? []).map(x => x), [previewQ.data?.lines, previewQ.isError]);
    <section data-testid="wo-detail-posting-preview-section">
      {previewQ.isError ? (<div>unavailable</div>) : null}
      ${decoy}
      {!previewQ.isError && previewQ.data ? (<div><FlatFieldGrid /></div>) : null}
    </section>
  `;
  const badRows = `
    const postingPreviewRows = useMemo(() => (previewQ.data?.lines ?? []).map(x => x), [previewQ.data?.lines]);
    <section data-testid="wo-detail-posting-preview-section">
      {previewQ.isError ? (<div>unavailable</div>) : null}
      ${decoy}
      {!previewQ.isError && previewQ.data ? (<div><FlatFieldGrid /></div>) : null}
    </section>
  `;
  const badGate = `
    const postingPreviewRows = useMemo(() => (previewQ.isError ? [] : previewQ.data?.lines ?? []).map(x => x), [previewQ.data?.lines, previewQ.isError]);
    <section data-testid="wo-detail-posting-preview-section">
      {previewQ.isError ? (<div>unavailable</div>) : null}
      ${decoy}
      {previewQ.data ? (<div><FlatFieldGrid /></div>) : null}
    </section>
  `;

  const checks = [
    ["fully wired source produces zero failures", check({ workOrderDetail: good }).length === 0],
    ["rows memo missing isError check is caught", check({ workOrderDetail: badRows }).some((f) => f.includes("postingPreviewRows must check previewQ.isError"))],
    ["render gate missing isError check is caught (the original live defect)", check({ workOrderDetail: badGate }).some((f) => f.includes("render gate"))],
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
  console.log(`${LABEL} PASS — WO posting preview fails closed on a query error, never showing retained stale GL data`);
}
