#!/usr/bin/env node
/**
 * Local PR-body gate (Rule 30) — run BEFORE gh pr create / gh pr edit.
 *
 *   node scripts/cursor-pr-body-gate.mjs --body-file /tmp/pr-body.txt
 *
 * Runs CI's check-pr-evidence-body + Claude-green shape (FINDING-first, no weak UNVERIFIED theater).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertClaudeGreenEvidenceShape } from "./verify-claude-green-evidence-shape.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "cursor-pr-body-gate";

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

if (process.argv.includes("--selftest")) {
  const tpl = path.join(ROOT, "docs/templates/CLAUDE-GREEN-PR-BODY.md");
  if (!fs.existsSync(tpl)) {
    console.error(`${LABEL} --selftest FAIL: missing template`);
    process.exit(1);
  }
  if (!fs.existsSync(path.join(ROOT, "scripts/check-pr-evidence-body.mjs"))) {
    console.error(`${LABEL} --selftest FAIL: missing check-pr-evidence-body`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const bodyFile = argValue("--body-file");
if (!bodyFile || !fs.existsSync(bodyFile)) {
  console.error(
    `${LABEL}: usage — node scripts/cursor-pr-body-gate.mjs --body-file /tmp/pr-body.txt\n` +
      `Copy docs/templates/CLAUDE-GREEN-PR-BODY.md, fill it, then run this BEFORE gh pr create.`,
  );
  process.exit(2);
}

// Worktrees use a .git *file* — never mkdir ROOT/.git. Use OS temp.
const filesFile = path.join(
  os.tmpdir(),
  `ih35-cursor-pr-body-gate-files-${process.pid}.txt`,
);
fs.writeFileSync(filesFile, "apps/frontend/src/x.ts\n", "utf8");

const ci = spawnSync(
  process.execPath,
  [
    path.join(ROOT, "scripts/check-pr-evidence-body.mjs"),
    "--body-file",
    bodyFile,
    "--files-file",
    filesFile,
  ],
  { cwd: ROOT, encoding: "utf8" },
);
const ciOut = `${ci.stdout ?? ""}${ci.stderr ?? ""}`.trim();
if (ciOut) console.log(ciOut);
if ((ci.status ?? 1) !== 0) {
  console.error(`${LABEL}: FAIL — check-pr-evidence-body rejected the body (same gate as CI).`);
  process.exit(ci.status ?? 1);
}

const body = fs.readFileSync(bodyFile, "utf8");
const shape = assertClaudeGreenEvidenceShape(body);
if (shape.length) {
  console.error(`${LABEL} FAILED — not Claude-green (Rule 30):`);
  for (const p of shape) console.error(`  ${p}`);
  console.error(`\nFix using docs/templates/CLAUDE-GREEN-PR-BODY.md then re-run.`);
  process.exit(1);
}

console.log(`${LABEL} OK — PR body matches Claude-green evidence format (CI will accept)`);
process.exit(0);
