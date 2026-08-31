#!/usr/bin/env node
// verify:husky-hooks-installed
// GUARD-HOOKS-01 (owner law, docs/bus/LAW-FIX-INSTANTLY-FULL-REGISTER-2026-09-01.md item 27):
// "Fresh worktree runs no hooks, exits 0 silently. .husky/_ not tracked."
//
// ROOT CAUSE, confirmed live: `git config core.hooksPath` resolves to `.husky/_` (husky v9's
// mechanism — no `_/husky.sh` sourcing needed, git invokes hook files inside that directory
// directly). `.husky/_` itself carries its own `.gitignore` containing a bare `*` — it is NEVER
// tracked, by husky's own design, and is regenerated only by the `prepare` npm lifecycle script
// (`"prepare": "husky && node scripts/setup-git-merge-drivers.mjs"`, package.json) — which fires
// on `npm install`/`npm ci`, but NOT on `git worktree add`, NOT on `npm ci --ignore-scripts`, and
// not at all if a fresh worktree is used before its own `npm install` ever runs. Git's own
// behavior when `core.hooksPath` points at a directory that does not exist (or exists but is
// empty) is to silently skip hook invocation — no error, no warning. A commit or push made from
// such a worktree runs NONE of pre-commit/commit-msg/pre-push's enforcement (money-theater,
// Rule 30 evidence shape, typecheck, the money-pr-local-gate chain) and still succeeds.
//
// This guard cannot fix a hooks-less worktree from inside a process that IS running (if this
// guard is executing at all, something is invoking scripts in this worktree — usually meaning
// hooks work, or the guard itself was invoked directly/via CI, not via the missing hook path).
// Its job is CI-side: prove the committed hook FILES are internally consistent with the
// core.hooksPath contract, and prove the `prepare` script is wired to actually populate `.husky/_`
// — a repo-shape check, not a live-hooks-firing check (that needs a real worktree + fresh install,
// out of scope for a static guard; flagged honestly in REMAINING).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-husky-hooks-installed";
const HOOK_FILES = ["pre-commit", "commit-msg", "pre-push", "post-checkout", "post-merge"];

function readPackageJson(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
}

function check(root = ROOT) {
  const problems = [];

  // 1. package.json's `prepare` script must actually invoke `husky` (the v9 install command) —
  // the ONLY mechanism that (re)creates .husky/_ and points core.hooksPath at it.
  const pkg = readPackageJson(root);
  const prepare = pkg.scripts?.prepare ?? "";
  if (!/\bhusky\b/.test(prepare)) {
    problems.push(
      `package.json "prepare" script does not invoke husky (got: ${JSON.stringify(prepare)}) — ` +
        `a fresh \`npm install\` would never create .husky/_ or set core.hooksPath, so every hook ` +
        `silently never fires.`
    );
  }

  // 2. Every tracked .husky/<hook> file must be a real, non-empty, executable-shaped script — a
  // hook that IS tracked but empty/malformed is equally silent.
  const huskyDir = path.join(root, ".husky");
  for (const hook of HOOK_FILES) {
    const hookPath = path.join(huskyDir, hook);
    if (!fs.existsSync(hookPath)) {
      problems.push(`.husky/${hook} is missing entirely.`);
      continue;
    }
    const content = fs.readFileSync(hookPath, "utf8");
    if (content.trim().length === 0) {
      problems.push(`.husky/${hook} exists but is empty.`);
    }
    if (!content.startsWith("#!")) {
      problems.push(`.husky/${hook} has no shebang line — husky v9 hooks are invoked directly, not sourced.`);
    }
  }

  // 3. `.husky/_` itself must be gitignored (confirming the intentional-regeneration design is
  // still in place) — if someone "fixes" the silent-skip by tracking .husky/_ directly instead of
  // hardening the install path, that is a worse fix (a stale committed shim silently drifts from
  // the husky version in node_modules). This guard asserts the CORRECT fix direction: make
  // `npm ci`/`npm install` reliably populate it, not commit the generated output.
  const gitignoreInHuskyUnderscore = path.join(huskyDir, "_", ".gitignore");
  // Only assert this if _/ currently exists in this checkout (it may not, in a hooks-less CI
  // runner that never ran `npm install` — that absence is exactly the risk, not a guard failure).
  if (fs.existsSync(path.join(huskyDir, "_"))) {
    if (!fs.existsSync(gitignoreInHuskyUnderscore)) {
      problems.push(`.husky/_ exists but has no .gitignore — it may be at risk of accidental tracking.`);
    } else {
      const ignoreContent = fs.readFileSync(gitignoreInHuskyUnderscore, "utf8").trim();
      if (ignoreContent !== "*") {
        problems.push(`.husky/_/.gitignore is not the expected bare "*" (got: ${JSON.stringify(ignoreContent)}).`);
      }
    }
  }

  // 4. This repo's own CI workflow must run `npm ci` (not `npm ci --ignore-scripts`) before any
  // step that relies on hooks having fired — CI itself does not run through git hooks, so this is
  // about protecting the NEXT contributor/agent who clones fresh and immediately commits.
  const ciYmlPath = path.join(root, ".github/workflows/ci.yml");
  if (fs.existsSync(ciYmlPath)) {
    const ciYml = fs.readFileSync(ciYmlPath, "utf8");
    if (/npm ci\b[^\n]*--ignore-scripts/.test(ciYml)) {
      problems.push("ci.yml runs `npm ci --ignore-scripts` somewhere — that skips the prepare/husky step entirely.");
    }
  }

  return problems;
}

function selftest() {
  // No file on disk is ever touched — a fabricated temp package.json/husky dir proves both the
  // positive and negative cases, matching this repo's convention for this class of guard.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-husky-selftest-"));
  try {
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ scripts: { prepare: "husky" } }));
    fs.mkdirSync(path.join(tmp, ".husky"), { recursive: true });
    for (const hook of HOOK_FILES) {
      fs.writeFileSync(path.join(tmp, ".husky", hook), "#!/usr/bin/env sh\necho ok\n");
    }
    const clean = check(tmp);
    if (clean.length !== 0) {
      console.error(`${LABEL} --selftest FAIL — a correctly-wired repo shape was flagged: ${JSON.stringify(clean)}`);
      process.exit(1);
    }
    console.log("  ok: correctly-wired prepare + hook files pass clean");

    // Offender: prepare script does not invoke husky.
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ scripts: { prepare: "echo noop" } }));
    const offender1 = check(tmp);
    if (!offender1.some((p) => p.includes('does not invoke husky'))) {
      console.error(`${LABEL} --selftest FAIL — a prepare script that never installs husky was not caught`);
      process.exit(1);
    }
    console.log("  caught: prepare script not invoking husky");
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ scripts: { prepare: "husky" } }));

    // Offender: an empty hook file.
    fs.writeFileSync(path.join(tmp, ".husky", "pre-commit"), "");
    const offender2 = check(tmp);
    if (!offender2.some((p) => p.includes("empty"))) {
      console.error(`${LABEL} --selftest FAIL — an empty hook file was not caught`);
      process.exit(1);
    }
    console.log("  caught: empty hook file");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const problems = check();
  if (problems.length > 0) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  ✗ " + p);
    process.exit(1);
  }
  console.log(
    `${LABEL} PASS — prepare wires husky, all ${HOOK_FILES.length} tracked hook files are real, ` +
      `.husky/_ generation contract intact. NOT checked: whether hooks actually FIRE in a fresh, ` +
      `never-npm-installed worktree — that requires a real fresh clone + install, out of scope for ` +
      `a static guard.`
  );
}
