#!/usr/bin/env node
/**
 * GUARD: every money commit must CONFIRM Claude-coder + DoD consolidated checklist
 * or FAIL (commit-msg + CI verify-step 1430).
 *
 * Source of truth (same list): docs/specs/DEFINITION-OF-DONE.md §10
 * Consolidated from: DEFINITION-OF-DONE · FULL-AUDIT-LAW · Full Linkage Audit RTF
 *   (Claude coder paste 2026-07-24 17:56 CDT)
 *
 * Required keys:
 *   FINDING · LANE · DOD-A..E · VERIFY-1..8 · MODULE_PROGRESS · ROOT CAUSE · FIX · GUARD · LIVE PROOF|UNVERIFIED · REMAINING
 * Migration commits also: MIGRATE: …
 *
 * Theater subjects (EntityLink/honesty/fake N-of-M) without write/pull/post path → FAIL.
 * MODULE_PROGRESS N of M must match docs/module-completion/<module>.json (Rule 24).
 *
 * ZERO-COMMIT FAKE-GREEN (fixed 2026-07-25): this guard used to end with
 *   `console.log("PASS (" + commits.length + " branch commit(s) checked)")`
 * and `listBranchCommits()` returned `[]` whenever `git merge-base` found nothing — which is exactly
 * what happens in a SHALLOW clone (the actions/checkout default, and the shape of every agent
 * worktree cut with --depth). Result: `PASS (0 branch commit(s) checked)`, exit 0, on a branch whose
 * only commit was an accounting-path EntityLink commit carrying none of the 18 keys. Verified both
 * directions on a real --depth=1 clone: PASS before `git fetch --unshallow`, 3 problems after.
 * The range precondition now lives in scripts/lib/branch-range-guard.mjs and REFUSES to report
 * success on an unusable range. The single legitimate zero (HEAD *is* the merge-base — a post-merge
 * run on main) is passed with its reason printed, never silently.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyCommitRange,
  collectGitFacts,
  rangeCommitShas,
  RANGE_CODES,
  selftestBranchRangeGuard,
} from "./lib/branch-range-guard.mjs";
import { loadManifests, scoreManifest } from "./verify-module-completion.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-money-theater";
const SELFTEST = process.argv.includes("--selftest");

const MONEY_PATH_RE =
  /^(apps\/(backend|frontend)\/src\/.*(accounting|banking|qbo-sync|\/qbo\/)|apps\/frontend\/src\/pages\/(accounting|banking)\/)/i;

const WRITE_PATH_RE =
  /(puller|projector|posting-engine|bank-feed|gl-post|migration|sync-scheduler|bill-payment|expense\.routes|payments\.routes|categorize)/i;

const MIGRATION_PATH_RE = /^db\/migrations\//i;

const FINDING_RE = /\bFINDING(?:\s*ID)?\s*:\s*(ACCT|BANK|LST)-F\d+\b/i;
const LANE_RE = /\bLANE\s*:\s*(HOLD|FINANCIAL-HOLD|NON-FINANCIAL|DOCS)\b/i;

const REQUIRED_KEYS = [
  { key: "FINDING", re: FINDING_RE },
  { key: "LANE", re: LANE_RE },
  { key: "DOD-A", re: /\bDOD-A\s*:\s*\S+/i },
  { key: "DOD-B", re: /\bDOD-B\s*:\s*\S+/i },
  { key: "DOD-C", re: /\bDOD-C\s*:\s*\S+/i },
  { key: "DOD-D", re: /\bDOD-D\s*:\s*\S+/i },
  { key: "DOD-E", re: /\bDOD-E\s*:\s*\S+/i },
  { key: "VERIFY-1", re: /\bVERIFY-1\s*:\s*\S+/i },
  { key: "VERIFY-2", re: /\bVERIFY-2\s*:\s*\S+/i },
  { key: "VERIFY-3", re: /\bVERIFY-3\s*:\s*\S+/i },
  { key: "VERIFY-4", re: /\bVERIFY-4\s*:\s*\S+/i },
  { key: "VERIFY-5", re: /\bVERIFY-5\s*:\s*\S+/i },
  { key: "VERIFY-6", re: /\bVERIFY-6\s*:\s*\S+/i },
  { key: "VERIFY-7", re: /\bVERIFY-7\s*:\s*\S+/i },
  { key: "VERIFY-8", re: /\bVERIFY-8\s*:\s*\S+/i },
  { key: "MODULE_PROGRESS", re: /\bMODULE_PROGRESS\s*:\s*(accounting|banking)\s+\d+\s+of\s+\d+/i },
  { key: "ROOT CAUSE", re: /root cause/i },
  { key: "FIX", re: /(^|\n)\s*FIX\b|FIX:/i },
  { key: "GUARD", re: /guard/i },
  { key: "LIVE PROOF or UNVERIFIED", re: /(live proof|unverified)/i },
  { key: "REMAINING", re: /remaining/i },
];

const THEATER_SUBJECT_RE =
  /\b(entitylink|honesty|empty-state|empty state|module complete|module done)\b/i;

const MODULE_PROGRESS_LINE_RE =
  /\bMODULE_PROGRESS\s*:\s*(accounting|banking)\s+(\d+)\s+of\s+(\d+)/gi;

function manifestScores() {
  const out = {};
  for (const { data } of loadManifests()) {
    out[data.module] = scoreManifest(data);
  }
  return out;
}

export function assertModuleProgressMatches(text, files, scores = manifestScores()) {
  const problems = [];
  const needsAcct = files.some((f) => /accounting|qbo-sync|\/qbo\//i.test(f));
  const needsBank = files.some((f) => /banking/i.test(f));
  const lines = [...text.matchAll(MODULE_PROGRESS_LINE_RE)];
  const reported = Object.fromEntries(lines.map((m) => [m[1].toLowerCase(), { N: +m[2], M: +m[3] }]));

  for (const mod of ["accounting", "banking"]) {
    const need = mod === "accounting" ? needsAcct : needsBank;
    if (!need) continue;
    const sc = scores[mod];
    if (!sc) {
      problems.push(`MODULE_PROGRESS required for ${mod} but docs/module-completion/${mod}.json missing`);
      continue;
    }
    const rep = reported[mod];
    if (!rep) {
      problems.push(`money commit missing MODULE_PROGRESS: ${mod} ${sc.progress}`);
      continue;
    }
    if (rep.N !== sc.N || rep.M !== sc.M) {
      problems.push(
        `MODULE_PROGRESS: ${mod} ${rep.N} of ${rep.M} does not match manifest ${sc.progress} — update docs/module-completion/${mod}.json in this PR or fix the line`
      );
    }
  }
  return problems;
}

const sh = (cmd) => {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

export function isMoneyAppCommit(files) {
  return files.some((f) => MONEY_PATH_RE.test(f) && f.startsWith("apps/"));
}

export function assertNoMoneyTheater(commits) {
  const problems = [];
  for (const c of commits) {
    const moneyApp = isMoneyAppCommit(c.files);
    const hasMigration = c.files.some((f) => MIGRATION_PATH_RE.test(f));
    if (!moneyApp && !hasMigration) continue;

    // Migrations alone (financial) still need MIGRATE + lane; full DOD if also money apps
    const text = `${c.subject}\n${c.body}`;
    const short = (c.sha || "COMMIT").slice(0, 9);

    if (moneyApp) {
      const missing = REQUIRED_KEYS.filter((k) => !k.re.test(text)).map((k) => k.key);
      if (missing.length) {
        problems.push(
          `${short} "${c.subject.slice(0, 64)}" money commit missing DoD confirmations: ${missing.join(", ")} ` +
            `(DEFINITION-OF-DONE.md §10 — Claude consolidated checklist 2026-07-24)`
        );
      }

      for (const p of assertModuleProgressMatches(text, c.files)) {
        problems.push(`${short} ${p}`);
      }

      const appMoney = c.files.filter((f) => MONEY_PATH_RE.test(f) && f.startsWith("apps/"));
      const hasWritePath = appMoney.some((f) => WRITE_PATH_RE.test(f));
      // ACCT-F84 — the theater test is about a FRONTEND-ONLY link change dressed up as money-module
      // progress. That is the incident this rule was written for: "a branch whose only commit was an
      // accounting-path EntityLink commit carrying none of the 18 keys" (see the header) — a commit
      // that touched no backend data path at all.
      //
      // As first written the test asked only "does some file match WRITE_PATH_RE", which no read path
      // ever does. That makes a drill-through DEFECT unshippable: a link pointing at the wrong column
      // 404s on 16,246 rows, and fixing it necessarily means changing a read service and a page —
      // never a puller or a poster. A rule that forbids fixing a real defect is not protecting
      // anything; it just teaches people to delete the word "EntityLink" from the message, which
      // hides the very subject the rule wants to see.
      //
      // Narrowed, NOT weakened: a backend money-path SERVICE/ROUTE change is real data-path work and
      // clears the theater test. Frontend-only remains theater, so the original incident still fails
      // (and it also fails on the 18 keys, which it lacked). Both directions are asserted in
      // selftest arms "theater-frontend-only" and "entitylink-with-backend-readpath".
      const hasBackendDataPath = c.files.some(
        (f) => MONEY_PATH_RE.test(f) && /^apps\/backend\/src\/.*\.(ts|mjs)$/i.test(f) && !/\.test\.ts$/i.test(f)
      );
      if ((THEATER_SUBJECT_RE.test(c.subject) || /entitylink/i.test(text)) && !hasWritePath && !hasBackendDataPath) {
        problems.push(
          `${short} "${c.subject.slice(0, 64)}" money THEATER (EntityLink/honesty) ` +
            `without write/pull/post/migration path — Rule 23`
        );
      }

      if (/\b(module complete|module done|accounting done|banking done)\b/i.test(text) && !/UNVERIFIED/i.test(text)) {
        problems.push(`${short} claims module done without UNVERIFIED — DoD §10 / Rule 24`);
      }
    }

    if (hasMigration && !/\bMIGRATE\s*:\s*\S+/i.test(text)) {
      problems.push(
        `${short} touches db/migrations/ but omits MIGRATE: … (number/idempotent/FORCE RLS/throwaway validate — DoD §10 §7)`
      );
    }
    if (hasMigration && !LANE_RE.test(text)) {
      problems.push(`${short} migration commit omits LANE: HOLD|FINANCIAL-HOLD|…`);
    }
  }
  return problems;
}

/**
 * Resolve the branch range or REFUSE. Never returns an empty list without a stated legitimate
 * reason — that is the whole point of this function's existence (see the header note).
 */
function resolveBranchCommits() {
  const facts = collectGitFacts(ROOT);
  const shas = rangeCommitShas(facts, ROOT);
  const verdict = classifyCommitRange({ ...facts, commitCount: shas.length });
  if (verdict.fatal) {
    console.error(`${LABEL}: FAIL [${verdict.code}]\n  ${verdict.fatal}`);
    process.exit(1);
  }
  const commits = shas.map((sha) => ({
    sha,
    subject: sh(`git log -1 --format=%s ${sha}`),
    body: sh(`git log -1 --format=%b ${sha}`),
    files: sh(`git diff-tree --no-commit-id --name-only -r ${sha}`).split("\n").filter(Boolean),
  }));
  return { commits, verdict };
}

export const MONEY_DOD_COMMIT_TEMPLATE = `
FINDING: ACCT-F## | BANK-F## | LST-F##
LANE: HOLD | FINANCIAL-HOLD | NON-FINANCIAL | DOCS

DOD-A: PASS|N/A|FAIL|UNVERIFIED — active path
DOD-B: PASS|N/A|FAIL|UNVERIFIED — wizard depth (fields in submit)
DOD-C: PASS|N/A|FAIL|UNVERIFIED — linkage F+R canonical FK
DOD-D: PASS|N/A|FAIL|UNVERIFIED — purpose→economics
DOD-E: PASS|N/A|FAIL|UNVERIFIED — live proof

VERIFY-1: PASS|N/A|FAIL|UNVERIFIED — Visual / QBO chrome
VERIFY-2: PASS|N/A|FAIL|UNVERIFIED — Universal picker law (7 clauses)
VERIFY-3: PASS|N/A|FAIL|UNVERIFIED — Connectivity/wiring (nav→API→Neon)
VERIFY-4: PASS|N/A|FAIL|UNVERIFIED — Deep linkage chains F+R
VERIFY-5: PASS|N/A|FAIL|UNVERIFIED — Catalogs / entity scope
VERIFY-6: PASS|N/A|FAIL|UNVERIFIED — Economics CPA-grade
VERIFY-7: PASS|N/A|FAIL|UNVERIFIED — Tab / design law (Rule 05)
VERIFY-8: PASS|N/A|FAIL|UNVERIFIED — Security / entity / RLS

MODULE_PROGRESS: accounting N of M
MODULE_PROGRESS: banking N of M
ITEMS_TOUCHED: ACCT-… | BANK-…

MIGRATE: N/A | <number · idempotent · FORCE RLS · throwaway validate · no hardcoded UUID>

ROOT CAUSE: …
FIX: …
GUARD: scripts/verify-*.mjs + scripts/verify-steps/NNNN-*.mjs
LIVE PROOF: … OR UNVERIFIED — <blocker>
REMAINING: …
`.trim();

// CLI only when this file is the entrypoint. Importers (commit-msg) must not inherit --selftest
// from process.argv (Rule 25 — import side-effect burned money-pr-local-gate selftest).
const isDirectRun =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (!isDirectRun) {
  // library mode — exports only
} else if (SELFTEST) {
  const failures = [];
  const expect = (name, commits, wantFail) => {
    const problems = assertNoMoneyTheater(commits);
    if ((problems.length > 0) !== wantFail) {
      failures.push(`${name}: expected fail=${wantFail}, got ${problems.join(" | ") || "pass"}`);
    }
  };

  const acct = scoreManifest(
    loadManifests().find((m) => m.data.module === "accounting")?.data || {
      items: [],
    }
  );
  const fullBody = `
FINDING: ACCT-F01
LANE: FINANCIAL-HOLD
DOD-A: N/A
DOD-B: N/A
DOD-C: PASS
DOD-D: PASS
DOD-E: UNVERIFIED — mirrors 0
VERIFY-1: N/A
VERIFY-2: N/A
VERIFY-3: PASS — puller path
VERIFY-4: PASS
VERIFY-5: N/A
VERIFY-6: UNVERIFIED — payments 0
VERIFY-7: N/A
VERIFY-8: PASS — RLS unchanged
MODULE_PROGRESS: accounting ${acct.progress}
ITEMS_TOUCHED: ACCT-PULL-01
MIGRATE: N/A
ROOT CAUSE: duplicate resolve
FIX: reuse resolver
GUARD: verify-x
LIVE PROOF: UNVERIFIED — sync_runs empty
REMAINING: ACCT-F01
`;

  expect(
    "missing-v6-v8",
    [
      {
        sha: "aaaaaaaaa",
        subject: "fix(accounting): something",
        body: "FINDING: ACCT-F01\nLANE: HOLD\nDOD-A: N/A\nDOD-B: N/A\nDOD-C: N/A\nDOD-D: N/A\nDOD-E: UNVERIFIED\nVERIFY-1: N/A\nVERIFY-2: N/A\nVERIFY-3: N/A\nVERIFY-4: N/A\nVERIFY-5: N/A\nROOT CAUSE: x\nFIX: y\nGUARD: z\nLIVE PROOF: UNVERIFIED\nREMAINING: open",
        files: ["apps/backend/src/accounting/foo.ts"],
      },
    ],
    true
  );

  expect(
    "full-ok",
    [
      {
        sha: "ccccccccc",
        subject: "fix(accounting): AR puller deposit resolver",
        body: fullBody,
        files: ["apps/backend/src/qbo-sync/qbo-ar-payments-puller.ts"],
      },
    ],
    false
  );

  expect(
    "wrong-module-progress",
    [
      {
        sha: "eeeeeeeee",
        subject: "fix(accounting): progress lie",
        body: fullBody.replace(
          `MODULE_PROGRESS: accounting ${acct.progress}`,
          "MODULE_PROGRESS: accounting 99 of 99"
        ),
        files: ["apps/backend/src/qbo-sync/qbo-ar-payments-puller.ts"],
      },
    ],
    true
  );

  // ACCT-F84 — the ORIGINAL incident: a frontend-only EntityLink commit on an accounting path. It
  // must still be caught, or this narrowing would have gutted the rule.
  expect(
    "theater-frontend-only",
    [
      {
        sha: "fff111222",
        subject: "fix(accounting): EntityLink drill-through",
        body: fullBody,
        files: ["apps/frontend/src/pages/accounting/BillsPage.tsx"],
      },
    ],
    true
  );

  // ACCT-F84 — the same subject, but the commit also changes a backend money-path read service that
  // supplies the field the link needs. That is real data-path work, not theater.
  expect(
    "entitylink-with-backend-readpath",
    [
      {
        sha: "fff333444",
        subject: "fix(accounting): vendor drill-through used a legacy id",
        // The body MUST carry the trigger word. Without it neither THEATER_SUBJECT_RE nor the
        // /entitylink/i body test fires, the theater branch never runs, and this arm would pass no
        // matter what the rule did — a vacuous arm that mutation-testing caught (removing the
        // narrowing left the selftest green, which is how the hole showed itself).
        body: `${fullBody}\nEntityLink drill-through repointed to the canonical vendor uuid.`,
        files: [
          "apps/backend/src/accounting/bills.service.ts",
          "apps/frontend/src/pages/accounting/BillsPage.tsx",
        ],
      },
    ],
    false
  );

  expect(
    "migration-needs-migrate-key",
    [
      {
        sha: "ddddddddd",
        subject: "feat(db): add thing",
        body: "LANE: FINANCIAL-HOLD\nROOT CAUSE: x\nFIX: y\nGUARD: z\nLIVE PROOF: UNVERIFIED\nREMAINING: open",
        files: ["db/migrations/202607999999_example.sql"],
      },
    ],
    true
  );

  // ---- ZERO-COMMIT FAKE-GREEN arms ------------------------------------------------------------
  // The original defect had no test at all: nothing asserted that "0 commits checked" is not a pass.
  // These arms drive the real classifier, including against genuinely shallow and orphan git repos
  // built on disk, so the detection is proven against git rather than against a boolean.
  for (const f of selftestBranchRangeGuard()) failures.push(`range-guard ${f}`);

  // The exact input shape that produced `PASS (0 branch commit(s) checked)` must now be fatal, and
  // the fatal must be attributable to the shallow clone rather than a generic error.
  const shallowVerdict = classifyCommitRange({
    shallow: true,
    head: "f".repeat(40),
    base: "",
    baseRef: "origin/main",
    baseRefExists: true,
    commitCount: 0,
  });
  if (!shallowVerdict.fatal || shallowVerdict.code !== RANGE_CODES.SHALLOW_CLONE) {
    failures.push("shallow-zero-commit: a shallow clone with an empty range did NOT fail — this is the original defect");
  }
  if (shallowVerdict.fatal && !/fetch --unshallow/.test(shallowVerdict.fatal)) {
    failures.push("shallow-zero-commit: failure message does not name the actionable fix (git fetch --unshallow)");
  }
  const noBaseVerdict = classifyCommitRange({
    shallow: false,
    head: "f".repeat(40),
    base: "",
    baseRef: "origin/main",
    baseRefExists: true,
    commitCount: 0,
  });
  if (!noBaseVerdict.fatal || noBaseVerdict.code !== RANGE_CODES.NO_MERGE_BASE) {
    failures.push("no-merge-base-zero-commit: an unresolvable merge-base with 0 commits did NOT fail");
  }
  // …and the one legitimate zero must still pass, or every post-merge run on main goes red.
  const onBase = classifyCommitRange({
    shallow: false,
    head: "f".repeat(40),
    base: "f".repeat(40),
    baseRef: "origin/main",
    baseRefExists: true,
    commitCount: 0,
  });
  if (onBase.fatal || onBase.code !== RANGE_CODES.LEGITIMATE_ZERO) {
    failures.push("legitimate-zero: HEAD == merge-base (post-merge main) was refused — that is a false positive");
  }

  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} --selftest: PASS — money-theater arms + zero-commit/shallow/orphan range arms ` +
      `(real depth=1 clone and real orphan branch both refused; healthy range and post-merge main still pass)`
  );
  process.exit(0);
} else {
  const { commits, verdict } = resolveBranchCommits();
  const problems = assertNoMoneyTheater(commits);
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(`\nRequired template:\n\n${MONEY_DOD_COMMIT_TEMPLATE}\n`);
    process.exit(1);
  }
  // A PASS must always carry WHAT was checked. A bare "PASS (0 ...)" is the defect this guard shipped
  // with; the only zero that survives here is LEGITIMATE_ZERO and it prints its own reason.
  console.log(`${LABEL}: PASS — ${verdict.note} [${verdict.code}]`);
}
