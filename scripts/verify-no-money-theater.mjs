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
 *   FINDING · LANE · DOD-A..E · VERIFY-1..8 · ROOT CAUSE · FIX · GUARD · LIVE PROOF|UNVERIFIED · REMAINING
 * Migration commits also: MIGRATE: …
 *
 * Theater subjects (EntityLink/honesty/N-of-M) without write/pull/post path → FAIL.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  { key: "ROOT CAUSE", re: /root cause/i },
  { key: "FIX", re: /(^|\n)\s*FIX\b|FIX:/i },
  { key: "GUARD", re: /guard/i },
  { key: "LIVE PROOF or UNVERIFIED", re: /(live proof|unverified)/i },
  { key: "REMAINING", re: /remaining/i },
];

const THEATER_SUBJECT_RE =
  /\b(entitylink|honesty|empty-state|empty state|\d+\s*\/\s*\d+|module complete|module done)\b/i;

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

      const appMoney = c.files.filter((f) => MONEY_PATH_RE.test(f) && f.startsWith("apps/"));
      const hasWritePath = appMoney.some((f) => WRITE_PATH_RE.test(f));
      if ((THEATER_SUBJECT_RE.test(c.subject) || /entitylink/i.test(text)) && !hasWritePath) {
        problems.push(
          `${short} "${c.subject.slice(0, 64)}" money THEATER (EntityLink/honesty/N-of-M) ` +
            `without write/pull/post/migration path — Rule 23`
        );
      }

      if (/\b(module complete|module done|accounting done|banking done)\b/i.test(text) && !/UNVERIFIED/i.test(text)) {
        problems.push(`${short} claims module done without UNVERIFIED — DoD §10`);
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

function listBranchCommits() {
  const base = sh("git merge-base HEAD origin/main") || sh("git merge-base HEAD main");
  if (!base) return [];
  const log = sh(`git log --format=%H%x00%s%x00%b%x1e ${base}..HEAD`);
  if (!log) return [];
  return log.split("\x1e").filter(Boolean).map((chunk) => {
    const [sha, subject, body = ""] = chunk.split("\x00");
    const files = sh(`git diff-tree --no-commit-id --name-only -r ${sha}`)
      .split("\n")
      .filter(Boolean);
    return { sha, subject: subject || "", body: body || "", files };
  });
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

MIGRATE: N/A | <number · idempotent · FORCE RLS · throwaway validate · no hardcoded UUID>

ROOT CAUSE: …
FIX: …
GUARD: scripts/verify-*.mjs + scripts/verify-steps/NNNN-*.mjs
LIVE PROOF: … OR UNVERIFIED — <blocker>
REMAINING: …
`.trim();

if (SELFTEST) {
  const failures = [];
  const expect = (name, commits, wantFail) => {
    const problems = assertNoMoneyTheater(commits);
    if ((problems.length > 0) !== wantFail) {
      failures.push(`${name}: expected fail=${wantFail}, got ${problems.join(" | ") || "pass"}`);
    }
  };

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

  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: PASS`);
  process.exit(0);
}

const commits = listBranchCommits();
const problems = assertNoMoneyTheater(commits);
if (problems.length) {
  console.error(`${LABEL}: FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(`\nRequired template:\n\n${MONEY_DOD_COMMIT_TEMPLATE}\n`);
  process.exit(1);
}
console.log(`${LABEL}: PASS (${commits.length} branch commit(s) checked)`);
