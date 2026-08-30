#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

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
  { re: /owner[- ]gated/i, label: "owner-gated" },
];

// Operator copy must describe records and workflows, not expose physical schema.table names.
// These exact pre-existing protected-lane instances are separately OPEN on GUARD-WORKORDERS;
// this baseline is a ratchet (no new file/token pair may appear) and shrinks as their owner fixes them.
const VISIBLE_SCHEMA_BASELINE = new Set([
  // QBO system explanation is outside the USMCA TMS-native sprint; do not expand this exception.
  "apps/frontend/src/pages/system/SystemModulePage.tsx::accounting.bills",
]);

const USER_COPY_PROPS = new Set([
  "aria-label",
  "description",
  "emptyMessage",
  "helperText",
  "label",
  "placeholder",
  "title",
]);

const PHYSICAL_SCHEMA_NAMES = new Set([
  "accounting",
  "banking",
  "catalogs",
  "dispatch",
  "docs",
  "documents",
  "driver_finance",
  "factoring",
  "fuel",
  "insurance",
  "legal",
  "maintenance",
  "mdata",
  "org",
  "reporting",
  "reports",
  "safety",
]);

function visibleJsxCopySegments(source, relativePath) {
  if (!relativePath.endsWith(".tsx")) return [];
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const segments = [];
  const visit = (node) => {
    if (ts.isJsxText(node) && node.getText(sourceFile).trim()) {
      segments.push({ text: node.getText(sourceFile), pos: node.getStart(sourceFile) });
    } else if (ts.isJsxAttribute(node) && USER_COPY_PROPS.has(node.name.getText(sourceFile))) {
      const initializer = node.initializer;
      if (initializer && ts.isStringLiteral(initializer)) {
        segments.push({ text: initializer.text, pos: initializer.getStart(sourceFile) });
      } else if (
        initializer &&
        ts.isJsxExpression(initializer) &&
        initializer.expression &&
        (ts.isStringLiteral(initializer.expression) || ts.isNoSubstitutionTemplateLiteral(initializer.expression))
      ) {
        segments.push({ text: initializer.expression.text, pos: initializer.expression.getStart(sourceFile) });
      }
    } else if (
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression))
    ) {
      segments.push({ text: node.expression.text, pos: node.expression.getStart(sourceFile) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return segments;
}

export function visibleSchemaNames(source, relativePath) {
  const matches = [];
  const seen = new Set();
  for (const segment of visibleJsxCopySegments(source, relativePath)) {
    for (const tokenMatch of segment.text.matchAll(/\b([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)\b/g)) {
      const token = tokenMatch[1];
      if (!PHYSICAL_SCHEMA_NAMES.has(token.split(".", 1)[0])) continue;
      const key = `${relativePath}::${token}`;
      if (!VISIBLE_SCHEMA_BASELINE.has(key) && !seen.has(key)) {
        seen.add(key);
        matches.push({ token, key, pos: segment.pos });
      }
    }
  }
  return matches;
}

export function visibleArchitectureJargon(source, relativePath) {
  return visibleJsxCopySegments(source, relativePath)
    .filter((segment) => /\bOption-[A-Z]\b/.test(segment.text))
    .map((segment) => ({ text: segment.text.trim(), pos: segment.pos }));
}

/*
  // LV-OPERATOR-COPY-INTERNAL-MODEL-JARGON: the first guard only inspected exact <code>/<span>
  // children. A multiline <p> therefore shipped "mdata.customers" to operators while this guard
  // stayed green. Parse TSX and inspect only rendered JSX text/user-copy props; implementation
  // strings, event handlers, comments and registry metadata remain outside this presentation AST.
*/

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

// CodeQL js/redos: the previous `(?:\s|\W)*` alternation is ambiguous — \s is a strict subset of \W,
// so the engine has two overlapping ways to consume every whitespace character, causing catastrophic
// backtracking on a long run of non-matching whitespace/tabs. \W alone already covers \s; drop the
// redundant branch (same matches, no ambiguity).
const PROJECT_STATUS_IN_COPY = /(?:pending\W*(?:awaits?\s+)?backend|migration\s+\d{12})/i;

export function projectStatusLeakedToOperator(line, filePath) {
  if (!filePath.endsWith(".tsx")) return false;
  if (isCommentLine(line)) return false;
  if (line.includes("{/*") || line.includes("*/}")) return false;
  return PROJECT_STATUS_IN_COPY.test(line);
}

export function serviceLocationUsesHumanLabel(source) {
  return (
    /function\s+serviceLocationLabel\s*\(/.test(source) &&
    /SERVICE_LOCATION_LABEL\[normalized\]\s*\?\?\s*humanizeEnumLabel\(normalized\)/.test(source) &&
    /\{serviceLocationLabel\(row\.service_location\)\}/.test(source) &&
    !/\{row\.service_location\s*\|\|\s*["']unspecified["']\}/.test(source)
  );
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
  const badMultiline = visibleSchemaNames(
    "<p>Adding here writes\n  mdata.customers (same table this picker lists).</p>",
    "apps/frontend/src/pages/example.tsx",
  );
  const badDocsSchema = visibleSchemaNames(
    "<p>Uploads are stored in docs.file_links after Save.</p>",
    "apps/frontend/src/pages/example.tsx",
  );
  const protectedExisting = visibleSchemaNames(
    '<code className="text-xs">accounting.bills</code>',
    "apps/frontend/src/pages/system/SystemModulePage.tsx",
  );
  if (
    good.length !== 0 ||
    bad.length !== 1 ||
    bad[0]?.token !== "maintenance.parts_purchases" ||
    badMultiline.length !== 1 ||
    badMultiline[0]?.token !== "mdata.customers" ||
    badDocsSchema.length !== 1 ||
    badDocsSchema[0]?.token !== "docs.file_links" ||
    protectedExisting.length !== 0
  ) {
    console.error("[verify-no-internal-language-in-prod-ui] SELFTEST FAILED — visible schema-name mutation escaped");
    process.exit(1);
  }
  const architectureChecks = [
    visibleArchitectureJargon('<Section title="Terms & Option-B recommendation" />', "apps/frontend/src/pages/example.tsx").length === 1,
    visibleArchitectureJargon("<p>Option-B recommendation only: pre-fills the account.</p>", "apps/frontend/src/pages/example.tsx").length === 1,
    visibleArchitectureJargon("// Option-B implementation note", "apps/frontend/src/pages/example.tsx").length === 0,
    visibleArchitectureJargon("const value = 'Option-B implementation note';", "apps/frontend/src/pages/example.tsx").length === 0,
  ];
  if (architectureChecks.some((ok) => !ok)) {
    console.error("[verify-no-internal-language-in-prod-ui] SELFTEST FAILED — architecture-jargon mutation escaped");
    process.exit(1);
  }
  const projectStatusChecks = [
    projectStatusLeakedToOperator('<h3>QuickBooks fields — pending backend</h3>', "apps/frontend/src/pages/example.tsx"),
    projectStatusLeakedToOperator('emptyMessage="Run migration 202606080206 to seed defaults"', "apps/frontend/src/pages/example.tsx"),
    !projectStatusLeakedToOperator('// migration 202606080206 is applied by deploy', "apps/frontend/src/pages/example.tsx"),
    !projectStatusLeakedToOperator('{/* pending backend implementation note */}', "apps/frontend/src/pages/example.tsx"),
  ];
  if (projectStatusChecks.some((ok) => !ok)) {
    console.error("[verify-no-internal-language-in-prod-ui] SELFTEST FAILED — project-status copy mutation escaped");
    process.exit(1);
  }
  // LV-FINANCE-LOAN-WIZARD-STALE-OWNER-GATED-COPY: reintroducing "owner-gated" anywhere must fail.
  const ownerGatedPattern = forbiddenPatterns.find((p) => p.label === "owner-gated");
  const ownerGatedChecks = [
    ownerGatedPattern?.re.test("Preview only — posting these entries is a separate, owner-gated step (not enabled here).") === true,
    ownerGatedPattern?.re.test("(owner-gated, not here).") === true,
    ownerGatedPattern?.re.test("(owner gated, not here).") === true,
    ownerGatedPattern?.re.test("Preview only — posting these entries is a separate, disabled step (not enabled here).") === false,
  ];
  if (ownerGatedChecks.some((ok) => !ok)) {
    console.error("[verify-no-internal-language-in-prod-ui] SELFTEST FAILED — owner-gated reintroduction mutation escaped");
    process.exit(1);
  }
  const serviceLocationChecks = [
    serviceLocationUsesHumanLabel(
      'function serviceLocationLabel(value) { const normalized=value.trim(); return SERVICE_LOCATION_LABEL[normalized] ?? humanizeEnumLabel(normalized); } return <Link>{serviceLocationLabel(row.service_location)}</Link>',
    ),
    !serviceLocationUsesHumanLabel('return <Link>{row.service_location || "unspecified"}</Link>'),
  ];
  if (serviceLocationChecks.some((ok) => !ok)) {
    console.error("[verify-no-internal-language-in-prod-ui] SELFTEST FAILED — raw service-location enum mutation escaped");
    process.exit(1);
  }
  console.log("[verify-no-internal-language-in-prod-ui] SELFTEST PASS — schema names, project-status, and owner-gated-copy mutations rejected; exact protected baseline honored");
  process.exit(0);
}

const violations = [];
const files = walk(targetRoot);
for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  const relativeFile = path.relative(repoRoot, file).replace(/\\/g, "/");
  if (
    relativeFile === "apps/frontend/src/pages/maintenance/ServiceLocationPage.tsx" &&
    !serviceLocationUsesHumanLabel(content)
  ) {
    violations.push({
      file: relativeFile,
      line: 1,
      term: "raw service-location enum shown to the operator",
      text: "Service-location persisted keys must be humanized while drill URLs retain the raw filter value",
    });
  }
  for (const leak of visibleSchemaNames(content, relativeFile)) {
    violations.push({
      file: relativeFile,
      line: content.slice(0, leak.pos).split(/\r?\n/).length,
      term: "internal schema.table name shown to the operator",
      text: leak.token,
    });
  }
  for (const leak of visibleArchitectureJargon(content, relativeFile)) {
    violations.push({
      file: relativeFile,
      line: content.slice(0, leak.pos).split(/\r?\n/).length,
      term: "internal architecture-option name shown to the operator",
      text: leak.text,
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
    if (projectStatusLeakedToOperator(line, file)) {
      violations.push({
        file: path.relative(repoRoot, file),
        line: i + 1,
        term: "internal project/migration status shown to the operator",
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
