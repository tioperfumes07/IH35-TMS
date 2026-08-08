#!/usr/bin/env node
/**
 * CLS-GUARD-READS-COMMENTS — a guard that matches CODE patterns against RAW source reads prose as
 * code, in both directions:
 *
 *   · prose SATISFIES a check the code no longer satisfies (a vacuous control that passes green), and
 *   · prose CAUSES a false failure, which perversely punishes documenting a fix.
 *
 * Both are live, not theoretical. `scripts/lib/mask-comments.mjs` records four; a fifth was proven on
 * 2026-08-07 while draining CLS-GUC-CALLER-SCOPED: the fix for GET /api/v1/mdata/units/:id/financial
 * carried a comment mentioning `org.user_accessible_company_ids()`, one of the alternatives
 * `verify-caller-scoped-guc-membership` accepts as authorization. Deleting the real
 * resolveOperatingCompanyId call and restoring the raw caller-supplied `set_config` STILL exited 0 —
 * the comment alone kept the guard green.
 *
 * THE SHARED FIX EXISTS: `scripts/lib/mask-comments.mjs`. It is quote-aware (a `//` inside a string or
 * a SQL template literal is not a comment) and OFFSET-PRESERVING (comment bytes become spaces,
 * newlines kept), which matters because guards report line numbers and compare positions — "the
 * assert occurs before the GUC set" is a comparison a stripping approach silently invalidates. Marker
 * comments that guards deliberately depend on (`membership-scope-exempt:`, `invite-entity-gate-exempt:`)
 * stay detectable by matching them against the RAW source.
 *
 * THIS GUARD IS A RATCHET, not a hard zero. The first full-tree measurement found 650+ pre-existing
 * source-reading guards with a call-shaped pattern and no masking. Converting them blind would be
 * reckless and failing the build on all of them would just get this disabled. So the known set is
 * pinned and may only SHRINK: a NEW guard that reads source and matches call-shaped patterns must
 * import the masker, and the existing set is drained as an open class on the board.
 *
 * Usage: node scripts/verify-guards-mask-comments.mjs [--write-baseline] [--selftest]
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SCRIPTS = join(ROOT, "scripts");
const BASELINE_PATH = "scripts/guards-mask-comments-baseline.json";
const LABEL = "verify-guards-mask-comments";

/** The shared masker, by import path. Any of the spellings a guard might use. */
const IMPORTS_MASKER = /lib\/mask-comments(?:\.mjs)?/;

/** Reads repo source to analyse it — the precondition for reading prose as code. */
const READS_SOURCE = /readFileSync\s*\(/;

/**
 * A regex literal that matches a JS CALL — an identifier immediately followed by an ESCAPED open
 * paren, e.g. /assertCompanyMembership\(/ . The escape is what makes this specific: `\(` inside a
 * regex literal is how a guard asks "is this function called here", and that question is exactly the
 * one a comment can answer falsely. A plain `(` is a capture group and says nothing about calls.
 *
 * Deliberately NOT matched: string concatenation building a pattern at runtime. Those exist, but a
 * detector that guessed at them would produce a baseline nobody trusts; the ratchet is worth more
 * than the extra coverage. Anything it misses is missed coverage, never a false failure.
 */
const CALL_SHAPED_PATTERN = /\/[^\n]*?[A-Za-z_][A-Za-z0-9_]*\\\(/;

/** A guard that only ever masks its own source (self-referential tools) is not in the class. */
export function isCommentBlindGuard(src) {
  if (IMPORTS_MASKER.test(src)) return false;
  if (!READS_SOURCE.test(src)) return false;
  return CALL_SHAPED_PATTERN.test(src);
}

export function scan(files, read) {
  return files.filter((f) => isCommentBlindGuard(read(f))).sort();
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["reads source + call-shaped pattern, no masker → IN the class", `import {readFileSync} from "node:fs";\nconst RE = /assertCompanyMembership\\(/;\nreadFileSync(p);`, true],
    ["same guard once it imports the masker → OUT", `import {readFileSync} from "node:fs";\nimport {maskComments} from "./lib/mask-comments.mjs";\nconst RE = /assertCompanyMembership\\(/;\nreadFileSync(p);`, false],
    ["reads source but has no call-shaped pattern → OUT", `import {readFileSync} from "node:fs";\nconst RE = /^[0-9]+$/;\nreadFileSync(p);`, false],
    ["call-shaped pattern but never reads source → OUT", `const RE = /assertCompanyMembership\\(/;\nconsole.log(RE);`, false],
    // A capture group is not a call. Treating `(` as evidence would sweep in most of the tree and
    // make the baseline meaningless.
    ["a capture group is not a call pattern", `import {readFileSync} from "node:fs";\nconst RE = /(foo|bar)/;\nreadFileSync(p);`, false],
  ];
  let bad = 0;
  for (const [name, src, expected] of cases) {
    const got = isCommentBlindGuard(src);
    if (got !== expected) {
      bad++;
      console.error(`  selftest FAIL: ${name} — expected ${expected}, got ${got}`);
    }
  }
  if (bad) {
    console.error(`${LABEL} --selftest: ${bad} case(s) failed`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: ${cases.length} cases pass`);
  process.exit(0);
}

const files = readdirSync(SCRIPTS).filter((f) => /^verify-.*\.mjs$/.test(f));
const current = scan(files, (f) => readFileSync(join(SCRIPTS, f), "utf8"));

if (process.argv.includes("--write-baseline")) {
  writeFileSync(join(ROOT, BASELINE_PATH), `${JSON.stringify(current, null, 2)}\n`);
  console.log(`${LABEL}: baseline written — ${current.length} comment-blind guard(s).`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(join(ROOT, BASELINE_PATH), "utf8"));
} catch {
  console.error(`FAIL ${LABEL}: baseline missing at ${BASELINE_PATH} — run with --write-baseline.`);
  process.exit(1);
}
const baselineSet = new Set(baseline);
const added = current.filter((f) => !baselineSet.has(f));

if (added.length) {
  console.error(`FAIL ${LABEL} — new guard(s) match code patterns against RAW source, so a COMMENT can satisfy or break them:`);
  for (const f of added) console.error(`  · scripts/${f}`);
  console.error(`\n  Add:  import { maskComments } from "./lib/mask-comments.mjs";`);
  console.error(`  then analyse maskComments(raw) instead of raw. It is offset-preserving, so line`);
  console.error(`  numbers and position comparisons stay valid, and quote-aware, so a "//" inside a SQL`);
  console.error(`  template literal is not blanked. Match deliberate MARKER comments (…-exempt:) against`);
  console.error(`  the RAW source. The baseline may only SHRINK — do not add to it.`);
  process.exit(1);
}

const fixed = baseline.filter((f) => !current.includes(f));
if (fixed.length) {
  console.log(`${LABEL}: OK — ${fixed.length} baseline guard(s) now mask comments. Re-run with --write-baseline to tighten the ratchet.`);
} else {
  console.log(`${LABEL}: OK — ratchet holding at ${current.length} known comment-blind guard(s); 0 new.`);
}
