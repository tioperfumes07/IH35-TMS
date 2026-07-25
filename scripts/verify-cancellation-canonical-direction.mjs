#!/usr/bin/env node
// verify:cancellation-canonical-direction
//
// LST-F17. The repo disagreed with ITSELF about which cancellation-reasons table is canonical, and the
// disagreement survived for weeks because nothing compared the two sources:
//
//   * `.cursor/rules/14`, skill §10(b) and scripts/verify-canonical-table-writes.mjs said
//     catalogs.cancellation_reasons = RETIRE, catalogs.load_cancellation_reasons = canonical.
//   * docs/trackers/FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md §A said the OPPOSITE — "point the Lists
//     page at cancellation_reasons; retire/merge the decoy".
//
// A coder reading the tracker would repoint the writer at the legacy 9-row global table with RLS OFF and
// pass CI, because no guard asserted the two agreed. CLAUDE.md §9 requires flagging a doc-vs-doc conflict
// rather than silently picking a side, so it went to the owner.
//
// OWNER RULING A (2026-07-25): catalogs.load_cancellation_reasons is CANONICAL; catalogs.cancellation_reasons
// is RETIRE — archived, never dropped (§F.24). Prod backs it: load_cancellation_reasons is per-entity
// (operating_company_id NOT NULL, FORCE RLS, 12 active codes x 3 entities) while cancellation_reasons is a
// single 9-row global with relrowsecurity=false. PRs #3436 and #3439 had already moved the writer and the
// canonical-write map in that direction.
//
// This guard pins ALL FOUR sources to ruling A, so the contradiction cannot come back from any one of them.
// It is a doc-consistency ratchet, not a prod check — the prod counts behind the ruling live in the tracker.
//
// FAILS on the pre-fix tree (the tracker states the opposite direction) and PASSES on the fix.
// `--selftest` mutates REAL source, one case per assertion.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify:cancellation-canonical-direction";
const SELFTEST = process.argv.includes("--selftest");

const TRACKER = "docs/trackers/FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md";
const RULE14 = ".cursor/rules/14-linkage-law-enforcement.mdc";
const CANONICAL_MAP = "scripts/verify-canonical-table-writes.mjs";
const SKILL = ".claude/skills/ih35-tms-standards/SKILL.md";
const FILES = [TRACKER, RULE14, CANONICAL_MAP, SKILL];

const CANONICAL = "catalogs.load_cancellation_reasons";
const RETIRE = "catalogs.cancellation_reasons";

const readDisk = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertCancellationCanonicalDirection(sources) {
  const get = (rel) => {
    if (sources && rel in sources) return sources[rel];
    try {
      return readDisk(rel);
    } catch {
      return null;
    }
  };
  const errs = [];

  // ── 1. the tracker must state ruling A, and must NOT still carry the inverted instruction ─────────
  const tracker = get(TRACKER);
  if (tracker === null) {
    errs.push(`${TRACKER}: MISSING — it is the source that carried the inverted direction`);
  } else {
    if (/point the Lists page at `?catalogs\.cancellation_reasons`?/i.test(tracker) ||
        /point the Lists page at `?cancellation_reasons`?/i.test(tracker)) {
      errs.push(
        `${TRACKER}: still instructs "point the Lists page at cancellation_reasons" — that is the INVERTED direction the owner overruled (ruling A). Canonical is ${CANONICAL}.`,
      );
    }
    if (!/OWNER RULING A/.test(tracker)) {
      errs.push(`${TRACKER}: must record OWNER RULING A (2026-07-25) so the canonical direction is unambiguous`);
    }
    if (!new RegExp(`${CANONICAL.replace(".", "\\.")}\\b[^|]*CANONICAL|CANONICAL[^|]*${CANONICAL.replace(".", "\\.")}`, "i").test(tracker)) {
      errs.push(`${TRACKER}: must name ${CANONICAL} as CANONICAL`);
    }
  }

  // ── 2. the canonical-write map must map RETIRE -> canonical (not the reverse) ─────────────────────
  const map = get(CANONICAL_MAP);
  if (map === null) {
    errs.push(`${CANONICAL_MAP}: MISSING — the CI map that enforces canonical writes`);
  } else {
    const inverted = new RegExp(
      `pat:\\s*"catalogs\\\\\\\\\\.load_cancellation_reasons"[^}]*canonical:\\s*"${RETIRE.replace(".", "\\.")}"`,
    );
    if (inverted.test(map)) {
      errs.push(`${CANONICAL_MAP}: the canonical map is INVERTED — it points ${CANONICAL} at ${RETIRE}`);
    }
    if (!new RegExp(`canonical:\\s*"${CANONICAL.replace(".", "\\.")}"`).test(map)) {
      errs.push(`${CANONICAL_MAP}: must map the legacy table to canonical ${CANONICAL}`);
    }
  }

  // ── 3. rule 14 and the skill must keep the legacy table on the RETIRE side ───────────────────────
  const rule14 = get(RULE14);
  if (rule14 !== null && !new RegExp(`${RETIRE.replace(".", "\\.")}`).test(rule14)) {
    errs.push(`${RULE14}: must keep ${RETIRE} in the never-write RETIRE list`);
  }
  const skill = get(SKILL);
  if (skill !== null) {
    if (!new RegExp(`${CANONICAL.replace(".", "\\.")}`).test(skill)) {
      errs.push(`${SKILL}: §10(b) must name ${CANONICAL} as the canonical cancellation-reasons table`);
    }
  }

  return errs;
}

if (SELFTEST) {
  const live = {};
  for (const f of FILES) {
    try {
      live[f] = readDisk(f);
    } catch {
      /* an optional source (skill/rule files are not always present in every checkout) */
    }
  }
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert — the mutation did not change the source`);
      return;
    }
    const problems = assertCancellationCanonicalDirection(mutated);
    if (!problems.some((x) => x.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };

  // The exact pre-fix text that made this finding.
  expectCaught(
    "tracker-reverts-to-inverted-instruction",
    {
      ...live,
      [TRACKER]: live[TRACKER].replace(
        "**OWNER RULING A, 2026-07-25:",
        "**point the Lists page at `cancellation_reasons`**; retire/merge the decoy. OLD:",
      ),
    },
    "INVERTED direction the owner overruled",
  );
  expectCaught(
    "tracker-loses-the-ruling",
    { ...live, [TRACKER]: live[TRACKER].replace(/OWNER RULING A/g, "note") },
    "must record OWNER RULING A",
  );
  expectCaught(
    "canonical-map-inverted",
    {
      ...live,
      [CANONICAL_MAP]: live[CANONICAL_MAP].replace(
        `canonical: "${CANONICAL}"`,
        `canonical: "${RETIRE}"`,
      ),
    },
    "must map the legacy table to canonical",
  );
  if (live[RULE14]) {
    expectCaught(
      "rule14-drops-the-retire-entry",
      { ...live, [RULE14]: live[RULE14].replaceAll(RETIRE, "catalogs.something_else") },
      "never-write RETIRE list",
    );
  }

  const liveProblems = assertCancellationCanonicalDirection(live);
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${live[RULE14] ? 4 : 3} planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertCancellationCanonicalDirection();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — tracker, rule 14, skill §10(b) and the canonical-write map all state ruling A: ${CANONICAL} canonical, ${RETIRE} RETIRE (archived, never dropped).`,
);
