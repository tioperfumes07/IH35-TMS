#!/usr/bin/env node
/** @independent-input .claude/skills/ih35-accounting-decisions/SKILL.md — cross-checks two decision surfaces. */
/**
 * Delivery revenue recognition — two-event latch (LOCKED — OWNER, 2026-07-19).
 * Governance/docs guard only.
 *
 * Rule 17: auto-discovered via
 * scripts/verify-steps/936-verify-revenue-recognition-two-event-latch-decisions.mjs
 * (renumbered off the #2732 collision that also used step 933).
 * Do NOT wire through package.json / locked-guards.yml / ci.yml.
 *
 * FAILS when either canonical decision doc:
 *   1. Is missing locked anchors (two-event latch, LIVE flag/account state,
 *      reconciliation known-item, unbilled report, boundary, materiality, maker/checker,
 *      TRK exclusion, point-in-time-as-simplification honesty), OR
 *   2. Affirmatively describes a single combined POD+delivered recognition gate, OR
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
  ".claude/skills/ih35-accounting-decisions/SKILL.md",
];

const SANITIZED_DOCS = new Set([".claude/skills/ih35-accounting-decisions/SKILL.md"]);

/** Anchors that must appear in BOTH surfaces (additions.md + skill pointer). */
const REQUIRED_ANCHORS_BOTH = [
  "DR Unbilled Revenue",
  "CR Line-Haul Income",
  "delivered_pending_docs",
  "completed_docs_received",
  "DR A/R",
  "CR Unbilled Revenue",
  "REVENUE_RECOGNITION_POST_ENABLED",
  "no permissive default",
  "single-correction",
  "cumulative-for-period",
  "SOD-A",
  "Owner/Admin/Accountant",
  "42000-LEASE",
  "TRK: EXCLUDED",
  "TMS unbilled revenue not yet in QBO",
  "KNOWN reconciling item",
  "defensible practical simplification",
  "606-10-25-27",
  // CORRECTED 2026-08-01. This guard previously REQUIRED the anchors "HARD PREREQUISITE" and
  // "before `REVENUE_RECOGNITION_POST_ENABLED` may flip", which encoded the claim that the Unbilled
  // Revenue account had to be seeded before the flag could flip and that flipping without it was a
  // runtime 500. Verified read-only on prod br-fancy-credit-akjnd07a 2026-08-01, ALL OF THAT IS
  // FALSE: the flag is already ON for TRANSP + USMCA via per-entity lib.feature_flag_overrides (set
  // 2026-07-26, TRK OFF) and the account already EXISTS (TRANSP 1240, USMCA 1150) with its CoA roles
  // bound. The guard was therefore holding a false premise IN PLACE and failing any PR that
  // corrected it — which is why this drift kept resurfacing every session. The anchors below now pin
  // the VERIFIED-TRUE state instead, so the correction is what cannot regress.
  "lib.feature_flag_overrides",
  "EXISTS and is postable",
  "Unbilled Revenue report",
  "mdata.loads",
  "SSP allocation",
  "over-transit",
  "point-in-time at delivery",
];

/** Extra anchors required only in the full additions lock. */
const REQUIRED_ANCHORS_ADDITIONS_ONLY = [
  "Not claimed as the only correct method",
  "VERIFIED-FINANCIAL-STATE-OF-RECORD-2026-08-01.md",
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
          `${rel}: affirmative single combined POD+delivered gate wording matched /${pattern.source}/ — earn and bill gates must stay two distinct GL postings`
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

    for (const anchor of REQUIRED_ANCHORS_BOTH) {
      if (!source.includes(anchor)) {
        failures.push(`${rel}: missing locked anchor ${JSON.stringify(anchor)}`);
      }
    }

    if (rel === "docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md") {
      for (const anchor of REQUIRED_ANCHORS_ADDITIONS_ONLY) {
        if (!source.includes(anchor)) {
          failures.push(`${rel}: missing locked anchor ${JSON.stringify(anchor)}`);
        }
      }
      if (!/Not claimed as the only correct method/i.test(source)) {
        failures.push(
          `${rel}: missing honesty that point-in-time is not claimed as the only correct ASC 606 method`
        );
      }
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
      .replaceAll("VERIFIED-FINANCIAL-STATE-OF-RECORD-2026-08-01.md", "STATE_OF_RECORD_REMOVED")
      .replaceAll("Not claimed as the only correct method", "HONESTY_REMOVED")
      .replaceAll("DR Unbilled Revenue", "UNBILLED_REV_REMOVED")
      .replaceAll("CR Line-Haul Income", "LINE_HAUL_INCOME_REMOVED")
      .replaceAll("delivered_pending_docs", "STATUS_REMOVED")
      .replaceAll("completed_docs_received", "POD_STATUS_REMOVED")
      .replaceAll("DR A/R", "AR_REMOVED")
      .replaceAll("CR Unbilled Revenue", "CR_UNBILLED_REMOVED")
      .replaceAll("REVENUE_RECOGNITION_POST_ENABLED", "FLAG_REMOVED")
      .replaceAll("no permissive default", "PERMISSIVE_DEFAULT_ALLOWED")
      .replaceAll("single-correction", "SINGLE_CORRECTION_REMOVED")
      .replaceAll("cumulative-for-period", "CUMULATIVE_REMOVED")
      .replaceAll("SOD-A", "SOD_A_REMOVED")
      .replaceAll("Owner/Admin/Accountant", "APPROVAL_POOL_REMOVED")
      .replaceAll("TRK: EXCLUDED", "TRK_INCLUDED")
      .replaceAll("42000-LEASE", "LEASE_ACCOUNT_REMOVED")
      .replaceAll("TMS unbilled revenue not yet in QBO", "RECON_ITEM_REMOVED")
      .replaceAll("KNOWN reconciling item", "RECON_CLASS_REMOVED")
      .replaceAll("defensible practical simplification", "SIMPLIFICATION_REMOVED")
      .replaceAll("606-10-25-27", "ASC_REF_REMOVED")
      .replaceAll("lib.feature_flag_overrides", "OVERRIDE_TABLE_REMOVED")
      .replaceAll("EXISTS and is postable", "ACCOUNT_STATE_REMOVED")
      .replaceAll("Unbilled Revenue report", "REPORT_REMOVED")
      .replaceAll("mdata.loads", "LOADS_LINK_REMOVED")
      .replaceAll("SSP allocation", "SSP_REMOVED")
      .replaceAll("over-transit", "OVER_TRANSIT_REMOVED")
      .replaceAll("point-in-time at delivery", "PIT_REMOVED");

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
    "missing locked anchor",
    "personal guaranty",
    "affirmative single combined POD+delivered gate",
  ],
});
