#!/usr/bin/env node
/**
 * WIR-02 — driver Export PDF href must be built through resolveApiUrl, never a bare relative
 * path string. A relative href resolves against the CURRENT page's origin (app.ih35dispatch.com)
 * instead of the API's own origin (api.ih35dispatch.com) — the owner hit this live during the
 * GO-MECH-0901 walk. apps/frontend/src/components/driver-profile/ActionBar.tsx already fixed this
 * correctly (UI-01-WIRE-01, #17862, resolveApiUrl(...) wraps the /export.pdf path) — this guard
 * exists so a future edit cannot silently regress it back to a bare template-literal href.
 *
 * Static, read-only: never mutates the real file. --selftest exercises the same assertion logic
 * against fabricated in-memory source strings, not a copy of the real file on disk.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const TARGET = path.join(REPO_ROOT, "apps/frontend/src/components/driver-profile/ActionBar.tsx");

/** Pure — does this source correctly build the driver export.pdf URL through resolveApiUrl? */
export function driverExportPdfUsesResolveApiUrl(source) {
  const exportPdfLineMatch = /["'`][^"'`]*drivers\/\$\{[^}]+\}\/export\.pdf[^"'`]*["'`]/s.exec(source);
  if (!exportPdfLineMatch) {
    // Nothing to check if the export.pdf URL construction isn't present at all — a SEPARATE
    // concern (the feature disappearing) that this guard doesn't own.
    return { checked: false, ok: true };
  }
  // The export.pdf template literal must be the direct argument to resolveApiUrl(...) — check
  // that "resolveApiUrl(" is the last relevant call opener within a short lookback of the matched
  // literal's start (same statement, not just anywhere earlier in the file, which would be a
  // false pass for an unrelated resolveApiUrl call elsewhere).
  const before = source.slice(Math.max(0, exportPdfLineMatch.index - 120), exportPdfLineMatch.index);
  const wrapped = /resolveApiUrl\(\s*[\s\S]{0,40}$/.test(before);
  return { checked: true, ok: wrapped };
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  if (!fs.existsSync(TARGET)) {
    console.error(`verify-driver-export-pdf-resolves-api-url: target file missing: ${TARGET}`);
    process.exit(1);
  }
  const source = fs.readFileSync(TARGET, "utf8");
  const result = driverExportPdfUsesResolveApiUrl(source);
  if (result.checked && !result.ok) {
    console.error(
      "verify-driver-export-pdf-resolves-api-url FAILED — driver Export PDF href is a bare relative path, not wrapped in resolveApiUrl(...). This resolves against the WRONG origin in production (WIR-02)."
    );
    process.exit(1);
  }
  console.log("verify-driver-export-pdf-resolves-api-url OK — driver Export PDF href resolves through resolveApiUrl.");
}

function selftest() {
  const failures = [];

  const good = `
    const pdfUrl = resolveApiUrl(
      \`/api/v1/mdata/drivers/\${driverId}/export.pdf?operating_company_id=\${encodeURIComponent(companyId)}\`,
    );
  `;
  const r1 = driverExportPdfUsesResolveApiUrl(good);
  if (!r1.checked || !r1.ok) failures.push("must PASS when export.pdf is wrapped in resolveApiUrl(...)");

  const bad = `
    const pdfUrl = \`/api/v1/mdata/drivers/\${driverId}/export.pdf?operating_company_id=\${encodeURIComponent(companyId)}\`;
  `;
  const r2 = driverExportPdfUsesResolveApiUrl(bad);
  if (!r2.checked || r2.ok) failures.push("must FAIL when export.pdf is a bare relative template literal, not wrapped in resolveApiUrl");

  const missing = `export function ActionBar() { return null; }`;
  const r3 = driverExportPdfUsesResolveApiUrl(missing);
  if (r3.checked !== false || !r3.ok) failures.push("must not claim a violation when the export.pdf construction isn't present at all");

  if (failures.length > 0) {
    console.error("verify-driver-export-pdf-resolves-api-url SELFTEST FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-driver-export-pdf-resolves-api-url SELFTEST OK (3/3)");
}

main();
