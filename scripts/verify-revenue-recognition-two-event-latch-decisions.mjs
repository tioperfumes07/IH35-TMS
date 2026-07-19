#!/usr/bin/env node
/**
 * Delivery revenue recognition — two-event latch, materiality, maker/checker, entity scope
 * (owner/CPA LOCKED 2026-07-19). Governance/docs guard only.
 *
 * Rule 17: auto-discovered via scripts/verify-steps/933-verify-revenue-recognition-two-event-latch-decisions.mjs.
 * Do NOT wire through package.json / locked-guards.yml / ci.yml.
 *
 * FAILS when either canonical decision doc:
 *   1. Is missing any of the four locked anchors (two-event-latch accounts, materiality
 *      no-permissive-default, maker/checker approval pool, TRK freight-lifecycle exclusion), OR
 *   2. Affirmatively describes a single combined POD+delivered recognition gate (the two events must
 *      stay distinct), OR
 *   3. (SKILL.md — sanitized surface) contains forbidden private-source / PII patterns.
 *
 * Pure filesystem checks — no DB, no network. Uses runExecutableGuard planted fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { runExecutableGuard } from "./guard-executable-contract.mjs";

const ROOT = process.cwd();
const LABEL = "verify-revenue-recognition-two-event-latch-decisions";

const CANONICAL_DOCS = [
  "docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md",
  ".claude/skills/ih35-cpa-accounting-decisions/SKILL.md",
];

const SANITIZED_DOCS = new Set([".claude/skills/ih35-cpa-accounting-decisions/SKILL.md"]);

const REQUIRED_ANCHORS = [
  "DR Unbilled Revenue",
  "CR Line-Haul Income",
  "delivered_pending_docs",
  "completed_docs_received",
  "DR A/R",
  "CR Unbilled",
  "no-permissive-default",
  "single-correction",
  "cumulative-for-period",
  "SOD-A",
  "Owner/Admin/Accountant",
  "TRK excluded",
  "42000-LEASE",
];

const COMBINED_GATE_PATTERNS = [
  /single\s+combined\s+POD\s*\+\s*delivered\s+recognition\s+gate\s+is\s+(?:the\s+)?(?:correct|used|locked|adopted)\b/i,
  /combine\s+POD\s+and\s+delivered\s+into\s+one\s+recognition\s+gate\b/i,
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

    for (const pattern of COMBINED_GATE_PATTERNS) {
      if (pattern.test(source)) {
        failures.push(
          `${rel}: affirmative single combined POD+delivered gate wording matched /${pattern.source}/ — the earn event and the invoice/bill gate must stay two distinct GL postings`
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
      failures.push(`revenue-recognition two-event-latch lock docs missing required anchor: "${anchor}"`);
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
  const stripAnchors = (source) =>
    (source ?? "")
      .replaceAll("DR Unbilled Revenue", "UNBILLED_REV_REMOVED")
      .replaceAll("CR Line-Haul Income", "LINE_HAUL_INCOME_REMOVED")
      .replaceAll("delivered_pending_docs", "STATUS_REMOVED")
      .replaceAll("completed_docs_received", "POD_STATUS_REMOVED")
      .replaceAll("DR A/R", "AR_REMOVED")
      .replaceAll("CR Unbilled", "CR_UNBILLED_REMOVED")
      .replaceAll("no-permissive-default", "PERMISSIVE_DEFAULT_ALLOWED")
      .replaceAll("single-correction", "SINGLE_CORRECTION_REMOVED")
      .replaceAll("cumulative-for-period", "CUMULATIVE_REMOVED")
      .replaceAll("SOD-A", "SOD_A_REMOVED")
      .replaceAll("Owner/Admin/Accountant", "APPROVAL_POOL_REMOVED")
      .replaceAll("TRK excluded", "TRK_INCLUDED")
      .replaceAll("42000-LEASE", "LEASE_ACCOUNT_REMOVED");

  return goodFixture.map(([rel, source]) => {
    let planted = stripAnchors(source);
    if (rel.endsWith("SKILL.md")) {
      planted +=
        "\nA single combined POD+delivered recognition gate is the correct model.\n" +
        "personal guaranty of the obligor\n";
    }
    return [rel, planted];
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
    "missing required anchor",
    "personal guaranty",
    "affirmative single combined POD+delivered gate",
  ],
});
