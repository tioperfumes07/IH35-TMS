#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["factoring","connectivity"],"leaves":["dispatch.load.drawer.factoring_package.metadata_failure_disclosure"],"task":"DSP-MONEY-F7276-FACTORING-PACKAGE-METADATA-FAILURES-ARE-SILENT","vertical":"column-wave"} */
/**
 * DSP-MONEY-F7276-FACTORING-PACKAGE-METADATA-FAILURES-ARE-SILENT (CC-1, 2026-08-29):
 * LoadDetailDrawer's factoring-package actions called persistPackageMeta (the metadata writer,
 * itself an unguarded `await updateMutation.mutateAsync(...)`) with no rejection handler at any of
 * its four call sites: generateFactoringPackage awaited it directly with no try/catch; the
 * auto-generate effect called `generateFactoringPackage(true).then(...)` with no `.catch()`; the
 * manual Email and Mark-uploaded buttons each called `void persistPackageMeta(...).then(successToast)`
 * with no `.catch()`. A failed metadata PATCH (network/RLS/validation) became an unhandled promise
 * rejection with zero operator-visible failure signal or retry path -- distinct from DSP-MONEY-F7264,
 * which only fixed the popup-blocked-false-success case; a REAL popup followed by a failed
 * persistence write stayed completely silent. Root-caused live in
 * apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx. Fixed by wrapping the metadata write
 * inside generateFactoringPackage in try/catch (covering both the auto and manual Generate call
 * sites through one fix) and adding an explicit .catch() to each of the Email and Mark-uploaded
 * button handlers. This guard holds that fix so it cannot regress.
 *
 * Self-test: node scripts/verify-factoring-package-metadata-failures-caught.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  drawer: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
};
const LABEL = "verify-factoring-package-metadata-failures-caught";

export function audit(src) {
  const failures = [];

  // 1. generateFactoringPackage's own persistPackageMeta call must be try/catch-guarded.
  const fnMatch = src.drawer.match(/async function generateFactoringPackage\([\s\S]*?\n  \}/);
  if (!fnMatch) {
    failures.push(`${FILES.drawer}: generateFactoringPackage not found`);
  } else {
    const body = fnMatch[0];
    if (!/try \{\s*await persistPackageMeta\(\{[\s\S]*?\}\);\s*\} catch \(error\) \{/.test(body)) {
      failures.push(
        `${FILES.drawer}: generateFactoringPackage's persistPackageMeta call must be wrapped in ` +
          `try/catch -- an uncaught rejection here becomes an unhandled promise rejection with no ` +
          `operator-visible failure signal`,
      );
    }
  }

  // 2. EVERY other call site: the Email / Mark-uploaded buttons this guard was written for were removed with the
  //    LDT-D Documents-tab rework (ca42c9771d, 2026-09-06) and exist nowhere now, so the old position checks pinned code
  //    that is gone. The rule that matters is general: any persistPackageMeta(...) call outside its own definition must
  //    be inside a try { await ... } catch, or carry a .catch( before the statement ends — so a re-added button is held
  //    to the same standard the moment it lands.
  const callRe = /persistPackageMeta\(/g;
  let m;
  while ((m = callRe.exec(src.drawer)) !== null) {
    const before = src.drawer.slice(Math.max(0, m.index - 40), m.index);
    if (/async function\s+$/.test(before)) continue; // the definition itself
    const stmtEnd = src.drawer.indexOf(";", src.drawer.indexOf("})", m.index));
    const statement = src.drawer.slice(m.index, stmtEnd < 0 ? m.index + 600 : stmtEnd + 1);
    const guardedByTry = /try \{\s*await\s*$/.test(src.drawer.slice(Math.max(0, m.index - 60), m.index));
    if (!guardedByTry && !/\.catch\(/.test(statement)) {
      const line = src.drawer.slice(0, m.index).split("\n").length;
      failures.push(`${FILES.drawer}:${line}: persistPackageMeta call has no rejection handler (try/catch or .catch()) — a failed metadata write becomes a silent unhandled rejection`);
    }
  }

  return failures;
}

function loadSrc(root) {
  return {
    drawer: fs.readFileSync(path.join(root, FILES.drawer), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }

  // Mutation 1: drop the try/catch inside generateFactoringPackage (the exact pre-fix shape).
  const droppedGenerateCatch = {
    drawer: good.drawer.replace(
      `    try {
      await persistPackageMeta({
        generated_at: new Date().toISOString(),
        emailed_at: packageState.meta.emailed_at,
        uploaded_at: packageState.meta.uploaded_at,
        invoice_id: linkedInvoice?.id ?? null,
      });
    } catch (error) {
      if (!auto) pushToast(userFacingApiError(error, "Factoring package could not be saved"), "error");
      return;
    }`,
      `    await persistPackageMeta({
      generated_at: new Date().toISOString(),
      emailed_at: packageState.meta.emailed_at,
      uploaded_at: packageState.meta.uploaded_at,
      invoice_id: linkedInvoice?.id ?? null,
    });`,
    ),
  };
  if (droppedGenerateCatch.drawer === good.drawer) {
    console.error(`${LABEL} SELFTEST FAIL — dropped-generate-catch pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(droppedGenerateCatch).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — dropped generateFactoringPackage try/catch regression escaped`);
    process.exit(1);
  }

  // Mutation 2: a re-added button calling persistPackageMeta with .then() and no .catch() (the original pre-fix shape).
  const unguardedButton = {
    drawer: good.drawer.replace(
      "  async function openDriverInstructionsFile() {",
      "  function markEmailed() {\n    void persistPackageMeta({ ...packageState.meta, emailed_at: new Date().toISOString() }).then(() => pushToast(\"Marked as emailed\", \"success\"));\n  }\n\n  async function openDriverInstructionsFile() {",
    ),
  };
  if (unguardedButton.drawer === good.drawer) {
    console.error(`${LABEL} SELFTEST FAIL — unguarded-button plant did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(unguardedButton).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — an unguarded persistPackageMeta call escaped`);
    process.exit(1);
  }
  // Control: the same call WITH a .catch() passes.
  const guardedButton = {
    drawer: unguardedButton.drawer.replace(
      'pushToast(\"Marked as emailed\", \"success\"));',
      'pushToast(\"Marked as emailed\", \"success\")).catch((error) => pushToast(userFacingApiError(error, \"x\"), \"error\"));',
    ),
  };
  if (audit(guardedButton).length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL — a .catch()-guarded call was flagged: ${audit(guardedButton).join("; ")}`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS — 2 mutations detected, 1 control passes`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — every factoring-package metadata write discloses persistence failure (try/catch or .catch())`);
