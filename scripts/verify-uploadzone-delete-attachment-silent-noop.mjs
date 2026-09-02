#!/usr/bin/env node
/**
 * UPLOADZONE-DELETE-ATTACHMENT-SILENT-NOOP — UploadZone Delete must not let
 * deleteAttachment() failures die silently (no try/catch / setError).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TARGET = "apps/frontend/src/components/UploadZone.tsx";
const LABEL = "verify-uploadzone-delete-attachment-silent-noop";

const DELETE_HANDLER =
  /onClick=\{async \(\) => \{[\s\S]*?deleteAttachment\([\s\S]*?\}\s*\}\s*>\s*\n\s*Delete/;

export function audit(src) {
  const problems = [];
  const match = src.match(DELETE_HANDLER);
  if (!match) {
    problems.push(`${TARGET}: Delete button handler with deleteAttachment not found`);
    return problems;
  }
  const block = match[0];
  if (!/try\s*\{/.test(block)) {
    problems.push(`${TARGET}: Delete handler must wrap deleteAttachment in try/catch`);
  }
  if (!/catch\s*\(/.test(block)) {
    problems.push(`${TARGET}: Delete handler must catch API failures`);
  }
  if (!/setError\s*\(/.test(block)) {
    problems.push(`${TARGET}: Delete catch must setError userFacingApiError (never silent)`);
  }
  if (!/userFacingApiError/.test(block)) {
    problems.push(`${TARGET}: Delete catch must use userFacingApiError`);
  }
  const silentDelete =
    /onClick=\{async \(\) => \{\s*await deleteAttachment\(row\.id, operatingCompanyId\);\s*await refreshList\(\);\s*\}\}/;
  if (silentDelete.test(src)) {
    problems.push(`${TARGET}: Delete must not use bare async onClick without try/catch`);
  }
  return problems;
}

function selftest() {
  const good = `
    onClick={async () => {
      setError(null);
      try {
        await deleteAttachment(row.id, operatingCompanyId);
        await refreshList();
      } catch (deleteError) {
        setError(\`Failed to delete \${row.filename}: \${userFacingApiError(deleteError, "Delete failed")}\`);
      }
    }}
              >
                Delete`;
  const silent = `
    onClick={async () => {
      await deleteAttachment(row.id, operatingCompanyId);
      await refreshList();
    }}>Delete`;
  const failures = [];
  if (audit(good).length) failures.push(`good fixture rejected: ${audit(good).join(" | ")}`);
  if (!audit(silent).length) failures.push("planted silent delete was not detected");
  if (failures.length) {
    failures.forEach((failure) => console.error(`  ✗ ${LABEL}: ${failure}`));
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = audit(readFileSync(join(ROOT, TARGET), "utf8"));
  if (problems.length) {
    problems.forEach((problem) => console.error(`  ✗ ${problem}`));
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — Delete surfaces API failures via setError`);
}
