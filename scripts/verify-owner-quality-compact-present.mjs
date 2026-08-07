#!/usr/bin/env node
/**
 * verify-owner-quality-compact-present.mjs
 *
 * Ratchet: OWNER-QUALITY-COMPACT.md + Claude.docx artifact must exist and be
 * referenced from agent boot paths. Enforces "ALL QUESTIONS HAVE BEEN ASKED
 * AND ANSWERED" — every decision lives in repo/blueprint/architecture/Neon.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-owner-quality-compact-present";
const SELFTEST = process.argv.includes("--selftest");

const COMPACT_MD = "docs/specs/OWNER-QUALITY-COMPACT.md";
const COMPACT_DOCX = "docs/specs/OWNER-QUALITY-COMPACT-Claude.docx";
const STANDING = "docs/specs/STANDING-SESSION-DIRECTIVE.md";

const POINTERS = [
  {
    rel: ".cursor/rules/33-standing-session-directive.mdc",
    mustInclude: ["OWNER-QUALITY-COMPACT.md"],
  },
  {
    rel: ".claude/skills/ih35-tms-standards/SKILL.md",
    mustInclude: ["OWNER-QUALITY-COMPACT.md"],
  },
  {
    rel: "AGENTS.md",
    mustInclude: ["OWNER-QUALITY-COMPACT.md", "ALL QUESTIONS HAVE BEEN ASKED"],
  },
  {
    rel: ".cursor/rules/00-always-read-first.mdc",
    mustInclude: ["OWNER-QUALITY-COMPACT.md"],
  },
];

function fail(msg, problems) {
  console.error(`${LABEL} FAIL — ${msg}`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

export function assertOwnerQualityCompactPresent(root = ROOT) {
  const problems = [];
  const mdAbs = path.join(root, COMPACT_MD);
  const docxAbs = path.join(root, COMPACT_DOCX);
  const standingAbs = path.join(root, STANDING);

  if (!fs.existsSync(mdAbs)) problems.push(`MISSING ${COMPACT_MD}`);
  if (!fs.existsSync(docxAbs)) problems.push(`MISSING ${COMPACT_DOCX} (Desktop Claude.docx permanized)`);
  if (fs.existsSync(docxAbs) && fs.statSync(docxAbs).size < 1000) {
    problems.push(`${COMPACT_DOCX}: suspiciously small (${fs.statSync(docxAbs).size} bytes)`);
  }

  if (fs.existsSync(mdAbs)) {
    const body = fs.readFileSync(mdAbs, "utf8");
    if (!/ALL QUESTIONS HAVE BEEN ASKED AND ANSWERED/i.test(body)) {
      problems.push(`${COMPACT_MD}: must state ALL QUESTIONS HAVE BEEN ASKED AND ANSWERED`);
    }
    if (!/never take the short or easy way/i.test(body)) {
      problems.push(`${COMPACT_MD}: must carry the quality hardline`);
    }
    if (!/OWNER-QUALITY-COMPACT-Claude\.docx/.test(body)) {
      problems.push(`${COMPACT_MD}: must point at the Claude.docx artifact`);
    }
  }

  if (fs.existsSync(standingAbs)) {
    const standing = fs.readFileSync(standingAbs, "utf8");
    if (!/OWNER-QUALITY-COMPACT|ALL QUESTIONS HAVE BEEN ASKED/i.test(standing)) {
      problems.push(`${STANDING}: must reference OWNER-QUALITY-COMPACT / all-questions-answered`);
    }
  } else {
    problems.push(`MISSING ${STANDING}`);
  }

  for (const p of POINTERS) {
    const abs = path.join(root, p.rel);
    if (!fs.existsSync(abs)) {
      problems.push(`MISSING pointer file ${p.rel}`);
      continue;
    }
    const text = fs.readFileSync(abs, "utf8");
    for (const needle of p.mustInclude) {
      if (!text.includes(needle)) {
        problems.push(`${p.rel}: missing reference to ${needle}`);
      }
    }
  }
  return problems;
}

if (SELFTEST) {
  const live = assertOwnerQualityCompactPresent();
  const tmpRoot = fs.mkdtempSync(path.join(ROOT, "scripts", ".owner-quality-compact-selftest-"));
  try {
    fs.mkdirSync(path.join(tmpRoot, "docs", "specs"), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, ".cursor", "rules"), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, ".claude", "skills", "ih35-tms-standards"), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, COMPACT_MD), "# stub without markers\n");
    fs.writeFileSync(path.join(tmpRoot, COMPACT_DOCX), "x"); // too small
    fs.writeFileSync(path.join(tmpRoot, STANDING), "# no compact\n");
    fs.writeFileSync(path.join(tmpRoot, ".cursor", "rules", "33-standing-session-directive.mdc"), "---\nalwaysApply: true\n---\n# no compact\n");
    fs.writeFileSync(path.join(tmpRoot, ".claude", "skills", "ih35-tms-standards", "SKILL.md"), "# no\n");
    fs.writeFileSync(path.join(tmpRoot, "AGENTS.md"), "# no\n");
    fs.writeFileSync(path.join(tmpRoot, ".cursor", "rules", "00-always-read-first.mdc"), "---\nalwaysApply: true\n---\n# no\n");
    const planted = assertOwnerQualityCompactPresent(tmpRoot);
    if (planted.length < 5) {
      console.error(`${LABEL} SELFTEST FAIL — planted defects not caught (${planted.length})`);
      for (const p of planted) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS — planted defects caught (${planted.length})`);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} note: live still has ${live.length} problem(s)`);
    for (const p of live) console.error(`  - ${p}`);
    process.exit(1);
  }
  process.exit(0);
}

const problems = assertOwnerQualityCompactPresent();
if (problems.length) fail("owner quality compact / boot pointers incomplete", problems);
console.log(`${LABEL} OK — ${COMPACT_MD} + ${COMPACT_DOCX} present + boot pointers`);
