#!/usr/bin/env node
/**
 * verify-fully-wired-complete-bar-present.mjs — LAW-2026-08-13-FULLY-WIRED-COMPLETE-BAR
 *
 * Ratchet: owner-plain FULLY-WIRED-COMPLETE-BAR must exist, contain the 12-item bar
 * (surface bar + Live Chrome last), and be cited from every major agent boot path.
 * No new verify-step number — registered in docs/law/LAW.json (existence ratchet).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fully-wired-complete-bar-present";
const LAW = "docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md";

const BODY_MARKS = [
  /SURFACE BAR/i,
  /LIVE CHECK IN CHROME/i,
  /Live Chrome LAST|Live check in Chrome/i,
  /search.*filter.*gear.*range.*picker.*Combobox/i,
  /ParityDrawer/i,
  /nested create/i,
  /forward.*reverse|Forward links|Reverse links/i,
];

const MUST_CITE = [
  "docs/specs/STANDING-SESSION-DIRECTIVE.md",
  "docs/specs/LAW-OF-THE-LAND-COMPLETE-2026-07-25.md",
  "docs/specs/OWNER-QUALITY-COMPACT.md",
  "docs/specs/DEFINITION-OF-DONE.md",
  "docs/specs/PER-PR-CHECKLIST.md",
  "docs/specs/DELIVERY-METHOD-LOCKED.md",
  "docs/specs/CURSOR-OPERATING-CONSTITUTION.md",
  "docs/specs/QUALITY-STANDARD-LOCKED.md",
  "AGENTS.md",
  ".cursor/rules/00-always-read-first.mdc",
  ".cursor/rules/33-standing-session-directive.mdc",
  ".cursor/rules/38-fully-wired-complete-bar.mdc",
  ".windsurf/rules/standing-session-directive.md",
  ".claude/skills/ih35-tms-standards/SKILL.md",
  ".claude/skills/ih35-evidence-before-done/SKILL.md",
  "docs/lockdown/VERTICAL-WIRING-LAW-2026-08-12.md",
  "docs/lockdown/WIRE-FIRST-SPRINT-LAW-2026-08-12.md",
];

const CITE_MARK = /FULLY-WIRED-COMPLETE-BAR-2026-08-13/;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function findMissing(root = ROOT) {
  const missing = [];
  const lawAbs = path.join(root, LAW);
  if (!fs.existsSync(lawAbs)) {
    missing.push(`${LAW} (missing file)`);
    return missing;
  }
  const body = fs.readFileSync(lawAbs, "utf8");
  for (const re of BODY_MARKS) {
    if (!re.test(body)) missing.push(`${LAW} (missing required mark ${re})`);
  }
  if (!/## THE MANDATORY LIST/i.test(body)) {
    missing.push(`${LAW} (missing THE MANDATORY LIST section)`);
  }

  for (const rel of MUST_CITE) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      missing.push(`${rel} (missing file)`);
      continue;
    }
    if (!CITE_MARK.test(fs.readFileSync(abs, "utf8"))) {
      missing.push(`${rel} (does not cite FULLY-WIRED-COMPLETE-BAR-2026-08-13)`);
    }
  }

  const lawJson = path.join(root, "docs/law/LAW.json");
  if (fs.existsSync(lawJson)) {
    if (!fs.readFileSync(lawJson, "utf8").includes("LAW-2026-08-13-FULLY-WIRED-COMPLETE-BAR")) {
      missing.push("docs/law/LAW.json (LAW-2026-08-13-FULLY-WIRED-COMPLETE-BAR not registered)");
    }
  } else {
    missing.push("docs/law/LAW.json (missing)");
  }
  return missing;
}

function selftest() {
  const live = findMissing();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".fully-wired-selftest-"));
  try {
    fs.mkdirSync(path.join(tmp, "docs", "lockdown"), { recursive: true });
    fs.writeFileSync(path.join(tmp, LAW), "# stub without marks\n");
    fs.mkdirSync(path.join(tmp, "docs", "specs"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "docs/specs/STANDING-SESSION-DIRECTIVE.md"), "# no cite\n");
    const planted = findMissing(tmp);
    if (planted.length < 2) {
      console.error(`${LABEL} SELFTEST FAIL — planted defects not caught (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS — planted defects caught (${planted.length}); live problems=${live.length}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} note: live still has ${live.length} problem(s)`);
    for (const m of live) console.error(`  - ${m}`);
    process.exit(1);
  }
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) selftest();
  const missing = findMissing();
  if (missing.length) {
    console.error(`${LABEL} FAIL:\n`);
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — FULLY-WIRED-COMPLETE-BAR present + cited on all boot paths`);
}
