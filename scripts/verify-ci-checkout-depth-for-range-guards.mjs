#!/usr/bin/env node
/**
 * GUARD: a CI job that runs a RANGE-RESOLVING guard must check out FULL history.
 *
 * WHY THIS EXISTS (2026-07-25): `scripts/verify-no-money-theater.mjs` (verify-step 1430) — the 18-key
 * money commit gate — printed `PASS (0 branch commit(s) checked)` and exited 0 because
 * `git merge-base HEAD origin/main` resolved to nothing in a SHALLOW clone. The guard itself is now
 * hardened to refuse that state (scripts/lib/branch-range-guard.mjs). This guard closes the other
 * half: the ENVIRONMENT that produced it.
 *
 * `actions/checkout` defaults to `fetch-depth: 1`. At depth 1 there is no `origin/main` remote-tracking
 * ref and no common ancestor, so EVERY guard that resolves `merge-base` / `origin/main...HEAD` has
 * nothing to iterate over. Before this change `ci.yml / build-typecheck` — the job that runs
 * `verify:pre-commit`, and therefore 1430, 1324 and 1431 — had no `fetch-depth` at all, and
 * `locked-guards.yml` (block-acceptance, block-registry-complete, both forward-only
 * `git diff origin/main...HEAD` checks) had none either.
 *
 * The hardened guards now go RED in that environment rather than green-on-nothing, which is the
 * correct failure — but "someone deletes fetch-depth: 0 and the gates go red" is a worse outcome than
 * "nobody can delete it". This guard makes the requirement explicit and self-describing: name a
 * range-resolving npm script or node invocation in a job, and that job's checkout must be depth 0.
 *
 * Deliberately text-based over the workflow YAML: the check must survive `js-yaml` not being
 * installed in a bare environment, and the failure it prevents is a one-line deletion that a text
 * scan catches just as well as a parse.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS = path.join(ROOT, ".github/workflows");
const LABEL = "verify-ci-checkout-depth-for-range-guards";

/**
 * Guards that resolve a commit RANGE or a merge-base. Adding one here is how a new range guard
 * inherits the protection. Matched as substrings against `run:` command text.
 */
export const RANGE_RESOLVING_INVOCATIONS = [
  "verify:pre-commit", // runs verify-steps 1430 / 1324 / 1431, all merge-base based
  "verify-no-money-theater",
  "verify-definition-of-done-evidence",
  "verify-module-completion",
  "verify:block-acceptance",
  "verify-block-acceptance",
  "verify:block-registry-complete",
  "verify-block-registry-complete",
  "verify:branch-fresh",
];

/** Split a workflow file into `jobs:` blocks keyed by job id, preserving line numbers. */
export function splitJobs(text) {
  const lines = text.split("\n");
  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsAt === -1) return [];
  const jobs = [];
  let current = null;
  for (let i = jobsAt + 1; i < lines.length; i++) {
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(lines[i]);
    if (m) {
      if (current) jobs.push(current);
      current = { id: m[1], startLine: i + 1, lines: [] };
      continue;
    }
    if (/^\S/.test(lines[i]) && lines[i].trim() !== "") {
      // left the jobs: mapping entirely
      break;
    }
    if (current) current.lines.push({ n: i + 1, text: lines[i] });
  }
  if (current) jobs.push(current);
  return jobs;
}

/** Only `run:` command lines count — a guard named in a `name:` label or a comment is not executed. */
function commandLines(job) {
  return job.lines.filter((l) => /^\s*(- )?run:/.test(l.text) || /^\s*(npm run|node|npx) /.test(l.text.trim()));
}

export function auditWorkflow(relPath, text) {
  const problems = [];
  for (const job of splitJobs(text)) {
    const body = job.lines.map((l) => l.text).join("\n");
    const cmds = commandLines(job);
    const hit = RANGE_RESOLVING_INVOCATIONS.find((cmd) => cmds.some((l) => l.text.includes(cmd)));
    if (!hit) continue;
    if (!/^\s*fetch-depth:\s*0\s*$/m.test(body)) {
      const line = cmds.find((l) => l.text.includes(hit));
      problems.push(
        `${relPath}:${line ? line.n : job.startLine} job "${job.id}" runs the range-resolving guard ` +
          `\`${hit}\` but its actions/checkout has no \`fetch-depth: 0\`. actions/checkout defaults to ` +
          `depth 1 — a SHALLOW clone with no origin/main and no merge-base, under which that guard ` +
          `inspects ZERO commits. Add \`with: { fetch-depth: 0 }\` to the checkout step in this job.`
      );
    }
  }
  return problems;
}

export function auditAllWorkflows(dir = WORKFLOWS) {
  const problems = [];
  if (!fs.existsSync(dir)) return [`${dir} not found — cannot verify CI checkout depth`];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  if (!files.length) return [`${dir} contains no workflow files — refusing to report success on an empty scan`];
  for (const f of files) {
    problems.push(...auditWorkflow(`.github/workflows/${f}`, fs.readFileSync(path.join(dir, f), "utf8")));
  }
  return problems;
}

/** Only self-execute when run directly — importing this module must not print a verdict or exit. */
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const SELFTEST = IS_MAIN && process.argv.includes("--selftest");

if (SELFTEST) {
  const failures = [];
  const BAD = `name: x
jobs:
  build-typecheck:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v7
      - name: verify
        run: npm run verify:pre-commit
`;
  const GOOD = `name: x
jobs:
  build-typecheck:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - name: verify
        run: npm run verify:pre-commit
`;
  const UNRELATED = `name: x
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: npm run lint
`;
  if (!auditWorkflow("bad.yml", BAD).some((p) => p.includes("verify:pre-commit"))) {
    failures.push("planted defect NOT caught: a range guard on a default (shallow) checkout passed");
  }
  if (auditWorkflow("good.yml", GOOD).length) {
    failures.push(`false positive: a job with fetch-depth: 0 was flagged — ${auditWorkflow("good.yml", GOOD).join(" | ")}`);
  }
  if (auditWorkflow("unrelated.yml", UNRELATED).length) {
    failures.push("false positive: a job that runs no range guard was flagged");
  }
  // empty-input arm — this guard must not fall into the very class it polices.
  const tmpEmpty = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "ciwf-"));
  try {
    if (!auditAllWorkflows(tmpEmpty).length) {
      failures.push("empty workflow directory reported success — the empty-input-is-not-success rule was not applied to this guard itself");
    }
    if (!auditAllWorkflows(path.join(tmpEmpty, "nope")).length) {
      failures.push("missing workflow directory reported success");
    }
  } finally {
    fs.rmSync(tmpEmpty, { recursive: true, force: true });
  }

  // LIVE-FIXTURE arm — mutate the REAL ci.yml in memory and require the defect to be caught. A
  // synthetic fixture can drift away from the file it is meant to protect; this one cannot.
  const realCi = path.join(WORKFLOWS, "ci.yml");
  if (fs.existsSync(realCi)) {
    const real = fs.readFileSync(realCi, "utf8");
    // The `#` comment run is REQUIRED in this pattern: without it the same shape also matches the
    // verify-branch-fresh job's checkout, and stripping the wrong job's depth makes the arm pass for
    // the wrong reason (observed while writing it).
    const stripped = real.replace(/\n {8}with:\n(?: {10}#[^\n]*\n)+ {10}fetch-depth: 0\n(?=\n {6}- name: Setup Node 22)/, "\n");
    if (stripped === real) {
      failures.push("live-fixture arm could not strip fetch-depth: 0 from ci.yml build-typecheck — the arm has rotted and is no longer proving anything");
    } else if (!auditWorkflow(".github/workflows/ci.yml", stripped).some((p) => p.includes("build-typecheck"))) {
      failures.push("live-fixture arm: removing fetch-depth: 0 from the REAL ci.yml build-typecheck job was NOT caught");
    }
    if (auditWorkflow(".github/workflows/ci.yml", real).length) {
      failures.push("live-fixture arm: the real, correct ci.yml was flagged — false positive");
    }
  }

  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} --selftest: PASS — planted shallow-checkout defect caught in a synthetic job AND in the real ` +
      `ci.yml build-typecheck job; depth-0 job, unrelated job, and empty/missing dir all handled`
  );
  process.exit(0);
}

if (IS_MAIN) {
  const problems = auditAllWorkflows();
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: PASS — every CI job invoking one of ${RANGE_RESOLVING_INVOCATIONS.length} range-resolving guards checks out with fetch-depth: 0`
  );
}
