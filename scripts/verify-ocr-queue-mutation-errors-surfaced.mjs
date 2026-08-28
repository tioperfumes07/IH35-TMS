#!/usr/bin/env node
/**
 * verify-ocr-queue-mutation-errors-surfaced.mjs (DISP-F6327, verify-step 4660)
 *
 * Root cause: `apps/frontend/src/pages/dispatch/OcrQueuePage.tsx` (mounted at
 * `/dispatch/ocr-queue`) has 3 write paths with zero error handling: `convertM` ("Convert to
 * load"), `reprocessM` ("Reprocess OCR") both fire-and-forget `.mutate()` with no `onError`; and
 * `finalizeOcrIntakeConversion(...)` (called from `BookLoadModal`'s `onCreated` after the load is
 * ALREADY created) did `void promise.then(...)` with no `.catch()` — a failed finalize there
 * silently left the OCR queue item unmarked as converted, a real data-consistency gap (load
 * exists, queue item looks stuck), not just a UX one. No `useToast`/`pushToast` import anywhere
 * in the file.
 *
 * Fix: added `useToast` + `onError`/`.catch()` to all 3 write paths.
 *
 * Usage:
 *   node scripts/verify-ocr-queue-mutation-errors-surfaced.mjs            # scan
 *   node scripts/verify-ocr-queue-mutation-errors-surfaced.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/frontend/src/pages/dispatch/OcrQueuePage.tsx";

const IMPORTS_TOAST_RE = /import\s*\{\s*useToast\s*\}\s*from\s*["']\.\.\/\.\.\/components\/Toast["']/;
const IMPORTS_ERROR_HELPER_RE = /import\s*\{[^}]*\buserFacingApiError\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/lib\/api-error-message["']/;
const MUTATIONS = ["convertM", "reprocessM"];
const FINALIZE_CATCH_RE = /finalizeOcrIntakeConversion\([^)]*\)\s*\)?\s*\.then\(/;
const FINALIZE_HAS_CATCH_RE = /finalizeOcrIntakeConversion[\s\S]*?\.then\([\s\S]*?\.catch\(/;

function extractMutationBlock(src, mutationName) {
  const startRe = new RegExp(`const ${mutationName} = useMutation\\(\\{`);
  const m = startRe.exec(src);
  if (!m) return null;
  const closeIdx = src.indexOf("\n  });", m.index);
  if (closeIdx === -1) return null;
  return src.slice(m.index, closeIdx);
}

export function checkOcrQueueMutationErrors(src) {
  const offenders = [];
  if (!IMPORTS_TOAST_RE.test(src)) {
    offenders.push(`${FILE}: does not import useToast — DISP-F6327 regression.`);
  }
  if (!IMPORTS_ERROR_HELPER_RE.test(src)) {
    offenders.push(`${FILE}: does not import userFacingApiError from ../../lib/api-error-message — DISP-F6327 regression.`);
  }
  for (const name of MUTATIONS) {
    const block = extractMutationBlock(src, name);
    if (!block || !/onError:/.test(block)) {
      offenders.push(`${FILE}: ${name} has no onError — a rejected write will silently do nothing again.`);
    }
  }
  if (FINALIZE_CATCH_RE.test(src) && !FINALIZE_HAS_CATCH_RE.test(src)) {
    offenders.push(`${FILE}: finalizeOcrIntakeConversion(...).then(...) has no .catch() — a rejected finalize will silently leave the queue item unmarked again.`);
  }
  if (!/convertOcrIntakeToBookLoad\(input\.itemId,\s*\{ operating_company_id: input\.companyId \}\)/.test(src)) {
    offenders.push(`${FILE}: OCR convert must submit immutable item/company variables.`);
  }
  if (!/reprocessOcrIntakeItem\(input\.itemId, input\.companyId\)/.test(src)) {
    offenders.push(`${FILE}: OCR reprocess must submit immutable item/company variables.`);
  }
  if (!/onSuccess:\s*\(res, input\)\s*=>\s*onConvert\(input\.itemId, res\.book_load_prefill, input\.companyId\)/.test(src)) {
    offenders.push(`${FILE}: OCR convert completion must retain submitted item/company ownership.`);
  }
  if (!/companyIdRef\.current !== submittedCompanyId/.test(src)) {
    offenders.push(`${FILE}: stale prior-company OCR conversion completion is not rejected.`);
  }
  if (!/setBookSource\(\{ itemId, companyId: submittedCompanyId \}\)/.test(src)) {
    offenders.push(`${FILE}: Book Load prefill must retain its OCR item/company owner.`);
  }
  if (!/operatingCompanyId=\{bookSource\?\.companyId \?\? companyId\}/.test(src)) {
    offenders.push(`${FILE}: OCR Book Load modal is not pinned to the source company.`);
  }
  if (!/finalizeOcrIntakeConversion\(bookSource\.itemId,\s*\{\s*operating_company_id: bookSource\.companyId/.test(src)) {
    offenders.push(`${FILE}: OCR finalize must use the retained source item/company.`);
  }
  if ((src.match(/disabled=\{convertM\.isPending \|\| reprocessM\.isPending\}/g) || []).length < 2) {
    offenders.push(`${FILE}: convert and reprocess actions must serialize per OCR row.`);
  }
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const offenders = checkOcrQueueMutationErrors(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const convertM = useMutation({
      mutationFn: () => convertOcrIntakeToBookLoad(item.id, { operating_company_id: companyId }),
      onSuccess: (res) => onConvert(item.id, res.book_load_prefill),
    });
    const reprocessM = useMutation({
      mutationFn: () => reprocessOcrIntakeItem(item.id, companyId),
      onSuccess: () => onReprocessed(),
    });
    void finalizeOcrIntakeConversion(bookSourceItemId, {
      operating_company_id: companyId,
      load_id: created.id,
    }).then(() => {
      setBookOpen(false);
    });
  `;
  const fixed = fs.readFileSync(path.join(repoRoot, FILE), "utf8");

  const buggyOffenders = checkOcrQueueMutationErrors(buggy);
  const fixedOffenders = checkOcrQueueMutationErrors(fixed);

  const mutations = [
    fixed.replace("companyIdRef.current !== submittedCompanyId", "false"),
    fixed.replace("operatingCompanyId={bookSource?.companyId ?? companyId}", "operatingCompanyId={companyId}"),
    fixed.replace("operating_company_id: bookSource.companyId", "operating_company_id: companyId"),
    fixed.replace("disabled={convertM.isPending || reprocessM.isPending}", "disabled={convertM.isPending}"),
  ];
  const missedMutations = mutations.filter((source) => checkOcrQueueMutationErrors(source).length === 0);

  if (buggyOffenders.length >= 5 && fixedOffenders.length === 0 && missedMutations.length === 0) {
    console.log("verify-ocr-queue-mutation-errors-surfaced selftest OK");
    process.exit(0);
  }
  console.error("verify-ocr-queue-mutation-errors-surfaced selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
    missedMutations: missedMutations.length,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-ocr-queue-mutation-errors-surfaced FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-ocr-queue-mutation-errors-surfaced OK — OcrQueuePage's convert/reprocess/finalize write paths all surface failures via toast, never a silent no-op",
  );
}
