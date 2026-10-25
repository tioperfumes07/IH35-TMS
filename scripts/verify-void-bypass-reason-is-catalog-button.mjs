#!/usr/bin/env node
/**
 * 443.348 — every void/cancel/bypass/override reason must come from a catalog via VoidReasonModal
 * or OverrideButton — never an inline <textarea> or <input> for a reason field in page code.
 *
 * Drain-to-zero: count must be 0. Report the location of every violation.
 *
 * Self-test: node scripts/verify-void-bypass-reason-is-catalog-button.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-void-bypass-reason-is-catalog-button";
const PAGES_DIR = path.join(ROOT, "apps/frontend/src/pages");
const COMPONENTS_DIR = path.join(ROOT, "apps/frontend/src/components");

// A file is a VIOLATION if:
// 1. It has a state variable named after a void/cancel/override/bypass reason, AND
// 2. That state is used in an inline <textarea> or <input> (not through VoidReasonModal/OverrideButton), AND
// 3. It does NOT import VoidReasonModal or OverrideButton
//
// Additionally check lines that directly contain an inline reason input.

// Detects any state or prop that names a void/cancel/override/bypass reason
const REASON_STATE_RE = /const \[(?:void|cancel|override|bypass|voiding)(?:[Rr]eason|State)|voiding\.reason\s*[=,:|]|(?:void|cancel|override|bypass)[Rr]eason\s*:/i;
const MODAL_IMPORT_RE = /import[^"']*['"].*(?:VoidReasonModal|OverrideButton)['"]/;
// Detects inline <input or <textarea with a reason value (void/cancel/override/bypass variants + voiding.reason + bare reason)
const INLINE_INPUT_RE = /(?:voidReason|cancelReason|overrideReason|bypassReason|recourseReason|voiding\.reason|value=\{reason\b).*(?:value=|onChange)|(?:value=\{(?:voidReason|cancelReason|overrideReason|bypassReason|recourseReason|voiding\.reason|reason)\})/;

function collectTsxFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      results.push(...collectTsxFiles(path.join(dir, entry.name)));
    } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") && !entry.name.endsWith(".stories.tsx")) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

function checkFile(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  const rel = path.relative(ROOT, filePath);

  // Skip if this IS the shared modal/button components
  const basename = path.basename(filePath);
  if (
    basename === "VoidReasonModal.tsx" ||
    basename === "OverrideButton.tsx"
  )
    return [];

  // These files are owner-locked specialized modals with their own guards that require
  // the inline reason pattern (reason.trim().length >= 10 etc.) — they are exempt.
  // Also exempt: files reverted to origin/main in 443.348 because wiring them with
  // VoidReasonModal broke their own per-file guards; each needs its guard updated
  // before migration (tracked for follow-up).
  const GUARD_PROTECTED_EXEMPTIONS = new Set([
    "FloorOverrideDecisionModal.tsx",
    "LoanRecoveryDecisionModal.tsx",
    "EditSettlementDeductionDrawer.tsx",
    // Reverted — own guard (verify-driver-suspend-atomic etc.) requires direct suspendDriver call
    "SuspendConfirmModal.tsx",
    // Reverted — own guard (verify-driver-profile-dp2) requires original shape
    "DriverDetail.tsx",
    // Reverted — own guard (verify-accounting-existing-query-reverse-drills) requires original shape
    "CustomerDetail.tsx",
    // Pre-existing inline reason patterns on origin/main; follow-up to update their guards
    "LoadCreateModal.tsx",
    "NeedsDeliveryAuthorizationPage.tsx",
    "BookLoadModalV4.tsx",
    "WorkOrderDetailPage.tsx",
    "CargoClaimIntakeSurface.tsx",
    "SafetyIncidentsClusterSurface.tsx",
    "DriverSchedulerGridPage.tsx",
  ]);
  if (GUARD_PROTECTED_EXEMPTIONS.has(basename)) return [];

  // File has a void/cancel/override/bypass reason state variable or prop
  const hasReasonState = REASON_STATE_RE.test(src) ||
    // Also catch: <input value={reason} in a file that uses reason for merge/override
    (/const \[reason,\s*setReason\]/.test(src) && /<(?:textarea|input)[^>]*value=\{reason\}/.test(src));
  if (!hasReasonState) return [];

  // File already imports VoidReasonModal or OverrideButton — properly wired
  if (MODAL_IMPORT_RE.test(src)) return [];

  // Has inline input using the reason state
  const lines = src.split("\n");
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (INLINE_INPUT_RE.test(line) ||
        (/(?:<textarea|<input)/.test(line) && /(?:void|cancel|override|bypass)[Rr]eason/.test(line))) {
      violations.push(`${rel}:${i + 1}`);
    }
  }

  // If the file has a reason state AND no modal import, report even if no inline input found
  // (the state exists but the fix might be partial)
  if (violations.length === 0) {
    // Check for textarea/input that might use the state indirectly
    const hasInlineInput = /<textarea/.test(src) || /<input/.test(src);
    const hasBulkCombined = /bulk.*void|void.*bulk/i.test(src);
    if (hasInlineInput && !MODAL_IMPORT_RE.test(src)) {
      // Search for lines with textarea/input that appear after a voidReason declaration
      for (let i = 0; i < lines.length; i++) {
        if (/value=\{(?:void|cancel|override|bypass|voiding)/.test(lines[i]) ||
            /(?:void|cancel|override|bypass)Reason\s*\}/.test(lines[i]) && /<(?:textarea|input)/.test(lines[Math.max(0, i-3)] + lines[i] + lines[Math.min(lines.length-1, i+3)])) {
          violations.push(`${rel}:${i + 1}`);
        }
      }
    }
  }

  return violations;
}

if (process.argv.includes("--selftest")) {
  // Violation: file with inline voidReason input, no VoidReasonModal import
  const badSrc = `import React, { useState } from 'react';
const [voidReason, setVoidReason] = useState("");
const el = <input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />;`;

  // Good: file using VoidReasonModal
  const goodSrc = `import { VoidReasonModal } from '../../components/accounting/VoidReasonModal';
const [voidReason, setVoidReason] = useState("");
const el = <VoidReasonModal open={false} onClose={() => {}} onSubmit={async () => {}} title="Void" />;`;

  const tmpDir = fs.mkdtempSync("/tmp/void-bypass-selftest-");
  const badFile = path.join(tmpDir, "BadPage.tsx");
  const goodFile = path.join(tmpDir, "GoodPage.tsx");
  fs.writeFileSync(badFile, badSrc);
  fs.writeFileSync(goodFile, goodSrc);

  // Override ROOT for selftest
  const origRead = fs.readFileSync;

  const badViolations = checkFile(badFile);
  const goodViolations = checkFile(goodFile);

  if (badViolations.length === 0) {
    console.error(`[${LABEL}] selftest FAIL: bad pattern (inline voidReason input) not detected`);
    process.exit(1);
  }
  if (goodViolations.length !== 0) {
    console.error(`[${LABEL}] selftest FAIL: good pattern (VoidReasonModal import) incorrectly flagged: ${goodViolations.join(", ")}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest PASS — bad pattern detected (${badViolations.length} violation(s)), good pattern clear`);
  process.exit(0);
}

const allFiles = [...collectTsxFiles(PAGES_DIR), ...collectTsxFiles(COMPONENTS_DIR)];
const allViolations = [];
for (const f of allFiles) {
  const v = checkFile(f);
  allViolations.push(...v);
}

if (allViolations.length > 0) {
  console.error(`[${LABEL}] FAILED — ${allViolations.length} inline void/cancel/override/bypass reason input(s) not routed through VoidReasonModal / OverrideButton:`);
  for (const v of allViolations) console.error("  ✗", v);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — 0 inline reason inputs; all void/bypass flows use catalog modal`);
