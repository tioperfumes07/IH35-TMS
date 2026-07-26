/**
 * SHARED PRECONDITION: "I looked at nothing" may never be reported as success.
 *
 * WHY THIS EXISTS (measured, 2026-07-25):
 * `scripts/verify-no-money-theater.mjs` (verify-step 1430) — the gate that enforces the 18-key money
 * commit checklist — printed:
 *
 *     verify-no-money-theater: PASS (0 branch commit(s) checked)      exit 0
 *
 * on a branch whose ONLY commit touched `apps/backend/src/accounting/` with an EntityLink/honesty
 * subject and not one of the 18 keys. It examined zero commits and returned success. The cause was
 * three lines:
 *
 *     const base = sh("git merge-base HEAD origin/main") || sh("git merge-base HEAD main");
 *     if (!base) return [];                 // <- shallow clone: no merge-base exists
 *     ...
 *     console.log(`PASS (${commits.length} branch commit(s) checked)`);   // <- 0 reads as success
 *
 * In a SHALLOW clone there is no common ancestor with the base branch, so the range resolves empty
 * and "nothing to check" was silently treated as "nothing wrong". Reproduced end to end: the same
 * commit that PASSed in a `--depth=1` clone FAILED with 3 problems after `git fetch --unshallow`.
 * A shallow checkout is the DEFAULT for `actions/checkout` and for agent worktrees, so the money
 * gate could be vacuous exactly where it matters most, and every downstream check trusts it.
 *
 * THE RULE THIS ENCODES: an empty commit range is a FINDING unless the guard can name a legitimate
 * reason for it. Exactly one legitimate reason exists — HEAD *is* the merge-base with the base
 * branch (a post-merge run on `main`, or a freshly cut branch with no commits yet). Everything else
 * — shallow clone, missing base ref, no merge-base (orphan branch), or a range that came back empty
 * while HEAD sits above the base — is FATAL, loudly, with the remedy named.
 *
 * Shared rather than copied so 1430 / 1324 / 1431 can never drift into three different answers to
 * "is this range trustworthy?".
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Tried in order; the first ref that EXISTS is the base, whether or not it shares history. */
export const BASE_REF_CANDIDATES = ["origin/main", "main"];

export const RANGE_CODES = {
  SHALLOW_CLONE: "SHALLOW_CLONE",
  NO_BASE_REF: "NO_BASE_REF",
  NO_MERGE_BASE: "NO_MERGE_BASE",
  EMPTY_RANGE: "EMPTY_RANGE",
  LEGITIMATE_ZERO: "LEGITIMATE_ZERO",
  RANGE_OK: "RANGE_OK",
};

function git(args, cwd) {
  try {
    return execSync(`git ${args}`, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

/**
 * Ask git — never infer — whether this working copy can support a base..HEAD range at all.
 * Pure data out, so `classifyCommitRange` stays a total function the selftest can drive.
 */
export function collectGitFacts(cwd = process.cwd(), baseRefs = BASE_REF_CANDIDATES) {
  const shallow = git("rev-parse --is-shallow-repository", cwd) === "true";
  const head = git("rev-parse HEAD", cwd);

  let baseRef = "";
  let base = "";
  let baseRefExists = false;
  for (const ref of baseRefs) {
    if (!git(`rev-parse --verify --quiet ${ref}^{commit}`, cwd)) continue;
    baseRefExists = true;
    if (!baseRef) baseRef = ref;
    const b = git(`merge-base HEAD ${ref}`, cwd);
    if (b) {
      base = b;
      baseRef = ref;
      break;
    }
  }
  return { shallow, head, base, baseRef, baseRefExists };
}

/** The real commit list for the range. Returns [] only when there is genuinely no base. */
export function rangeCommitShas(facts, cwd = process.cwd()) {
  if (!facts.base) return [];
  return git(`rev-list ${facts.base}..HEAD`, cwd).split("\n").filter(Boolean);
}

const shortSha = (s) => (s ? s.slice(0, 9) : "(none)");

/**
 * Total function: every combination of facts maps to exactly one verdict, and only ONE of them is
 * an OK with zero commits. `fatal` is the message to print before exiting non-zero.
 */
export function classifyCommitRange(facts) {
  const { shallow, head, base, baseRef, baseRefExists } = facts;
  const count = facts.commitCount ?? 0;
  const ok = (code, note) => ({ fatal: null, code, note });
  const fatal = (code, message) => ({ fatal: message, code, note: message });

  if (shallow) {
    return fatal(
      RANGE_CODES.SHALLOW_CLONE,
      `REFUSING TO REPORT SUCCESS — this is a SHALLOW clone (\`git rev-parse --is-shallow-repository\` = true).\n` +
        `  Shallow history has no reliable merge-base with ${baseRef || "the base branch"}, so the commit range\n` +
        `  resolves EMPTY or TRUNCATED and this guard would report "PASS (0 commit(s) checked)" having verified\n` +
        `  NOTHING. An unchecked money gate is worse than a red one.\n` +
        `  FIX (local/worktree): git fetch --unshallow origin\n` +
        `  FIX (CI): give the job's actions/checkout step \`fetch-depth: 0\` — the default is depth 1.`
    );
  }
  if (!baseRefExists) {
    return fatal(
      RANGE_CODES.NO_BASE_REF,
      `REFUSING TO REPORT SUCCESS — none of the base refs ${BASE_REF_CANDIDATES.join(" / ")} exists in this\n` +
        `  checkout, so there is no range to check and the guard would pass vacuously.\n` +
        `  FIX: git fetch origin main:refs/remotes/origin/main   (CI: actions/checkout \`fetch-depth: 0\`).`
    );
  }
  if (!base) {
    return fatal(
      RANGE_CODES.NO_MERGE_BASE,
      `REFUSING TO REPORT SUCCESS — HEAD ${shortSha(head)} has NO merge-base with ${baseRef}.\n` +
        `  The range ${baseRef}..HEAD is therefore unresolvable and every commit on this branch would go\n` +
        `  unchecked. Causes, in order of likelihood: a shallow/partial fetch that truncated the common\n` +
        `  ancestor, a stale ${baseRef}, or a genuine orphan branch (\`git checkout --orphan\`).\n` +
        `  FIX: git fetch --unshallow origin  (or \`git fetch origin main\`). An orphan branch must be\n` +
        `  rebased onto ${baseRef} before it can be gated — it is not a legitimate zero.`
    );
  }
  if (count === 0) {
    // The ONLY legitimate zero: HEAD is the merge-base, i.e. this checkout sits ON or BEHIND the base
    // branch. That is a post-merge run on main, or a branch cut but not yet committed to. There is
    // genuinely nothing authored here to gate, and saying so is honest rather than vacuous.
    if (base === head) {
      return ok(
        RANGE_CODES.LEGITIMATE_ZERO,
        `0 commits — LEGITIMATE: HEAD ${shortSha(head)} IS the merge-base with ${baseRef}, so this checkout is ` +
          `on/behind the base branch and authored no commits to gate.`
      );
    }
    return fatal(
      RANGE_CODES.EMPTY_RANGE,
      `REFUSING TO REPORT SUCCESS — the range ${baseRef}..HEAD came back EMPTY, yet HEAD ${shortSha(head)} is\n` +
        `  not the merge-base ${shortSha(base)}. Commits exist above the base but none were enumerated, which\n` +
        `  means the range resolution itself failed (swallowed git error, corrupt/partial object store).\n` +
        `  FIX: re-fetch full history (git fetch --unshallow origin) and re-run; do not ignore this.`
    );
  }
  return ok(RANGE_CODES.RANGE_OK, `${count} branch commit(s) over ${baseRef}..HEAD`);
}

/**
 * Convenience for a guard's main path: resolve, refuse loudly, or hand back the commit shas plus the
 * stated reason that must be printed alongside any PASS.
 */
export function resolveGatedRange(label, cwd = process.cwd()) {
  const facts = collectGitFacts(cwd);
  const shas = rangeCommitShas(facts, cwd);
  const verdict = classifyCommitRange({ ...facts, commitCount: shas.length });
  if (verdict.fatal) {
    console.error(`${label}: FAIL [${verdict.code}]\n  ${verdict.fatal}`);
    process.exit(1);
  }
  return { facts, shas, verdict };
}

// ---------------------------------------------------------------------------------------------
// SELFTEST — pure arms for total coverage of the classifier, plus REAL-GIT arms so the shallow and
// no-merge-base detections are proven against actual git, not against booleans I typed myself.
// ---------------------------------------------------------------------------------------------

const GIT_ID = `-c user.email=guard@example.invalid -c user.name=guard -c commit.gpgsign=false -c core.hooksPath=/dev/null`;

function mkOriginRepo(root, commits = 3) {
  const origin = path.join(root, "origin");
  fs.mkdirSync(origin, { recursive: true });
  execSync(`git init -q ${origin}`, { stdio: "ignore" });
  execSync(`git symbolic-ref HEAD refs/heads/main`, { cwd: origin, stdio: "ignore" });
  for (let i = 0; i < commits; i++) {
    fs.writeFileSync(path.join(origin, `f${i}.txt`), `${i}\n`);
    execSync(`git add -A && git ${GIT_ID} commit -q -m "c${i}"`, { cwd: origin, stdio: "ignore" });
  }
  return origin;
}

export function selftestBranchRangeGuard() {
  const failures = [];

  // ---- pure arms -----------------------------------------------------------------------------
  const H = "a".repeat(40);
  const base = (o) => ({ shallow: false, head: H, base: H, baseRef: "origin/main", baseRefExists: true, commitCount: 3, ...o });
  const arm = (name, facts, wantCode, wantFatal) => {
    const v = classifyCommitRange(base(facts));
    if (v.code !== wantCode || Boolean(v.fatal) !== wantFatal) {
      failures.push(`${name}: expected code=${wantCode} fatal=${wantFatal}, got code=${v.code} fatal=${Boolean(v.fatal)}`);
    }
  };
  arm("pure/shallow-fails", { shallow: true }, RANGE_CODES.SHALLOW_CLONE, true);
  arm("pure/shallow-fails-even-with-commits", { shallow: true, commitCount: 9 }, RANGE_CODES.SHALLOW_CLONE, true);
  arm("pure/no-base-ref-fails", { baseRefExists: false, base: "", baseRef: "" }, RANGE_CODES.NO_BASE_REF, true);
  arm("pure/no-merge-base-fails", { base: "" }, RANGE_CODES.NO_MERGE_BASE, true);
  arm("pure/empty-range-above-base-fails", { commitCount: 0, base: "b".repeat(40) }, RANGE_CODES.EMPTY_RANGE, true);
  arm("pure/legitimate-zero-on-base-passes", { commitCount: 0 }, RANGE_CODES.LEGITIMATE_ZERO, false);
  arm("pure/healthy-range-passes", {}, RANGE_CODES.RANGE_OK, false);

  // The bug in one assertion: the OLD code's entire input (base absent => []) must now be fatal.
  const legacy = classifyCommitRange(base({ base: "", commitCount: 0 }));
  if (!legacy.fatal) failures.push("pure/legacy-shape: the exact condition that produced 'PASS (0 branch commit(s) checked)' still passes");
  if (legacy.fatal && !/unshallow/.test(legacy.fatal)) failures.push("pure/legacy-shape: fatal message does not name the `git fetch --unshallow` remedy");

  // ---- real-git arms -------------------------------------------------------------------------
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rangeguard-"));
  try {
    const origin = mkOriginRepo(tmp);

    // arm A — a genuinely SHALLOW clone (`--depth=1`) must be refused, not passed.
    const shallowDir = path.join(tmp, "shallow");
    execSync(`git clone -q --depth=1 file://${origin} ${shallowDir}`, { stdio: "ignore" });
    const shallowFacts = collectGitFacts(shallowDir);
    if (!shallowFacts.shallow) {
      failures.push("real/shallow: `git clone --depth=1` was not detected as shallow — the fixture is wrong, not git");
    }
    const shallowVerdict = classifyCommitRange({ ...shallowFacts, commitCount: rangeCommitShas(shallowFacts, shallowDir).length });
    if (shallowVerdict.code !== RANGE_CODES.SHALLOW_CLONE || !shallowVerdict.fatal) {
      failures.push(`real/shallow: a real depth=1 clone was not refused (code=${shallowVerdict.code})`);
    }

    // arm B — full clone, real feature branch with a real commit: still PASSES (coverage not lost).
    const fullDir = path.join(tmp, "full");
    execSync(`git clone -q file://${origin} ${fullDir}`, { stdio: "ignore" });
    execSync(`git checkout -q -b feature`, { cwd: fullDir, stdio: "ignore" });
    fs.writeFileSync(path.join(fullDir, "new.txt"), "x\n");
    execSync(`git add -A && git ${GIT_ID} commit -q -m "feature commit"`, { cwd: fullDir, stdio: "ignore" });
    const fullFacts = collectGitFacts(fullDir);
    const fullShas = rangeCommitShas(fullFacts, fullDir);
    const fullVerdict = classifyCommitRange({ ...fullFacts, commitCount: fullShas.length });
    if (fullFacts.shallow) failures.push("real/healthy: a full clone was misreported as shallow (false positive)");
    if (fullVerdict.code !== RANGE_CODES.RANGE_OK || fullVerdict.fatal) {
      failures.push(`real/healthy: a healthy branch was refused (code=${fullVerdict.code}) — false positive`);
    }
    if (fullShas.length !== 1) failures.push(`real/healthy: expected 1 branch commit, enumerated ${fullShas.length}`);

    // arm C — orphan branch: no merge-base at all. Explicitly NOT a legitimate zero.
    const orphanDir = path.join(tmp, "orphan");
    execSync(`git clone -q file://${origin} ${orphanDir}`, { stdio: "ignore" });
    execSync(`git checkout -q --orphan lonely`, { cwd: orphanDir, stdio: "ignore" });
    execSync(`git rm -rq --cached . || true`, { cwd: orphanDir, stdio: "ignore" });
    fs.writeFileSync(path.join(orphanDir, "solo.txt"), "solo\n");
    execSync(`git add -A && git ${GIT_ID} commit -q -m "orphan root"`, { cwd: orphanDir, stdio: "ignore" });
    const orphanFacts = collectGitFacts(orphanDir);
    const orphanVerdict = classifyCommitRange({ ...orphanFacts, commitCount: rangeCommitShas(orphanFacts, orphanDir).length });
    if (orphanVerdict.code !== RANGE_CODES.NO_MERGE_BASE || !orphanVerdict.fatal) {
      failures.push(`real/orphan: an orphan branch was not refused (code=${orphanVerdict.code})`);
    }

    // arm D — sitting ON the base branch (post-merge main run): the one legitimate zero, and it must
    // still PASS or every push to main goes red.
    const onMainDir = path.join(tmp, "onmain");
    execSync(`git clone -q file://${origin} ${onMainDir}`, { stdio: "ignore" });
    const mainFacts = collectGitFacts(onMainDir);
    const mainVerdict = classifyCommitRange({ ...mainFacts, commitCount: rangeCommitShas(mainFacts, onMainDir).length });
    if (mainVerdict.code !== RANGE_CODES.LEGITIMATE_ZERO || mainVerdict.fatal) {
      failures.push(`real/on-base: a post-merge main checkout was refused (code=${mainVerdict.code}) — that would red every push to main`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  return failures;
}
