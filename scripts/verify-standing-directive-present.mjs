#!/usr/bin/env node
/**
 * verify-standing-directive-present.mjs
 *
 * Ratchet: STANDING-SESSION-DIRECTIVE.md must exist and be referenced from
 * every agent boot path (.cursor/rules, .windsurf/rules, ih35-tms-standards skill,
 * 00-always-read-first). Fails closed if any pointer is dropped.
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
const USMCA_ONLY = "docs/lockdown/USMCA-ONLY-UNTIL-LAUNCH-LAW-2026-08-19.md";

const POINTERS = [
  {
    rel: ".cursor/rules/33-standing-session-directive.mdc",
    mustInclude: ["STANDING-SESSION-DIRECTIVE.md", "DELIVERY-METHOD-LOCKED.md", "alwaysApply", "SEARCH BEFORE YOU ASK", "USMCA-ONLY-UNTIL-LAUNCH-LAW-2026-08-19.md"],
  },
  {
    rel: ".windsurf/rules/standing-session-directive.md",
    mustInclude: ["STANDING-SESSION-DIRECTIVE.md", "DELIVERY-METHOD-LOCKED.md", "SEARCH BEFORE YOU ASK", "USMCA-ONLY-UNTIL-LAUNCH-LAW-2026-08-19.md"],
  },
  {
    rel: ".claude/skills/ih35-tms-standards/SKILL.md",
    mustInclude: ["STANDING-SESSION-DIRECTIVE.md", "USMCA-ONLY-UNTIL-LAUNCH-LAW-2026-08-19.md"],
  },
  {
    rel: ".cursor/rules/00-always-read-first.mdc",
    mustInclude: ["STANDING-SESSION-DIRECTIVE.md", "USMCA-ONLY-UNTIL-LAUNCH-LAW-2026-08-19.md"],
  },
  {
    rel: ".cursor/rules/41-usmca-only-until-launch.mdc",
    mustInclude: ["USMCA-ONLY-UNTIL-LAUNCH-LAW-2026-08-19.md"],
  },
  {
    rel: "AGENTS.md",
    mustInclude: ["STANDING-SESSION-DIRECTIVE.md", "SEARCH BEFORE YOU ASK", "USMCA-ONLY-UNTIL-LAUNCH-LAW-2026-08-19.md"],
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
  if (!fs.existsSync(path.join(root, USMCA_ONLY))) problems.push(`MISSING ${USMCA_ONLY}`);

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
    if (!/USMCA-ONLY-UNTIL-LAUNCH-LAW-2026-08-19/.test(body)) {
      problems.push(`${DIRECTIVE}: must include §11 USMCA-ONLY-UNTIL-LAUNCH-LAW`);
    }
  }

  for (const p of POINTERS) {
    const abs = path.join(root, p.rel);
    if (!fs.existsSync(abs)) {
      problems.push(`MISSING pointer file ${p.rel}`);
      continue;
    }
    const text = fs.readFileSync(abs, "utf8");
    if (p.rel.endsWith(".mdc") && !/^---[\s\S]*?alwaysApply:\s*true[\s\S]*?---/m.test(text)) {
      problems.push(`${p.rel}: alwaysApply: true required`);
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
    fs.writeFileSync(path.join(tmpRoot, DIRECTIVE), "# stub\nNO holds. NO JORGE-APPROVED.\nCursor SCREENS + JANITOR\nDELIVERY-METHOD-LOCKED\n## 6. SEARCH BEFORE YOU ASK\n## 7. PLACEHOLDER test data\n");
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
    const planted = assertStandingDirectivePresent(tmpRoot);
    if (planted.length < 4) {
      console.error(`${LABEL} SELFTEST FAIL — planted missing refs not caught (${planted.length})`);
      for (const p of planted) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS — planted missing refs caught (${planted.length})`);
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
console.log(`${LABEL} OK — ${DIRECTIVE} present + boot pointers (.cursor/.windsurf/skill/00-always-read-first)`);
