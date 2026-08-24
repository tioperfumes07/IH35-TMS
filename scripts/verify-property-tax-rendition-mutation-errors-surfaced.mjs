#!/usr/bin/env node
/**
 * verify-property-tax-rendition-mutation-errors-surfaced.mjs (COMP-F6322, verify-step 4650)
 *
 * Root cause: `apps/frontend/src/pages/compliance/PropertyTaxRenditionPage.tsx` has 6 mutations
 * across its two views (`RenditionListView`: createM, addDistrictM; `RenditionDetailView`:
 * statusM, assessedM, extensionM, addLineM) — none had `onError`, all call sites use
 * fire-and-forget `.mutate()`, and there is no app-wide default (main.tsx's QueryClient sets no
 * `mutations:` defaults). On any rejected write this was a silent no-op: no toast, no
 * explanation. `addLineM` backs the "+ Create Line" taxable-asset button — the exact feature
 * COMP-F6310 (this session) unblocked the picker for.
 *
 * Fix: added `onError: (err) => pushToast(userFacingApiError(err, "..."), "error")` to all 6.
 *
 * Usage:
 *   node scripts/verify-property-tax-rendition-mutation-errors-surfaced.mjs            # scan
 *   node scripts/verify-property-tax-rendition-mutation-errors-surfaced.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/frontend/src/pages/compliance/PropertyTaxRenditionPage.tsx";

const IMPORTS_TOAST_RE = /import\s*\{\s*useToast\s*\}\s*from\s*["']\.\.\/\.\.\/components\/Toast["']/;
const IMPORTS_ERROR_HELPER_RE = /import\s*\{[^}]*\buserFacingApiError\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/lib\/api-error-message["']/;
const MUTATIONS = ["createM", "addDistrictM", "statusM", "assessedM", "extensionM", "addLineM"];

function extractMutationBlock(src, mutationName) {
  const startRe = new RegExp(`const ${mutationName} = useMutation\\(\\{`);
  const m = startRe.exec(src);
  if (!m) return null;
  const closeIdx = src.indexOf("\n  });", m.index);
  if (closeIdx === -1) return null;
  return src.slice(m.index, closeIdx);
}

export function checkPropertyTaxRenditionMutationErrors(src) {
  const offenders = [];
  if (!IMPORTS_TOAST_RE.test(src)) {
    offenders.push(`${FILE}: does not import useToast — COMP-F6322 regression.`);
  }
  if (!IMPORTS_ERROR_HELPER_RE.test(src)) {
    offenders.push(`${FILE}: does not import userFacingApiError from ../../lib/api-error-message — COMP-F6322 regression.`);
  }
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
  const offenders = checkPropertyTaxRenditionMutationErrors(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const createM = useMutation({
      mutationFn: () => createRendition(companyId, {}),
      onSuccess: () => {},
    });
    const addDistrictM = useMutation({
      mutationFn: () => createAppraisalDistrict(companyId, {}),
      onSuccess: () => {},
    });
    const statusM = useMutation({
      mutationFn: (status) => updateRendition(companyId, renditionId, { status }),
      onSuccess: invalidate,
    });
    const assessedM = useMutation({
      mutationFn: (cents) => updateRendition(companyId, renditionId, { assessed_tax_cents: cents }),
      onSuccess: invalidate,
    });
    const extensionM = useMutation({
      mutationFn: (requested) => updateRendition(companyId, renditionId, { extension_requested: requested }),
      onSuccess: invalidate,
    });
    const addLineM = useMutation({
      mutationFn: (asset) => addRenditionLine(companyId, renditionId, {}),
      onSuccess: () => {},
    });
  `;
  const fixed = fs.readFileSync(path.join(repoRoot, FILE), "utf8");

  const buggyOffenders = checkPropertyTaxRenditionMutationErrors(buggy);
  const fixedOffenders = checkPropertyTaxRenditionMutationErrors(fixed);

  if (buggyOffenders.length >= 8 && fixedOffenders.length === 0) {
    console.log("verify-property-tax-rendition-mutation-errors-surfaced selftest OK");
    process.exit(0);
  }
  console.error("verify-property-tax-rendition-mutation-errors-surfaced selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-property-tax-rendition-mutation-errors-surfaced FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-property-tax-rendition-mutation-errors-surfaced OK — all 6 PropertyTaxRenditionPage mutations surface failures via toast, never a silent no-op",
  );
}
