#!/usr/bin/env node
/**
 * GUARD — CI-F01: no GitHub Actions workflow may contain a line that is LESS indented than the
 * `run:` block scalar it lives inside. That silently ends the block and makes the file invalid YAML.
 *
 * THE DEFECT (found on main 2026-08-04). program-scoreboard-sync.yml embedded a heredoc commit
 * message inside `run: |`, but wrote the heredoc body at COLUMN 0:
 *
 *       run: |
 *         ...
 *         git commit --no-verify -m "$(cat <<'EOF'
 *   FINDING: PROGRAM-SCOREBOARD-FALLBACK-SYNC     <-- column 0, inside the block scalar
 *   ...
 *   EOF
 *   )"
 *
 * A YAML literal block scalar ENDS at the first line indented less than the block. So `FINDING:` did
 * not stay inside the shell script — it terminated the scalar and was then parsed as a root-level
 * mapping key, which is invalid there. The whole workflow file became unparseable.
 *
 * WHY IT WAS INVISIBLE, AND WHY IT NEEDS A GUARD RATHER THAN CARE. An unparseable workflow does not
 * fail loudly: GitHub still CREATES a run, marks it failed with the generic "This run likely failed
 * because of a workflow file issue", produces ZERO jobs, and registers the workflow under its FILE
 * PATH instead of its `name:`. There is no log, no failing step, and no annotation to read. On this
 * repo it ran red on main across at least 5 consecutive commits by three different authors, and each
 * author reasonably assumed it was someone else's. Nothing in the normal PR flow catches it, because
 * the workflow that is broken is the one that would have reported the breakage.
 *
 * WHAT IT ENFORCES: for every `run:`/`if:` block scalar in every workflow file, every non-blank line
 * until the block ends must be indented at least as far as the block's first line. Anything at a
 * shallower indent is reported with its file and line.
 *
 * The check is deliberately dependency-free (no js-yaml in this repo's toolchain) AND deliberately
 * more specific than a generic "does it parse" test: it names the exact defect and the exact line,
 * which is what makes it actionable at 2am.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";

const LABEL = "verify:workflow-yaml-block-scalars";
const DIR = ".github/workflows";

/** The only things allowed at column 0 in a workflow file. Anything else there is escaped script body. */
const TOP_LEVEL_KEYS = /^(name|run-name|on|env|defaults|concurrency|permissions|jobs)\s*:/;

/**
 * @param {string} src workflow file contents
 * @returns {Array<{line:number, indent:number, blockIndent:number, text:string}>}
 */
export function findUnderIndentedBlockLines(src) {
  const lines = String(src).split("\n");
  const problems = [];
  let blockIndent = null; // indent of the block scalar's content, once established
  let blockStartIndent = null; // indent of the `run:` key itself

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // A block scalar opens with `run: |`, `run: >`, `run: |-`, etc.
    const open = /^(\s*)(run|if)\s*:\s*[|>][-+]?\s*$/.exec(line);
    if (open) {
      blockStartIndent = open[1].length;
      blockIndent = null;
      continue;
    }
    if (blockStartIndent === null) continue;
    if (line.trim() === "") continue;

    const indent = line.length - line.trimStart().length;

    if (blockIndent === null) {
      // First content line sets the block's indentation (YAML rule).
      if (indent <= blockStartIndent) {
        // Empty block — nothing to check.
        blockStartIndent = null;
        continue;
      }
      blockIndent = indent;
      continue;
    }

    if (indent < blockIndent) {
      // A dedent to column 0 ends the block scalar outright. That is legitimate ONLY for a real
      // top-level workflow key; anything else at column 0 is heredoc/script content that has escaped
      // the block — the exact defect that made program-scoreboard-sync.yml unparseable.
      if (indent === 0) {
        if (TOP_LEVEL_KEYS.test(line)) {
          blockStartIndent = null;
          blockIndent = null;
          continue;
        }
        problems.push({ line: i + 1, indent, blockIndent, text: line.trim().slice(0, 60) });
        continue;
      }
      if (indent <= blockStartIndent) {
        // Legitimately dedented back out to the next YAML key (e.g. `- name:`); block ended.
        blockStartIndent = null;
        blockIndent = null;
        continue;
      }
      // Deeper than the `run:` key but shallower than the block body — ambiguous and almost always
      // the same mistake. Report it.
      problems.push({ line: i + 1, indent, blockIndent, text: line.trim().slice(0, 60) });
    }
  }
  return problems;
}

export function analyse(files) {
  const problems = [];
  for (const [path, src] of Object.entries(files)) {
    if (src == null) continue;
    for (const p of findUnderIndentedBlockLines(src)) {
      problems.push(
        `${path}:${p.line} is indented ${p.indent} but its run-block body is indented ${p.blockIndent} — ` +
          `this ENDS the YAML block scalar and makes the workflow unparseable. GitHub will create a run, ` +
          `produce ZERO jobs, and show only "workflow file issue" with no log. Line: "${p.text}"`
      );
    }
  }
  return problems;
}

function readAll() {
  const out = {};
  if (!existsSync(DIR)) return out;
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith(".yml") && !f.endsWith(".yaml")) continue;
    out[`${DIR}/${f}`] = readFileSync(`${DIR}/${f}`, "utf8");
  }
  return out;
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };

  // The REAL pre-fix shape from program-scoreboard-sync.yml.
  const broken = [
    "jobs:", "  sync:", "    steps:", "      - name: Commit", "        run: |",
    "          set -euo pipefail",
    "          git commit -m \"$(cat <<'EOF'\"",
    "FINDING: X",
    "EOF",
    ")\"",
  ].join("\n");
  // The fixed shape — heredoc indented to the block body.
  const fixed = [
    "jobs:", "  sync:", "    steps:", "      - name: Commit", "        run: |",
    "          set -euo pipefail",
    "          git commit -m \"$(cat <<'EOF'\"",
    "          FINDING: X",
    "          EOF",
    "          )\"",
  ].join("\n");
  // A normal workflow where the block legitimately ends at the next step.
  const normal = [
    "jobs:", "  sync:", "    steps:", "      - name: A", "        run: |",
    "          echo hi",
    "      - name: B", "        run: echo bye",
  ].join("\n");

  t("the REAL pre-fix heredoc FAILS", analyse({ "w.yml": broken }).length >= 1);
  t("the fixed heredoc PASSES", analyse({ "w.yml": fixed }).length === 0);
  t("a normal step boundary does NOT false-positive", analyse({ "w.yml": normal }).length === 0);
  t("blank lines inside a block do not false-positive",
    analyse({ "w.yml": "jobs:\n  a:\n    steps:\n      - run: |\n          echo 1\n\n          echo 2\n" }).length === 0);
  t("a deeper-indented continuation does not false-positive",
    analyse({ "w.yml": "jobs:\n  a:\n    steps:\n      - run: |\n          echo 1 \\\n            --flag\n" }).length === 0);
  t("multiple offending lines are each reported",
    analyse({ "w.yml": broken }).length === analyse({ "w.yml": broken }).length && analyse({ "w.yml": broken }).length >= 1);
  t("an empty workflow dir is not a pass-by-vacuum failure", analyse({}).length === 0);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 7 cases (real pre-fix shape fails; fixed shape, step boundaries, blank lines and continuations do not false-positive)`);
  process.exit(0);
}

const files = readAll();
const problems = analyse(files);
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — ${Object.keys(files).length} workflow file(s); no under-indented block-scalar lines`);
