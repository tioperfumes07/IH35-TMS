#!/usr/bin/env node
/**
 * verify-standing-directive-present.mjs
 *
 * Ratchet: STANDING-SESSION-DIRECTIVE.md must exist and be referenced from
 * every agent boot path (.cursor/rules, ih35-tms-standards skill, 00-always-read-first).
 * Fails closed if any pointer is dropped.
 *
 * 443.101 — tracks the LIVE law, not the archive. The 2026-09-02 owner law (AGENTS.md autoload,
 * #19524 4d634a9f7a CURSOR-ALWAYS-APPLY-DIET, #19531 AGENTS-MD-GO20-SLIM, #19548 851cb6deae) made
 * 00-IH35-LAW.mdc + 03-display-ids.mdc the ONLY always-apply rules, retired .windsurf/rules/, and
 * kept the older companions in git (never-delete) with alwaysApply: false + a SUPERSEDED banner.
 * This guard still demanded the pre-09-02 shape (alwaysApply: true on 33/47/00-always-read-first, the
 * .windsurf pointer, AGENTS.md naming the 08-22 laws) — i.e. it could only pass by RESTORING superseded
 * law, in direct conflict with verify-session-law-autoload. It now enforces the current shape:
 *   - the 2026-09-02 autoload set exists, is named in AGENTS.md, and 00-IH35-LAW / 03-display-ids
 *     carry alwaysApply: true;
 *   - superseded companions stay in git, never re-claim alwaysApply: true, and carry the banner;
 *   - the retired .windsurf directive is NOT restored.
 *
 * Living-law only — does not scan docs/audit, db/migrations, .block-ready.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-standing-directive-present";
const SELFTEST = process.argv.includes("--selftest");

const DIRECTIVE = "docs/specs/STANDING-SESSION-DIRECTIVE.md";
const DELIVERY = "docs/specs/DELIVERY-METHOD-LOCKED.md";

/** The 2026-09-02 autoload set: must exist; the two rules must be always-apply. */
const AUTOLOAD_ALWAYS_APPLY = [".cursor/rules/00-IH35-LAW.mdc", ".cursor/rules/03-display-ids.mdc"];
const AUTOLOAD_DOCS = ["claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md", "docs/lockdown/PROJECT-INSTRUCTIONS-2026-09-02.md"];
/** Retired by #19548 (851cb6deae) / the 2026-09-02 owner law — must NOT be restored. */
const RETIRED = [".windsurf/rules/standing-session-directive.md"];
/** Superseded companions: kept (never-delete), alwaysApply: false, banner pointing at 00-IH35-LAW.mdc. */
const SUPERSEDED_BANNER = /SUPERSEDED-ALWAYS-APPLY:\s*see 00-IH35-LAW\.mdc/;
const ALWAYS_APPLY_TRUE = /^---[\s\S]*?alwaysApply:\s*true[\s\S]*?---/m;

const POINTERS = [
  {
    rel: ".cursor/rules/33-standing-session-directive.mdc",
    mustInclude: [
      "STANDING-SESSION-DIRECTIVE.md",
      "DELIVERY-METHOD-LOCKED.md",
      "alwaysApply",
      "SEARCH BEFORE YOU ASK",
      "CREATE-TEST-THEN-VOID-LAW-2026-08-22.md",
      "URGENT-14-EXCLUSIVE-MODULE-CERTIFY-LAW-2026-08-22.md",
      "SESSION-ANNOUNCE-CURRENT-LAW-HOPS-2026-08-22.md",
    ],
  },
  {
    rel: ".claude/skills/ih35-tms-standards/SKILL.md",
    mustInclude: [
      "STANDING-SESSION-DIRECTIVE.md",
      "CREATE-TEST-THEN-VOID-LAW-2026-08-22.md",
      "URGENT-14-EXCLUSIVE-MODULE-CERTIFY-LAW-2026-08-22.md",
      "SESSION-ANNOUNCE-CURRENT-LAW-HOPS-2026-08-22.md",
    ],
  },
  {
    rel: ".cursor/rules/00-always-read-first.mdc",
    mustInclude: [
      "STANDING-SESSION-DIRECTIVE.md",
      "CREATE-TEST-THEN-VOID-LAW-2026-08-22.md",
      "URGENT-14-EXCLUSIVE-MODULE-CERTIFY-LAW-2026-08-22.md",
      "SESSION-ANNOUNCE-CURRENT-LAW-HOPS-2026-08-22.md",
    ],
  },
  {
    rel: "AGENTS.md",
    mustInclude: [
      // #19531 slimmed AGENTS.md: the directive is named (as SUPERSEDED) in the collapsed pre-09-02 block.
      "STANDING-SESSION-DIRECTIVE",
      // 2026-09-02 autoload set (AGENTS.md AUTOLOAD block, #19531)
      ".cursor/rules/00-IH35-LAW.mdc",
      ".cursor/rules/03-display-ids.mdc",
      "claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md",
      "docs/lockdown/PROJECT-INSTRUCTIONS-2026-09-02.md",
    ],
  },
];

function fail(msg, problems) {
  console.error(`${LABEL} FAIL — ${msg}`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

export function assertStandingDirectivePresent(root = ROOT) {
  const problems = [];
  const directiveAbs = path.join(root, DIRECTIVE);
  const deliveryAbs = path.join(root, DELIVERY);
  if (!fs.existsSync(directiveAbs)) problems.push(`MISSING ${DIRECTIVE}`);
  if (!fs.existsSync(deliveryAbs)) problems.push(`MISSING ${DELIVERY}`);

  if (fs.existsSync(directiveAbs)) {
    const body = fs.readFileSync(directiveAbs, "utf8");
    if (!/NO\s+holds|NO\s+`?JORGE-APPROVED/i.test(body)) {
      problems.push(`${DIRECTIVE}: must state NO holds / NO JORGE-APPROVED governance`);
    }
    if (!/SCREENS\s*\+\s*JANITOR|Cursor/i.test(body)) {
      problems.push(`${DIRECTIVE}: must name Cursor screens/janitor lane`);
    }
    if (!/DELIVERY-METHOD-LOCKED/i.test(body)) {
      problems.push(`${DIRECTIVE}: must point at DELIVERY-METHOD-LOCKED.md`);
    }
    // Canonical §6 / §7 (owner 2026-08-04) — search-before-ask + labeled placeholders.
    if (!/SEARCH BEFORE YOU ASK/i.test(body)) {
      problems.push(`${DIRECTIVE}: must include §6 SEARCH BEFORE YOU ASK`);
    }
    if (!/PLACEHOLDER/i.test(body) || !/TEST DATA|test data/i.test(body)) {
      problems.push(`${DIRECTIVE}: must include §7 TEST WITH PLACEHOLDER NUMBERS (labeled test data)`);
    }
    if (!/CREATE-TEST-THEN-VOID/i.test(body) || !/CREATE-TEST-THEN-VOID-LAW-2026-08-22/i.test(body)) {
      problems.push(`${DIRECTIVE}: must include CREATE-TEST-THEN-VOID law pointer`);
    }
    if (!/URGENT-14-EXCLUSIVE-MODULE-CERTIFY-LAW-2026-08-22/i.test(body) || !/EXCLUSIVE MODULE/i.test(body)) {
      problems.push(`${DIRECTIVE}: must include URGENT 14 EXCLUSIVE MODULE CERTIFY law`);
    }
    if (!/SESSION-ANNOUNCE-CURRENT-LAW-HOPS-2026-08-22/i.test(body) || !/OPEN hops/i.test(body)) {
      problems.push(`${DIRECTIVE}: must include SESSION ANNOUNCE CURRENT-LAW + OPEN hops`);
    }
    if (!/QUERY-BACK/i.test(body) || !/QUERY-BACK-AND-HEALTHZ-LEAD-LAW-2026-08-28/i.test(body)) {
      problems.push(`${DIRECTIVE}: must include QUERY-BACK + QUERY-BACK-AND-HEALTHZ-LEAD-LAW-2026-08-28`);
    }
    if (!/TEST-LABEL-G1-AND-CUTOVER-FALSE-ALARM-LAW-2026-08-28/i.test(body)) {
      problems.push(`${DIRECTIVE}: must include TEST-LABEL-G1-AND-CUTOVER-FALSE-ALARM-LAW-2026-08-28`);
    }
    if (!/is_sample_data/i.test(body) || !/detector/i.test(body)) {
      problems.push(`${DIRECTIVE}: must lock G1 is_sample_data label + 9000 detector (not fail-closed)`);
    }
  }

  const g1Law = "docs/lockdown/TEST-LABEL-G1-AND-CUTOVER-FALSE-ALARM-LAW-2026-08-28.md";
  if (!fs.existsSync(path.join(root, g1Law))) {
    problems.push(`MISSING ${g1Law}`);
  } else {
    const g1 = fs.readFileSync(path.join(root, g1Law), "utf8");
    if (!/PARALLEL-BOOKS-CUTOVER-LOCKED-2026-07-16/i.test(g1)) {
      problems.push(`${g1Law}: must cite PARALLEL-BOOKS-CUTOVER-LOCKED-2026-07-16`);
    }
    if (!/nobody builds fail-closed/i.test(g1)) {
      problems.push(`${g1Law}: must forbid 9000 fail-closed as the G2 fix`);
    }
    if (!/Keep on the books/i.test(g1)) {
      problems.push(`${g1Law}: must lock keep-on-books / no void-all-TEST`);
    }
  }

  const queryBackLaw = "docs/lockdown/QUERY-BACK-AND-HEALTHZ-LEAD-LAW-2026-08-28.md";
  if (!fs.existsSync(path.join(root, queryBackLaw))) {
    problems.push(`MISSING ${queryBackLaw}`);
  }

  const announceLaw = "docs/lockdown/SESSION-ANNOUNCE-CURRENT-LAW-HOPS-2026-08-22.md";
  if (!fs.existsSync(path.join(root, announceLaw))) {
    problems.push(`MISSING ${announceLaw}`);
  } else {
    const al = fs.readFileSync(path.join(root, announceLaw), "utf8");
    if (!/CURRENT-LAW/i.test(al) || !/omit CERTIFIED|Omit CERTIFIED/i.test(al)) {
      problems.push(`${announceLaw}: must lock CURRENT-LAW announce + omit CERTIFIED`);
    }
  }

  const exclusiveLaw = "docs/lockdown/URGENT-14-EXCLUSIVE-MODULE-CERTIFY-LAW-2026-08-22.md";
  if (!fs.existsSync(path.join(root, exclusiveLaw))) {
    problems.push(`MISSING ${exclusiveLaw}`);
  } else {
    const el = fs.readFileSync(path.join(root, exclusiveLaw), "utf8");
    if (!/one seat|Exclusive owner/i.test(el) || !/HOLD/i.test(el)) {
      problems.push(`${exclusiveLaw}: must lock exclusive owner + HOLD forbidden`);
    }
  }

  const leadFiles = [
    "docs/bus/LEAD-CONTRACT.md",
    "docs/bus/CLAUDE-LEAD-NOW.md",
    "docs/bus/LEAD-SEAT.md",
    "docs/bus/LEAD-CENSUS.md",
    "docs/bus/LEAD-TRIPWIRE.md",
    ".cursor/rules/47-lead-contract-tripwire.mdc",
    "scripts/ops/activate-claude-lead.mjs",
  ];
  for (const rel of leadFiles) {
    if (!fs.existsSync(path.join(root, rel))) problems.push(`MISSING ${rel}`);
  }
  const rule47 = path.join(root, ".cursor/rules/47-lead-contract-tripwire.mdc");
  if (fs.existsSync(rule47)) {
    const t = fs.readFileSync(rule47, "utf8");
    if (ALWAYS_APPLY_TRUE.test(t) || !SUPERSEDED_BANNER.test(t)) {
      problems.push(".cursor/rules/47-lead-contract-tripwire.mdc: superseded 2026-09-02 — must stay alwaysApply: false with the SUPERSEDED-ALWAYS-APPLY banner");
    }
    if (!t.includes("activate-claude-lead.mjs") || !t.includes("CLAUDE-LEAD-NOW.md")) {
      problems.push(".cursor/rules/47-lead-contract-tripwire.mdc: must name activate script + CLAUDE-LEAD-NOW.md");
    }
  }
  const contract = path.join(root, "docs/bus/LEAD-CONTRACT.md");
  if (fs.existsSync(contract)) {
    const c = fs.readFileSync(contract, "utf8");
    if (!/T1|T6/.test(c) || !/self-ACK/.test(c)) {
      problems.push("docs/bus/LEAD-CONTRACT.md: must lock tripwire T1–T6 + self-ACK vs ping");
    }
  }

  for (const rel of AUTOLOAD_ALWAYS_APPLY) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) problems.push(`MISSING autoload rule ${rel}`);
    else if (!ALWAYS_APPLY_TRUE.test(fs.readFileSync(abs, "utf8"))) problems.push(`${rel}: alwaysApply: true required (2026-09-02 autoload)`);
  }
  for (const rel of AUTOLOAD_DOCS) {
    if (!fs.existsSync(path.join(root, rel))) problems.push(`MISSING autoload doc ${rel}`);
  }
  for (const rel of RETIRED) {
    if (fs.existsSync(path.join(root, rel))) problems.push(`${rel}: retired by #19548 / 2026-09-02 owner law — must not be restored`);
  }

  for (const p of POINTERS) {
    const abs = path.join(root, p.rel);
    if (!fs.existsSync(abs)) {
      problems.push(`MISSING pointer file ${p.rel}`);
      continue;
    }
    const text = fs.readFileSync(abs, "utf8");
    if (p.rel.endsWith(".mdc") && (ALWAYS_APPLY_TRUE.test(text) || !SUPERSEDED_BANNER.test(text))) {
      problems.push(`${p.rel}: superseded 2026-09-02 — must stay alwaysApply: false with the SUPERSEDED-ALWAYS-APPLY banner (only 00-IH35-LAW / 03-display-ids are always-apply)`);
    }
    for (const needle of p.mustInclude) {
      if (!text.includes(needle)) {
        problems.push(`${p.rel}: missing reference to ${needle}`);
      }
    }
  }
  return problems;
}

if (SELFTEST) {
  const live = assertStandingDirectivePresent();
  // Plant: missing pointer reference
  const tmpRoot = fs.mkdtempSync(path.join(ROOT, "scripts", ".standing-directive-selftest-"));
  try {
    fs.mkdirSync(path.join(tmpRoot, "docs", "specs"), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, ".cursor", "rules"), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, ".windsurf", "rules"), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, ".claude", "skills", "ih35-tms-standards"), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, DIRECTIVE), "# stub\nNO holds. NO JORGE-APPROVED.\nCursor SCREENS + JANITOR\nDELIVERY-METHOD-LOCKED\n## 6. SEARCH BEFORE YOU ASK\n## 7. PLACEHOLDER test data\nCREATE-TEST-THEN-VOID-LAW-2026-08-22.md CREATE-TEST-THEN-VOID\nURGENT-14-EXCLUSIVE-MODULE-CERTIFY-LAW-2026-08-22.md EXCLUSIVE MODULE\n");
    fs.writeFileSync(path.join(tmpRoot, DELIVERY), "# delivery stub\n");
    // Broken pointer — missing STANDING reference
    fs.writeFileSync(
      path.join(tmpRoot, ".cursor", "rules", "33-standing-session-directive.mdc"),
      "---\nalwaysApply: true\n---\n# broken — no directive path\nDELIVERY-METHOD-LOCKED.md\n",
    );
    fs.writeFileSync(path.join(tmpRoot, ".windsurf", "rules", "standing-session-directive.md"), "DELIVERY-METHOD-LOCKED.md\n");
    fs.writeFileSync(path.join(tmpRoot, ".claude", "skills", "ih35-tms-standards", "SKILL.md"), "# no standing\n");
    fs.writeFileSync(path.join(tmpRoot, ".cursor", "rules", "00-always-read-first.mdc"), "---\nalwaysApply: true\n---\n# no standing\n");
    fs.writeFileSync(path.join(tmpRoot, "AGENTS.md"), "# no standing\n");
    fs.mkdirSync(path.join(tmpRoot, "docs", "bus"), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, "scripts", "ops"), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, "docs/bus/LEAD-CONTRACT.md"), "T1 T6 self-ACK\n");
    fs.writeFileSync(path.join(tmpRoot, "docs/bus/CLAUDE-LEAD-NOW.md"), "YOU ARE LEAD\n");
    fs.writeFileSync(path.join(tmpRoot, "docs/bus/LEAD-SEAT.md"), "SEAT=CURSOR\n");
    fs.writeFileSync(path.join(tmpRoot, "docs/bus/LEAD-CENSUS.md"), "census\n");
    fs.writeFileSync(path.join(tmpRoot, "docs/bus/LEAD-TRIPWIRE.md"), "tripwire\n");
    fs.writeFileSync(
      path.join(tmpRoot, ".cursor/rules/47-lead-contract-tripwire.mdc"),
      "---\nalwaysApply: true\n---\nactivate-claude-lead.mjs CLAUDE-LEAD-NOW.md\n",
    );
    fs.writeFileSync(path.join(tmpRoot, "scripts/ops/activate-claude-lead.mjs"), "// stub\n");
    const planted = assertStandingDirectivePresent(tmpRoot);
    if (planted.length < 4) {
      console.error(`${LABEL} SELFTEST FAIL — planted missing refs not caught (${planted.length})`);
      for (const p of planted) console.error(`  - ${p}`);
      process.exit(1);
    }
    // 443.101 targeted regressions: each must be named.
    const named = (re) => planted.some((p) => re.test(p));
    const checks = [
      ["retired .windsurf directive restored", /\.windsurf\/rules\/standing-session-directive\.md: retired/],
      ["superseded 33 re-claims alwaysApply", /33-standing-session-directive\.mdc: superseded/],
      ["superseded 47 re-claims alwaysApply", /47-lead-contract-tripwire\.mdc: superseded/],
      ["autoload rule 00-IH35-LAW missing", /MISSING autoload rule \.cursor\/rules\/00-IH35-LAW\.mdc/],
      ["autoload doc missing", /MISSING autoload doc claude\/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST\.md/],
      ["AGENTS.md drops the autoload set", /AGENTS\.md: missing reference to \.cursor\/rules\/00-IH35-LAW\.mdc/],
    ];
    for (const [n, re] of checks) {
      if (!named(re)) {
        console.error(`${LABEL} SELFTEST FAIL — not caught: ${n}`);
        process.exit(1);
      }
    }
    // healthy autoload rule with alwaysApply: false is caught too
    fs.mkdirSync(path.join(tmpRoot, ".cursor", "rules"), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, ".cursor/rules/00-IH35-LAW.mdc"), "---\nalwaysApply: false\n---\n");
    if (!assertStandingDirectivePresent(tmpRoot).some((p) => /00-IH35-LAW\.mdc: alwaysApply: true required/.test(p))) {
      console.error(`${LABEL} SELFTEST FAIL — 00-IH35-LAW losing alwaysApply not caught`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS — planted missing refs caught (${planted.length}) + 7 targeted 2026-09-02 regressions`);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} note: live still has ${live.length} problem(s) — fix before merge`);
    for (const p of live) console.error(`  - ${p}`);
    process.exit(1);
  }
  process.exit(0);
}

const problems = assertStandingDirectivePresent();
if (problems.length) fail("standing directive / boot pointers incomplete", problems);
console.log(`${LABEL} OK — ${DIRECTIVE} present + boot pointers (.cursor/skill/00-always-read-first); 2026-09-02 autoload set live; superseded rules stay off; retired .windsurf directive not restored`);
