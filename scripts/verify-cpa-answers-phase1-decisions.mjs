#!/usr/bin/env node
/**
 * CPA Answers Integration — Phase 1 (docs/governance) guard.
 *
 * Rule 17: auto-discovered via scripts/verify-steps/910-verify-cpa-answers-phase1-decisions.mjs.
 * Do NOT wire through package.json / locked-guards.yml / ci.yml.
 *
 * FAILS when any canonical decision doc:
 *   1. Still claims revenue is recognized at invoice-create (stale wording), OR
 *   2. Is missing required Phase-1 sanitized decision anchors (Faro mechanics, dual-basis, ASC,
 *      operational delivery definition), OR
 *   3. Affirmatively frames Ch.11 as ASC 852 "fresh-start" accounting, OR
 *   4. Skill/reference lose historical SoR dates (12/31/2025 / 2026-01-01) or either default-OFF
 *      kill-switch (IMPORT-P0/P0b or QBO_JE_PUSH_ENABLED / QBO_ENTITY_PUSH_ENABLED), OR
 *   5. (sanitized surfaces only) Contains forbidden private-source / PII patterns.
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
  "docs/trackers/FINANCIAL-OWNER-UNBLOCK-PACKET.md",
];

/** Sanitized decision surfaces — must stay free of private-source / PII patterns. */
const SANITIZED_DOCS = new Set([
  ".claude/skills/ih35-cpa-accounting-decisions/SKILL.md",
  ".claude/skills/ih35-cpa-accounting-decisions/resources/locked-decisions-reference.md",
  "docs/specs/TMS-QBO-PARALLEL-BOOKS.md",
  "docs/specs/ACCOUNTING-ARCHITECTURE.md",
]);

/** Docs that must carry the full Phase-1 Faro / dual-basis / delivery lock text. */
const FULL_LOCK_DOCS = [
  ".claude/skills/ih35-cpa-accounting-decisions/SKILL.md",
  ".claude/skills/ih35-cpa-accounting-decisions/resources/locked-decisions-reference.md",
  "docs/specs/TMS-QBO-PARALLEL-BOOKS.md",
  "docs/specs/ACCOUNTING-ARCHITECTURE.md",
  "docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md",
];

const STALE_RECOGNITION_PATTERNS = [
  /recognized at\s+\*{0,2}invoice-create\*{0,2}/i,
  /recognition\s*\|\s*at\s+\*{0,2}invoice-create\*{0,2}/i,
  /revenue recognized at\s+\*{0,2}invoice[- ]create\*{0,2}/i,
  /at\s+\*{0,2}invoice-create\*{0,2}\s*\(pickup/i,
];

/** Affirmative ASC 852 framing — "NOT ASC 852 fresh-start accounting" is allowed. */
const AFFIRMATIVE_FRESH_START_PATTERNS = [
  /Ch\.11\s+FRESH-START/i,
  /\bis the fresh-start line\b/i,
  /fresh-start line\s*\(owner/i,
  /Ch\.11 fresh-start line/i,
];

const REQUIRED_ANCHORS = [
  "canonical load delivery",
  "billing/factoring readiness",
  "final active delivery stop",
  "actual departure",
  "delivered_at",
  "TMS ACCRUAL",
  "cash-basis",
  "does **not** redefine cash recognition",
  "ASC 470-60",
  "NOT ASC 852",
  "$1,000,000",
  "of Net at funding",
  "1.5%",
  "2%",
  "Purchase Price = Net",
  "transaction/wire fees",
  "after day 35",
  "0.067%",
  "pledged collateral",
  "Factoring Advance",
  "no A/R derecognition",
  "Substance-over-form",
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

    if (FULL_LOCK_DOCS.includes(rel)) {
      for (const pattern of AFFIRMATIVE_FRESH_START_PATTERNS) {
        if (pattern.test(source)) {
          failures.push(
            `${rel}: affirmative fresh-start framing matched /${pattern.source}/ — use ASC 470-60 debt restructuring — NOT ASC 852 fresh-start accounting`
          );
        }
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

  const fullLockJoined = docs
    .filter(([rel]) => FULL_LOCK_DOCS.includes(rel))
    .map(([, source]) => source ?? "")
    .join("\n");
  for (const anchor of REQUIRED_ANCHORS) {
    if (!fullLockJoined.includes(anchor)) {
      failures.push(`Phase-1 lock docs missing required anchor: "${anchor}"`);
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
    if (!source.includes("of Net at funding")) {
      failures.push(`${rel}: must state Faro fees are of Net at funding`);
    }
    if (!source.includes("ASC 470-60")) {
      failures.push(`${rel}: must state ASC 470-60 (not ASC 852 fresh-start accounting)`);
    }
    if (!/TMS ACCRUAL/i.test(source)) {
      failures.push(`${rel}: must state TMS ACCRUAL recognition at delivery`);
    }
    if (/recognized at\s+\*{0,2}invoice-create\*{0,2}/i.test(source)) {
      failures.push(`${rel}: must not claim recognition at invoice-create`);
    }

    // Primary agent-loaded SoR / kill-switch controls (must not regress out of skill + reference).
    if (!source.includes("12/31/2025")) {
      failures.push(`${rel}: must preserve historical QBO SoR date 12/31/2025`);
    }
    if (!source.includes("2026-01-01")) {
      failures.push(`${rel}: must preserve TMS ledger authority date 2026-01-01`);
    }
    const hasImportP0 = /IMPORT-P0\b/.test(source) && /IMPORT-P0b\b/.test(source);
    const hasJeKill = source.includes("QBO_JE_PUSH_ENABLED");
    const hasEntityKill = source.includes("QBO_ENTITY_PUSH_ENABLED");
    if (!hasImportP0 && !(hasJeKill && hasEntityKill)) {
      failures.push(
        `${rel}: must preserve default-OFF kill-switches (IMPORT-P0/IMPORT-P0b or QBO_JE_PUSH_ENABLED + QBO_ENTITY_PUSH_ENABLED)`
      );
    }
    if (hasJeKill && !hasEntityKill) {
      failures.push(`${rel}: missing QBO_ENTITY_PUSH_ENABLED kill-switch (both JE + entity required)`);
    }
    if (hasEntityKill && !hasJeKill) {
      failures.push(`${rel}: missing QBO_JE_PUSH_ENABLED kill-switch (both JE + entity required)`);
    }
    if (hasImportP0) {
      // When IMPORT-P0 labels are present, also require the mapped env keys so agents see both forms.
      if (!hasJeKill || !hasEntityKill) {
        failures.push(
          `${rel}: IMPORT-P0/P0b present but mapped QBO_JE_PUSH_ENABLED / QBO_ENTITY_PUSH_ENABLED missing`
        );
      }
    }
  }

  const unblock = docs.find(([rel]) => rel === "docs/trackers/FINANCIAL-OWNER-UNBLOCK-PACKET.md")?.[1] ?? "";
  if (/Revenue recognized at invoice-create/i.test(unblock)) {
    failures.push(
      "docs/trackers/FINANCIAL-OWNER-UNBLOCK-PACKET.md: stale invoice-create recognition line must be corrected"
    );
  }
  if (!unblock.includes("canonical load delivery")) {
    failures.push(
      "docs/trackers/FINANCIAL-OWNER-UNBLOCK-PACKET.md: must state canonical load delivery recognition"
    );
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
      .replaceAll("canonical load delivery", "INVOICE_CREATE_PLACEHOLDER")
      .replaceAll("of Net at funding", "OF_GROSS_REMOVED")
      .replaceAll("ASC 470-60", "ASC_REMOVED")
      .replaceAll("Purchase Price = Net", "PURCHASE_PRICE_REMOVED")
      .replaceAll("after day 35", "DAY35_REMOVED")
      .replaceAll("TMS ACCRUAL", "ACCRUAL_REMOVED")
      .replaceAll("Substance-over-form", "SUBSTANCE_REMOVED")
      .replaceAll("final active delivery stop", "DELIVERY_STOP_REMOVED")
      .replaceAll("pledged collateral", "PLEDGE_REMOVED")
      .replaceAll("no A/R derecognition", "DEREC_REMOVED")
      .replaceAll("billing/factoring readiness", "READY_REMOVED")
      .replaceAll("does **not** redefine cash recognition", "CASH_CROSSWALK_REMOVED")
      .replaceAll("12/31/2025", "SOR_QBO_DATE_REMOVED")
      .replaceAll("2026-01-01", "SOR_TMS_DATE_REMOVED")
      .replaceAll("IMPORT-P0b", "IMPORT_P0B_REMOVED")
      .replaceAll("IMPORT-P0", "IMPORT_P0_REMOVED")
      .replaceAll("QBO_JE_PUSH_ENABLED", "JE_KILL_REMOVED")
      .replaceAll("QBO_ENTITY_PUSH_ENABLED", "ENTITY_KILL_REMOVED");

  return goodFixture.map(([rel, source]) => {
    if (FULL_LOCK_DOCS.includes(rel)) {
      let planted = stripAnchors(source);
      if (rel.endsWith("SKILL.md")) {
        planted +=
          "\nRevenue recognized at **invoice-create** (pickup → delivery).\n" +
          "Ch.11 fresh-start line (owner-final)\n" +
          "personal guaranty of the obligor\n";
      }
      return [rel, planted];
    }
    if (rel === "docs/trackers/FINANCIAL-OWNER-UNBLOCK-PACKET.md") {
      return [
        rel,
        (source ?? "").replace(
          /Revenue recognized at \*\*canonical load delivery\*\*[^\n]*/,
          "Revenue recognized at invoice-create (pickup→delivery); \"Sales of Service\" / Line Haul subs."
        ),
      ];
    }
    return [rel, source];
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
    "of Net at funding",
    "ASC 470-60",
    "Purchase Price = Net",
    "after day 35",
    "TMS ACCRUAL",
    "affirmative fresh-start",
    "FINANCIAL-OWNER-UNBLOCK-PACKET.md",
    "12/31/2025",
    "2026-01-01",
    "kill-switch",
  ],
});
