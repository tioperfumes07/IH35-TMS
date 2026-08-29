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

  // 2. The Email and Mark-uploaded button handlers must each carry a .catch() after their .then(),
  // and it must land BETWEEN that button's own emitting call and its own JSX label -- not merely
  // exist somewhere later in the file (a naive regex with [\s\S]*? can "find" the OTHER button's
  // .catch() and false-pass). Ordering via indexOf sidesteps that cross-block match entirely.
  const emailCallIdx = src.drawer.indexOf("emailed_at: new Date().toISOString(),");
  const emailCatchIdx = src.drawer.indexOf('"Could not mark package as emailed"');
  const emailLabelIdx = src.drawer.indexOf("Email package");
  if (
    emailCallIdx === -1 ||
    emailCatchIdx === -1 ||
    emailLabelIdx === -1 ||
    !(emailCallIdx < emailCatchIdx && emailCatchIdx < emailLabelIdx)
  ) {
    failures.push(
      `${FILES.drawer}: the Email package button's persistPackageMeta call must carry a .catch() ` +
        `after .then(), landing before the button's own JSX label`,
    );
  }

  const uploadedCallIdx = src.drawer.indexOf("uploaded_at: new Date().toISOString(),");
  const uploadedCatchIdx = src.drawer.indexOf('"Could not mark package as uploaded"');
  const uploadedLabelIdx = src.drawer.indexOf("Mark uploaded");
  if (
    uploadedCallIdx === -1 ||
    uploadedCatchIdx === -1 ||
    uploadedLabelIdx === -1 ||
    !(uploadedCallIdx < uploadedCatchIdx && uploadedCatchIdx < uploadedLabelIdx)
  ) {
    failures.push(
      `${FILES.drawer}: the Mark-uploaded button's persistPackageMeta call must carry a .catch() ` +
        `after .then(), landing before the button's own JSX label`,
    );
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

  // Mutation 2: drop the .catch() from the Email button (the exact pre-fix shape).
  const droppedEmailCatch = {
    drawer: good.drawer.replace(
      `          void persistPackageMeta({
                            ...packageState.meta,
                            emailed_at: new Date().toISOString(),
                          })
                            .then(() => pushToast("Marked as emailed to factoring company", "success"))
                            .catch((error) => pushToast(userFacingApiError(error, "Could not mark package as emailed"), "error"))`,
      `          void persistPackageMeta({
                            ...packageState.meta,
                            emailed_at: new Date().toISOString(),
                          }).then(() => pushToast("Marked as emailed to factoring company", "success"))`,
    ),
  };
  if (droppedEmailCatch.drawer === good.drawer) {
    console.error(`${LABEL} SELFTEST FAIL — dropped-email-catch pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(droppedEmailCatch).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — dropped Email-button .catch() regression escaped`);
    process.exit(1);
  }

  // Mutation 3: drop the .catch() from the Mark-uploaded button (the exact pre-fix shape).
  const droppedUploadedCatch = {
    drawer: good.drawer.replace(
      `          void persistPackageMeta({
                            ...packageState.meta,
                            uploaded_at: new Date().toISOString(),
                          })
                            .then(() => pushToast("Marked as uploaded to factoring portal", "success"))
                            .catch((error) => pushToast(userFacingApiError(error, "Could not mark package as uploaded"), "error"))`,
      `          void persistPackageMeta({
                            ...packageState.meta,
                            uploaded_at: new Date().toISOString(),
                          }).then(() => pushToast("Marked as uploaded to factoring portal", "success"))`,
    ),
  };
  if (droppedUploadedCatch.drawer === good.drawer) {
    console.error(`${LABEL} SELFTEST FAIL — dropped-uploaded-catch pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(droppedUploadedCatch).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — dropped Mark-uploaded-button .catch() regression escaped`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS — 3 mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — all 4 factoring-package metadata call sites disclose persistence failure`);
