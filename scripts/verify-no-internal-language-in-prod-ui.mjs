#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const targetRoot = path.join(repoRoot, "apps/frontend/src");
const selfPath = path.resolve(repoRoot, "scripts/verify-no-internal-language-in-prod-ui.mjs");

// Documented exceptions:
// - api/identity.ts: API contract action_code values that must preserve backend workflow identifiers.
// - types/api.ts: Type literals mirroring backend workflow codes; not user-facing UI copy.
const IGNORED_FILES = [
  "apps/frontend/src/api/identity.ts",
  "apps/frontend/src/types/api.ts",
].map((relativePath) => path.resolve(repoRoot, relativePath).replace(/\\/g, "/"));

const forbiddenTerms = [
  "BLOCK 0",
  "WF-0",
  "FOUNDATION",
  "qbo_archive",
  "rebuild +",
  "triage band",
  "stub allowed",
  "after Block",
  "Uses vendor bills API today",
  "Read-only foundation",
  "once write flow is enabled",
  "Production data import (admin)",
  "(admin)",
];

// RATECON-2: internal build-cycle language must never reach prod UI copy (e.g. the retired
// "Uploaded — OCR parsing in cycle 4" rate-con stub). Regex-matched so any "cycle <n>" /
// "coming in cycle" phrasing fails, not just one literal string.
const forbiddenPatterns = [
  { re: /cycle\s+\d/i, label: "cycle <n>" },
  { re: /coming in cycle/i, label: "coming in cycle" },
];

// Operator copy must describe records and workflows, not expose physical schema.table names.
// These exact pre-existing protected-lane instances are separately OPEN on GUARD-WORKORDERS;
// this baseline is a ratchet (no new file/token pair may appear) and shrinks as their owner fixes them.
const VISIBLE_SCHEMA_BASELINE = new Set([
  "apps/frontend/src/components/accounting/VendorBillForm.tsx::accounting.bill_lines",
  "apps/frontend/src/pages/banking/BankingHome.tsx::views.banking_account_tiles",
  "apps/frontend/src/pages/banking/BankingHome.tsx::accounting.factoring_advances",
  "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx::documents.attachments",
  "apps/frontend/src/pages/factoring/FactoringHome.tsx::factoring.factor",
  // QBO system explanation is outside the USMCA TMS-native sprint; do not expand this exception.
  "apps/frontend/src/pages/system/SystemModulePage.tsx::accounting.bills",
]);

export function visibleSchemaNames(source, relativePath) {
  const matches = [];
  const elementRe = /<(?:code|span)\b[^>]*>\s*([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)\s*<\/(?:code|span)>/g;
  for (const match of source.matchAll(elementRe)) {
    const token = match[1];
    const key = `${relativePath}::${token}`;
    if (!VISIBLE_SCHEMA_BASELINE.has(key)) matches.push({ token, key });
  }
  return matches;
}

/**
 * CLASS RULE (added 2026-08-11) — a screen may not tell an operator to go set an internal feature
 * flag by its identifier.
 *
 * FOUND LIVE, then measured across the repo: SIX pages printed the raw flag name at the user —
 * ArApAgingPage "Enable the AR_AP_AGING_UI_ENABLED feature flag to use this report", plus
 * FixedAssetsPage, QboReconcileCapturesPage, MyAccountantPage, DailyReconPage and
 * RevenueRecognitionPage. An accountant reading that is told to change a setting they have never
 * heard of and cannot reach. FinanceHubPage already carried the correct pattern and says so in its
 * own source: "We never expose the raw internal flag name to operators."
 *
 * WHY THE EXISTING CHECK MISSED ALL SIX: `forbiddenTerms` is a hand-maintained list of specific
 * strings ("BLOCK 0", "WF-0", "FOUNDATION", …). It scanned 1530 files and passed, because nobody had
 * added these six flag names to the list — and nobody ever would, since a new flag is minted with
 * every feature. A list cannot cover a class whose members are invented weekly; only a shape can.
 *
 * PRECISION. The token is only a violation when it sits in PROSE next to the word "flag" — that is
 * the shape of copy aimed at a reader. Deliberately NOT flagged: `const FOO_ENABLED = "..."`,
 * `useFeatureFlag(FOO_ENABLED)`, imports, and comment lines, which are code and not shown to anyone.
 * Restricted to .tsx (where user copy lives) so a .ts API module's explanatory comment about a flag
 * is not swept in.
 */
// The first segment is `[A-Z][A-Z0-9]*` — one character is enough. An earlier cut required three and
// `GL_POSTING_ENABLED` walked straight through it: the regex could not start mid-token because `_` is
// a word character, so there is no \b before `POSTING`, and the two-letter `GL` prefix failed the
// {2,}. Five of the six real pages caught it, DailyReconPage did not — which is exactly how a
// near-miss detector ships looking proven.
const FLAG_IDENTIFIER_IN_COPY = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b[^<>{}\n]{0,60}?\bflags?\b/;

function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

export function flagNameLeakedToOperator(line, filePath) {
  if (!filePath.endsWith(".tsx")) return false;
  if (isCommentLine(line)) return false;
  return FLAG_IDENTIFIER_IN_COPY.test(line);
}

function isExcluded(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized === selfPath.replace(/\\/g, "/")) return true;
  if (IGNORED_FILES.includes(normalized)) return true;
  if (normalized.includes("/__tests__/")) return true;
  if (normalized.includes("/test/")) return true;
  if (normalized.includes("/tests/")) return true;
  if (/\.test\.[cm]?[jt]sx?$/.test(normalized)) return true;
  if (/\.spec\.[cm]?[jt]sx?$/.test(normalized)) return true;
  return false;
}

function walk(dirPath, out = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!absolute.endsWith(".ts") && !absolute.endsWith(".tsx")) continue;
    if (isExcluded(absolute)) continue;
    out.push(absolute);
  }
  return out;
}

if (!fs.existsSync(targetRoot)) {
  console.error(`[verify-no-internal-language-in-prod-ui] Missing target path: ${targetRoot}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const good = visibleSchemaNames("<p>Recorded work-order parts.</p>", "apps/frontend/src/pages/example.tsx");
  const bad = visibleSchemaNames("<code>maintenance.parts_purchases</code>", "apps/frontend/src/pages/example.tsx");
  const protectedExisting = visibleSchemaNames(
    '<code className="text-xs">accounting.bill_lines</code>',
    "apps/frontend/src/components/accounting/VendorBillForm.tsx",
  );
  if (good.length !== 0 || bad.length !== 1 || bad[0]?.token !== "maintenance.parts_purchases" || protectedExisting.length !== 0) {
    console.error("[verify-no-internal-language-in-prod-ui] SELFTEST FAILED — visible schema-name mutation escaped");
    process.exit(1);
  }
  console.log("[verify-no-internal-language-in-prod-ui] SELFTEST PASS — visible schema-name mutation rejected; exact protected baseline honored");
  process.exit(0);
}

const violations = [];
const files = walk(targetRoot);
for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  const relativeFile = path.relative(repoRoot, file).replace(/\\/g, "/");
  for (const leak of visibleSchemaNames(content, relativeFile)) {
    violations.push({
      file: relativeFile,
      line: content.slice(0, content.indexOf(leak.token)).split(/\r?\n/).length,
      term: "internal schema.table name shown to the operator",
      text: leak.token,
    });
  }
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const term of forbiddenTerms) {
      if (line.includes(term)) {
        violations.push({
          file: path.relative(repoRoot, file),
          line: i + 1,
          term,
          text: line.trim(),
        });
      }
    }
    if (flagNameLeakedToOperator(line, file)) {
      violations.push({
        file: path.relative(repoRoot, file),
        line: i + 1,
        term: "internal feature-flag name shown to the operator",
        text: line.trim(),
      });
    }
    for (const { re, label } of forbiddenPatterns) {
      if (re.test(line)) {
        violations.push({
          file: path.relative(repoRoot, file),
          line: i + 1,
          term: label,
          text: line.trim(),
        });
      }
    }
  }
}

if (violations.length) {
  console.error("[verify-no-internal-language-in-prod-ui] Forbidden internal language found:");
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} [${violation.term}] ${violation.text}`);
  }
  process.exit(1);
}

console.log(`[verify-no-internal-language-in-prod-ui] OK (${files.length} files scanned)`);
