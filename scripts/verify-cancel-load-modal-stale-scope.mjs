#!/usr/bin/env node
/**
 * DSP-MONEY-F7112-CANCEL-LOAD-MODAL-STALE-SCOPE
 *
 * CancelLoadModal is reused across loads/companies without remounting (the parent toggles `open`,
 * it does not remount by key). Without an explicit reset, a reason/notes/billable/charge draft
 * typed for one load could silently carry into whichever load/company the modal next opens for;
 * a submit already in flight when the modal is reassigned to a different load could apply its
 * result (or a stale error) to the wrong load; and Close/backdrop/Escape could abandon an
 * in-flight cancel mid-request. This guard locks the fix in place at the source-shape level
 * (the interactive combobox test harness for this file has a pre-existing, unrelated flake this
 * session confirmed reproduces identically on an untouched origin/main copy of the file).
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const file = path.join(root, "apps/frontend/src/components/dispatch/CancelLoadModal.tsx");

export function failures(src) {
  const found = [];
  if (!/const resetKey = `\$\{operatingCompanyId\}::\$\{loadId \?\? ""\}::\$\{open \? "open" : "closed"\}`/.test(src)) {
    found.push("resetKey must key on operatingCompanyId + loadId + open transition");
  }
  if (!/lastResetKey\.current = resetKey/.test(src) || !/setReasonCode\(null\);\s*\n\s*setNotes\(""\);/.test(src)) {
    found.push("draft (reasonCode/notes/billable/charge/submitError/createdReasons) must reset on a resetKey transition");
  }
  if (!/const liveScopeRef = useRef\(\{ loadId, operatingCompanyId \}\)/.test(src)) {
    found.push("submit completion must be checked against a live scope ref, not assumed still current");
  }
  if (!/const submittedFor = \{ loadId, operatingCompanyId \}/.test(src)) {
    found.push("submit handler must snapshot which load/company the request was FOR before awaiting");
  }
  const staleGuardCount = (src.match(/liveScopeRef\.current\.loadId !== submittedFor\.loadId/g) ?? []).length;
  if (staleGuardCount < 2) {
    found.push("both the success path and the error path must discard a stale (reassigned-load) completion");
  }
  if (!/const guardedClose = \(\) => \{\s*\n\s*if \(submitting\) return;\s*\n\s*onClose\(\);/.test(src)) {
    found.push("dismissal (Modal onClose / Close button) must be locked while submitting");
  }
  if (!/<Modal open=\{open\} onClose=\{guardedClose\}/.test(src)) {
    found.push("Modal must receive the guarded close, not the raw onClose prop");
  }
  if (!/onClick=\{guardedClose\} disabled=\{submitting\}/.test(src)) {
    found.push("Close button must use the guarded close and be disabled while submitting");
  }
  return found;
}

function selftest() {
  const original = fs.readFileSync(file, "utf8");
  const baseline = failures(original);
  if (baseline.length) {
    console.error(`SELFTEST FAIL: repository already red.\n${baseline.join("\n")}`);
    process.exit(1);
  }
  const mutations = [
    ["reset key removed", original.replace('const resetKey = `${operatingCompanyId}::${loadId ?? ""}::${open ? "open" : "closed"}`;', 'const resetKey = "static";')],
    ["stale-check removed (success path)", original.replace(
      "            const stale =\n              liveScopeRef.current.loadId !== submittedFor.loadId ||\n              liveScopeRef.current.operatingCompanyId !== submittedFor.operatingCompanyId;\n            if (stale) return;\n            setReasonCode(null);",
      "            setReasonCode(null);"
    )],
    ["guardedClose bypassed on Modal", original.replace("<Modal open={open} onClose={guardedClose}", "<Modal open={open} onClose={onClose}")],
    ["Close button no longer disabled while submitting", original.replace('onClick={guardedClose} disabled={submitting}', "onClick={guardedClose}")],
  ];
  const missed = mutations.filter(([, mutated]) => failures(mutated).length === 0);
  if (missed.length) {
    console.error(`SELFTEST FAIL: ${missed.map(([name]) => name).join(", ")} not caught`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted regressions caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const src = fs.readFileSync(file, "utf8");
  const found = failures(src);
  if (found.length) {
    console.error(`FAIL: ${found.join("; ")}`);
    process.exit(1);
  }
  console.log("PASS: CancelLoadModal resets draft on load/company/open transition, discards stale-scope submit completions, and locks dismissal while submitting");
}
