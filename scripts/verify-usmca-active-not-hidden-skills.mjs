#!/usr/bin/env node
/**
 * GUARD: no auto-loaded skill may describe USMCA as hidden, future, or zero-balance.
 *
 * Background: SKILL-DRIFT-USMCA-HIDDEN — two auto-loaded skills once described USMCA as a
 * hidden future carrier with 0 balances, contradicting prod-verified state. This ratchet
 * prevents that drift from recurring in any .claude/skills/* SKILL.md file.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const SKILLS_DIR = resolve(ROOT, ".claude/skills");

// Phrases that imply USMCA is not yet active / has no data / should be skipped.
// Negative lookbehind/ahead excludes defensive wording like "not hidden", "not at zero balances",
// "future reporting needs", "hidden/future", etc. Case-insensitive lookbehind is spelled explicitly.
const NOT_WORD = "(?<![Nn][Oo][Tt]\\s)(?<![Nn][Oo][Tt]\\s[Aa][Tt]\\s)";
const BAD_PATTERNS = [
  new RegExp(
    `USMCA[^.\\n]{0,120}(?:${NOT_WORD}\\bhidden\\b|(?<!\\/)\\bfuture\\b(?!\\s+(?:reporting|needs|plan|statements?))|${NOT_WORD}\\bisolated\\b(?:\\s+until)?|\\blaunch(?:es)?\\s+(?:July|in\\s+2026)\\b|${NOT_WORD}(?:0\\s+balances|zero\\s+balances))`,
    "gi"
  ),
];

function* walkSkillMarkdown(dir) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      yield* walkSkillMarkdown(full);
    } else if (s.isFile() && entry.toLowerCase() === "skill.md") {
      yield full;
    }
  }
}

function checkText(file, text, problems) {
  for (const pattern of BAD_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      problems.push(`${file}: matches ${pattern.toString()}`);
    }
  }
}

/** @param {Array<{file: string, text: string}>} [filesOverride] in-memory files for the selftest */
export function run(filesOverride) {
  const problems = [];
  if (filesOverride) {
    for (const { file, text } of filesOverride) checkText(file, text, problems);
  } else {
    for (const file of walkSkillMarkdown(SKILLS_DIR)) {
      const text = readFileSync(file, "utf8");
      checkText(file.replace(`${ROOT}/`, ""), text, problems);
    }
  }

  const ok = problems.length === 0;
  return {
    ok,
    message: ok
      ? `verify-usmca-active-not-hidden-skills OK — no auto-loaded skill describes USMCA as hidden/future/0-balance`
      : `verify-usmca-active-not-hidden-skills FAIL:\n  - ${problems.join("\n  - ")}`,
  };
}

/**
 * Exercises the real run() assertion — against the live repo's actual skill files, and against an
 * in-memory planted-bad fixture. The prior version tested BAD_PATTERNS against two hardcoded
 * strings directly, never calling run() or walkSkillMarkdown() at all — a bug in the file-walking or
 * in how patterns are applied within run() would have gone completely undetected.
 */
function selftest() {
  const real = run();
  if (!real.ok) {
    console.error(`verify-usmca-active-not-hidden-skills SELFTEST FAIL: real tree flagged:\n${real.message}`);
    return false;
  }
  const good = { file: "fixture-good.md", text: "USMCA is the active test entity for live transaction batteries." };
  const bad = {
    file: "fixture-bad.md",
    text: "USMCA is a future carrier that launches July 2026 and is hidden until then with 0 balances.",
  };
  const goodResult = run([good]);
  if (!goodResult.ok) {
    console.error(`verify-usmca-active-not-hidden-skills SELFTEST FAIL: false positive on: ${good.text}`);
    return false;
  }
  const badResult = run([bad]);
  if (badResult.ok) {
    console.error(`verify-usmca-active-not-hidden-skills SELFTEST FAIL: false negative on: ${bad.text}`);
    return false;
  }
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    console.log(selftest() ? "verify-usmca-active-not-hidden-skills selftest PASS" : "verify-usmca-active-not-hidden-skills selftest FAIL");
    process.exit(selftest() ? 0 : 1);
  }
  const { ok, message } = run();
  console.log(message);
  process.exit(ok ? 0 : 1);
}
