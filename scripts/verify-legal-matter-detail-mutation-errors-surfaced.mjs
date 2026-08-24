#!/usr/bin/env node
/**
 * verify-legal-matter-detail-mutation-errors-surfaced.mjs (LEGAL-F6331, verify-step 5010)
 *
 * Root cause: `apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx` (mounted at
 * `/legal/matters/:id`) has 6 mutations — `addEventMut` (Add Note), `addDlMut` (Add Deadline),
 * `closeMut` (Close Matter), `completeDlMut` (Complete Deadline), `uploadMut` (Upload Document),
 * and `updateMut` (Edit Matter) — 5 of them had NO `onError`, all call sites used fire-and-forget
 * `.mutate()`. The 6th, `updateMut`, already correctly wires
 * `onError: pushToast(userFacingApiError(...), "error")` — both helpers already imported. On a
 * rejected note/deadline/close/upload write this was a silent no-op.
 *
 * Fix: added `onError: (err) => pushToast(userFacingApiError(err, "..."), "error")` to all 5.
 *
 * Usage:
 *   node scripts/verify-legal-matter-detail-mutation-errors-surfaced.mjs            # scan
 *   node scripts/verify-legal-matter-detail-mutation-errors-surfaced.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx";

const MUTATIONS = ["addEventMut", "addDlMut", "closeMut", "completeDlMut", "uploadMut"];

function extractMutationBlock(src, mutationName) {
  const startRe = new RegExp(`const ${mutationName} = useMutation\\(\\{`);
  const m = startRe.exec(src);
  if (!m) return null;
  const closeIdx = src.indexOf("\n  });", m.index);
  if (closeIdx === -1) return null;
  return src.slice(m.index, closeIdx);
}

export function checkLegalMatterDetailMutationErrors(src) {
  const offenders = [];
  for (const name of MUTATIONS) {
    const block = extractMutationBlock(src, name);
    if (!block || !/onError:/.test(block)) {
      offenders.push(`${FILE}: ${name} has no onError — a rejected write will silently do nothing again.`);
    }
  }
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const offenders = checkLegalMatterDetailMutationErrors(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const addEventMut = useMutation({
      mutationFn: () => legalMattersApi.addEvent(companyId, id, {}),
      onSuccess: () => { invalidate(); },
    });
    const addDlMut = useMutation({
      mutationFn: () => legalMattersApi.addDeadline(companyId, id, {}),
      onSuccess: () => { invalidate(); },
    });
    const closeMut = useMutation({
      mutationFn: () => legalMattersApi.close(companyId, id, {}),
      onSuccess: invalidate,
    });
    const completeDlMut = useMutation({
      mutationFn: (deadlineId) => legalMattersApi.completeDeadline(companyId, id, deadlineId),
      onSuccess: invalidate,
    });
    const uploadMut = useMutation({
      mutationFn: async () => uploadMatterDocument(companyId, id, docFile, docTitle, false),
      onSuccess: () => { invalidate(); },
    });
  `;
  const fixed = fs.readFileSync(path.join(repoRoot, FILE), "utf8");

  const buggyOffenders = checkLegalMatterDetailMutationErrors(buggy);
  const fixedOffenders = checkLegalMatterDetailMutationErrors(fixed);

  if (buggyOffenders.length >= 5 && fixedOffenders.length === 0) {
    console.log("verify-legal-matter-detail-mutation-errors-surfaced selftest OK");
    process.exit(0);
  }
  console.error("verify-legal-matter-detail-mutation-errors-surfaced selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-legal-matter-detail-mutation-errors-surfaced FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-legal-matter-detail-mutation-errors-surfaced OK — all 5 LegalMatterDetailPage write mutations surface failures via toast, never a silent no-op",
  );
}
