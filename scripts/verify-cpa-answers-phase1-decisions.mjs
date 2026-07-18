#!/usr/bin/env node
/**
 * CPA Answers Integration — Phase 1 (docs/governance) guard.
 *
 * Rule 17: auto-discovered via scripts/verify-steps/910-verify-cpa-answers-phase1-decisions.mjs.
 * Do NOT wire through package.json / locked-guards.yml / ci.yml.
 *
 * FAILS when any canonical decision doc:
 *   1. Still claims revenue is recognized at invoice-create (stale wording), OR
 *   2. Is missing a required Phase-1 sanitized decision anchor, OR
 *   3. (sanitized surfaces only) Contains forbidden private-source / PII patterns.
 *
 * Pure filesystem checks — no DB, no network. Uses runExecutableGuard planted fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { runExecutableGuard } from "./guard-executable-contract.mjs";

const ROOT = process.cwd();
const LABEL = "verify-cpa-answers-phase1-decisions";

const CANONICAL_DOCS = [
  ".claude/skills/ih35-cpa-accounting-decisions/SKILL.md",
  ".claude/skills/ih35-cpa-accounting-decisions/resources/locked-decisions-reference.md",
  "docs/specs/TMS-QBO-PARALLEL-BOOKS.md",
  "docs/specs/ACCOUNTING-ARCHITECTURE.md",
  "docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md",
];

const SANITIZED_DOCS = new Set([
  ".claude/skills/ih35-cpa-accounting-decisions/SKILL.md",
  ".claude/skills/ih35-cpa-accounting-decisions/resources/locked-decisions-reference.md",
  "docs/specs/TMS-QBO-PARALLEL-BOOKS.md",
  "docs/specs/ACCOUNTING-ARCHITECTURE.md",
]);

const STALE_RECOGNITION_PATTERNS = [
  /recognized at\s+\*{0,2}invoice-create\*{0,2}/i,
  /recognition\s*\|\s*at\s+\*{0,2}invoice-create\*{0,2}/i,
  /revenue recognized at\s+\*{0,2}invoice[- ]create\*{0,2}/i,
  /at\s+\*{0,2}invoice-create\*{0,2}\s*\(pickup/i,
];

const REQUIRED_ANCHORS = [
  "canonical load delivery",
  "billing readiness",
  "$1,000,000",
  "1.5%",
  "2%",
  "0.067%",
  "Accessorial Revenue",
  "Factoring Default Interest",
  "Factoring Transaction/Wire Fees",
  "Driver Damage Loss",
  "reciprocal intercompany monitoring",
  "1,368",
  "read-only consolidated reporting",
];

const FORBIDDEN_PATTERNS = [
  { re: /personal\s+guaranty/i, label: "personal guaranty text" },
  { re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, label: "email address" },
  { re: /\b(?:signed|executed)\s+(?:by|agreement)\b/i, label: "executed-agreement phrasing" },
];

function checker(docs) {
  const failures = [];

  for (const [rel, source] of docs) {
    if (typeof source !== "string") {
      failures.push(`${rel}: missing or unreadable`);
      continue;
    }

    for (const pattern of STALE_RECOGNITION_PATTERNS) {
      if (pattern.test(source)) {
        failures.push(
          `${rel}: stale revenue recognition wording matched /${pattern.source}/ — recognition is at canonical load delivery, not invoice-create`
        );
      }
    }

    if (SANITIZED_DOCS.has(rel)) {
      for (const { re, label } of FORBIDDEN_PATTERNS) {
        if (re.test(source)) {
          failures.push(`${rel}: forbidden sanitized-decision content (${label})`);
        }
      }
    }
  }

  const joined = docs.map(([, source]) => source ?? "").join("\n");
  for (const anchor of REQUIRED_ANCHORS) {
    if (!joined.includes(anchor)) {
      failures.push(`canonical decision docs missing required Phase-1 anchor: "${anchor}"`);
    }
  }

  for (const rel of [
    ".claude/skills/ih35-cpa-accounting-decisions/SKILL.md",
    ".claude/skills/ih35-cpa-accounting-decisions/resources/locked-decisions-reference.md",
  ]) {
    const entry = docs.find(([pathRel]) => pathRel === rel);
    const source = entry?.[1] ?? "";
    if (!source.includes("canonical load delivery")) {
      failures.push(`${rel}: must state revenue recognition at canonical load delivery`);
    }
    if (/recognized at\s+\*{0,2}invoice-create\*{0,2}/i.test(source)) {
      failures.push(`${rel}: must not claim recognition at invoice-create`);
    }
  }

  return failures;
}

function loadRepositoryFixture() {
  return CANONICAL_DOCS.map((rel) => {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) return [rel, null];
    return [rel, fs.readFileSync(full, "utf8")];
  });
}

function createBadFixture(goodFixture) {
  return goodFixture.map(([rel, source], idx) => {
    if (idx !== 0) return [rel, source];
    // Plant stale invoice-create recognition + personal-guaranty PII on the skill surface.
    const planted =
      `${source ?? ""}\n` +
      `Revenue recognized at **invoice-create** (pickup → delivery).\n` +
      `personal guaranty of the obligor\n`;
    return [rel, planted.replaceAll("canonical load delivery", "INVOICE_CREATE_PLACEHOLDER")];
  });
}

const goodFixture = loadRepositoryFixture();
const badFixture = createBadFixture(goodFixture);

runExecutableGuard({
  label: LABEL,
  checker,
  loadRepositoryFixture,
  goodFixture,
  badFixture,
  expectedBadViolationSubstrings: [
    "stale revenue recognition",
    "personal guaranty",
    "canonical load delivery",
  ],
});
