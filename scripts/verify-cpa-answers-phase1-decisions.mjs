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
 *   4. Three-layer SoR surfaces (skill, reference, PARALLEL-BOOKS, ACCOUNTING-ARCHITECTURE) lose any
 *      layer: (1) historical SoR 12/31/2025 + 2026-01-01, (2) Ch.11 OB 03/31/2026 + live 04/01/2026 +
 *      ASC 470-60 / NOT ASC 852, (3) actively maintained + reconcile-only/no write-back + IMPORT-P0/P0b
 *      kill-switches — OR affirmatively claim the 12/31 boundary is retired / QBO is indefinite sole SoT, OR
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

/**
 * Surfaces that must state the same three-layer SoR model (CPA release correction).
 * Layer 1 historical · Layer 2 Ch.11 cutover · Layer 3 dual-run validation.
 */
const THREE_LAYER_DOCS = [
  ".claude/skills/ih35-cpa-accounting-decisions/SKILL.md",
  ".claude/skills/ih35-cpa-accounting-decisions/resources/locked-decisions-reference.md",
  "docs/specs/TMS-QBO-PARALLEL-BOOKS.md",
  "docs/specs/ACCOUNTING-ARCHITECTURE.md",
];

/** Affirmative defect: treats Layer 1 12/31 boundary as currently retired (correction prose allowed). */
const AFFIRMATIVE_LAYER1_RETIRED_PATTERNS = [
  /\b(?:the\s+)?12\/31\/2025\s+(?:SoR\s+)?(?:framing|boundary|authority)[^.!?\n*]{0,40}\bis\s+retired\b/i,
  /\bhistorical\s+(?:12\/31\/2025\s+)?(?:SoR\s+)?(?:framing|boundary|authority)[^.!?\n*]{0,40}\bis\s+retired\b/i,
  /\bSoR\s+framing\s+is\s+retired\b/i,
];

/** Affirmative defect: QBO as indefinite sole SoT (negated “is not …” prose allowed). */
const AFFIRMATIVE_INDEFINITE_SOLE_PATTERNS = [
  /\bQBO\s+is\s+(?:the\s+)?indefinite\s+sole\s+(?:source|system)\s+of\s+truth\b/i,
  /\bQBO\s+(?:remains|stays)\s+(?:the\s+)?(?:indefinite\s+)?sole\s+(?:source|system)\s+of\s+truth\b/i,
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
  }

  // Three-layer SoR model — required consistently across skill, reference, PARALLEL-BOOKS, ACCOUNTING-ARCHITECTURE.
  for (const rel of THREE_LAYER_DOCS) {
    const source = docs.find(([pathRel]) => pathRel === rel)?.[1] ?? "";
    if (!source) {
      failures.push(`${rel}: missing three-layer SoR surface`);
      continue;
    }

    // Layer 1 — historical transaction authority
    if (!source.includes("12/31/2025")) {
      failures.push(`${rel}: Layer 1 missing historical QBO SoR date 12/31/2025`);
    }
    if (!source.includes("2026-01-01")) {
      failures.push(`${rel}: Layer 1 missing TMS ledger authority date 2026-01-01`);
    }

    // Layer 2 — Ch.11 operating / GL cutover
    if (!source.includes("03/31/2026")) {
      failures.push(`${rel}: Layer 2 missing opening-balance date 03/31/2026`);
    }
    if (!source.includes("04/01/2026")) {
      failures.push(`${rel}: Layer 2 missing live operating line date 04/01/2026`);
    }
    if (!source.includes("ASC 470-60")) {
      failures.push(`${rel}: Layer 2 missing ASC 470-60`);
    }
    if (!/NOT ASC 852|not ASC 852/i.test(source)) {
      failures.push(`${rel}: Layer 2 must reject ASC 852 (NOT ASC 852)`);
    }

    // Layer 3 — ongoing validation mode
    if (!/actively maintained/i.test(source)) {
      failures.push(`${rel}: Layer 3 missing QBO actively maintained comparison/filing book`);
    }
    if (!/reconcile-only|never\s+TMS→QBO\s+write-back|no write-back/i.test(source)) {
      failures.push(`${rel}: Layer 3 missing reconcile-only / never write-back control`);
    }
    const hasImportP0 = /IMPORT-P0\b/.test(source) && /IMPORT-P0b\b/.test(source);
    const hasJeKill = source.includes("QBO_JE_PUSH_ENABLED");
    const hasEntityKill = source.includes("QBO_ENTITY_PUSH_ENABLED");
    if (!hasImportP0) {
      failures.push(`${rel}: Layer 3 missing IMPORT-P0 / IMPORT-P0b kill-switch labels`);
    }
    if (!hasJeKill || !hasEntityKill) {
      failures.push(
        `${rel}: Layer 3 missing mapped QBO_JE_PUSH_ENABLED / QBO_ENTITY_PUSH_ENABLED kill-switches`
      );
    }

    if (!/three-layer|Layer 1|Historical transaction authority/i.test(source)) {
      failures.push(`${rel}: must name the three-layer / Layer 1 historical authority model`);
    }

    // Defect wording — affirmative retirement of Layer 1 or indefinite sole SoT (negated prose OK).
    for (const pattern of AFFIRMATIVE_LAYER1_RETIRED_PATTERNS) {
      for (const line of source.split("\n")) {
        if (!pattern.test(line)) continue;
        if (/\b(?:not|never)\s+retired\b/i.test(line)) continue;
        if (/\b(?:does\s+not|do\s+not|don't)\s+retire\b/i.test(line)) continue;
        if (/\b(?:superseded|older|earlier|declared|Controls over)\b/i.test(line)) continue;
        failures.push(
          `${rel}: affirmative Layer-1 retirement wording matched /${pattern.source}/ — 12/31/2025 boundary is NOT retired`
        );
      }
    }
    for (const pattern of AFFIRMATIVE_INDEFINITE_SOLE_PATTERNS) {
      for (const line of source.split("\n")) {
        if (!pattern.test(line)) continue;
        if (/\bis\s+not\b|\bnot\s+[“"]?the\s+sole\b|\bnot\s+sole\b|\bsuperseded\b/i.test(line)) continue;
        failures.push(
          `${rel}: affirmative indefinite-sole-SoT wording matched /${pattern.source}/ — QBO is comparison/filing book under Layer 3, not indefinite sole SoT`
        );
      }
    }
  }

  const parallelBooks =
    docs.find(([rel]) => rel === "docs/specs/TMS-QBO-PARALLEL-BOOKS.md")?.[1] ?? "";
  if (
    /12\/31\/2025 SoR framing is retired/i.test(parallelBooks) &&
    !/superseded by this three-layer/i.test(parallelBooks)
  ) {
    failures.push(
      "docs/specs/TMS-QBO-PARALLEL-BOOKS.md: must not claim 12/31/2025 SoR framing is retired without three-layer supersession"
    );
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
      .replaceAll("03/31/2026", "OB_DATE_REMOVED")
      .replaceAll("04/01/2026", "LIVE_DATE_REMOVED")
      .replaceAll("actively maintained", "ACTIVE_MAINT_REMOVED")
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
      if (rel === "docs/specs/TMS-QBO-PARALLEL-BOOKS.md") {
        // Plant Layer-1 retirement / indefinite-sole SoT as current claims (no supersession clause).
        planted =
          planted.replace(/superseded by this three-layer model/gi, "SUPERSESSION_REMOVED") +
          "\nThe 12/31/2025 SoR framing is retired.\n" +
          "QBO is the indefinite sole source of truth.\n";
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
    "03/31/2026",
    "04/01/2026",
    "kill-switch",
    "actively maintained",
    "affirmative Layer-1 retirement",
    "affirmative indefinite-sole",
  ],
});
