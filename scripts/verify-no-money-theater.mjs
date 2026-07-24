#!/usr/bin/env node
/**
 * GUARD: every accounting/banking/QBO-money commit must CONFIRM the DoD audit checklist
 * in the commit message — or FAIL closed (local commit-msg + CI verify-step).
 *
 * Canonical list: docs/specs/DEFINITION-OF-DONE.md §§1–3 + §10.
 * Theater ban: Rule 23 (.cursor/rules/23-no-money-theater-prs.mdc).
 *
 * Required keys on money app commits (apps/…accounting|banking|qbo-sync…):
 *   FINDING: ACCT-F## | BANK-F## | LST-F##
 *   DOD-A: …   DOD-B: …   DOD-C: …   DOD-D: …   DOD-E: …
 *   VERIFY-1: … VERIFY-2: … VERIFY-3: … VERIFY-4: … VERIFY-5: …
 *   ROOT CAUSE / FIX / GUARD / LIVE PROOF|UNVERIFIED / REMAINING  (Rule 16)
 *
 * Values may be PASS | N/A | FAIL | UNVERIFIED — <blocker> (hostile honesty required).
 * EntityLink/honesty/N-of-M theater subjects without a write/pull/post path → FAIL.
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

const FINDING_RE = /\bFINDING(?:\s*ID)?\s*:\s*(ACCT|BANK|LST)-F\d+\b/i;

const REQUIRED_KEYS = [
  { key: "FINDING", re: FINDING_RE },
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
    if (!isMoneyAppCommit(c.files)) continue;
    const appMoney = c.files.filter((f) => MONEY_PATH_RE.test(f) && f.startsWith("apps/"));
    const text = `${c.subject}\n${c.body}`;
    const short = (c.sha || "COMMIT").slice(0, 9);

    const missing = REQUIRED_KEYS.filter((k) => !k.re.test(text)).map((k) => k.key);
    if (missing.length) {
      problems.push(
        `${short} "${c.subject.slice(0, 64)}" money commit missing required DoD confirmations: ${missing.join(", ")} ` +
          `(see docs/specs/DEFINITION-OF-DONE.md §10)`
      );
    }

    const hasWritePath = appMoney.some((f) => WRITE_PATH_RE.test(f));
    if ((THEATER_SUBJECT_RE.test(c.subject) || /entitylink/i.test(text)) && !hasWritePath) {
      problems.push(
        `${short} "${c.subject.slice(0, 64)}" looks like money THEATER (EntityLink/honesty/N-of-M) ` +
          `without write/pull/post/migration path — Rule 23`
      );
    }

    if (/\b(module complete|module done|accounting done|banking done)\b/i.test(text) && !/UNVERIFIED/i.test(text)) {
      problems.push(
        `${short} claims module done without UNVERIFIED — DoD §10 forbids scoreboard COMPLETE`
      );
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

/** Template printed on failure / for agents. */
export const MONEY_DOD_COMMIT_TEMPLATE = `
FINDING: ACCT-F## | BANK-F## | LST-F##   (from ~/Desktop/IH35-CURSOR-AUDIT/modules/<module>.md)

DOD-A: PASS|N/A|FAIL|UNVERIFIED — <active path note>
DOD-B: PASS|N/A|FAIL|UNVERIFIED — <wizard depth note>
DOD-C: PASS|N/A|FAIL|UNVERIFIED — <linkage F+R / canonical FK note>
DOD-D: PASS|N/A|FAIL|UNVERIFIED — <purpose→economics note>
DOD-E: PASS|N/A|FAIL|UNVERIFIED — <live proof note>

VERIFY-1: PASS|N/A|FAIL|UNVERIFIED — <QBO chrome>
VERIFY-2: PASS|N/A|FAIL|UNVERIFIED — <picker law>
VERIFY-3: PASS|N/A|FAIL|UNVERIFIED — <deep linkage chains>
VERIFY-4: PASS|N/A|FAIL|UNVERIFIED — <catalog / entity scope>
VERIFY-5: PASS|N/A|FAIL|UNVERIFIED — <economics CPA-grade>

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
DOD-A: N/A — puller only
DOD-B: N/A
DOD-C: PASS — shared deposit resolver
DOD-D: PASS — subledger only flags OFF
DOD-E: UNVERIFIED — mirrors 0
VERIFY-1: N/A
VERIFY-2: N/A
VERIFY-3: PASS — deposit account soft-resolve
VERIFY-4: N/A
VERIFY-5: UNVERIFIED — payments still 0
ROOT CAUSE: duplicate resolve
FIX: reuse resolver
GUARD: verify-qbo-ar-payment-deposit-bridge
LIVE PROOF: UNVERIFIED — qbo.sync_runs empty
REMAINING: ACCT-F01 pull silence
`;

  expect(
    "missing-checklist",
    [
      {
        sha: "aaaaaaaaa",
        subject: "fix(accounting): add reverse column",
        body: "ROOT CAUSE: x\nFIX: y\nGUARD: z\nLIVE PROOF: UNVERIFIED\nREMAINING: open",
        files: ["apps/frontend/src/pages/accounting/ExpenseListPage.tsx"],
      },
    ],
    true
  );

  expect(
    "entitylink-theater-even-with-keys",
    [
      {
        sha: "bbbbbbbbb",
        subject: "fix(accounting): expense list WO EntityLink column",
        body: fullBody,
        files: ["apps/frontend/src/pages/accounting/ExpenseListPage.tsx"],
      },
    ],
    true
  );

  expect(
    "real-puller-full-checklist",
    [
      {
        sha: "ccccccccc",
        subject: "fix(accounting): AR puller deposit resolver",
        body: fullBody,
        files: [
          "apps/backend/src/qbo-sync/qbo-ar-payments-puller.ts",
          "apps/backend/src/accounting/posting-engine.service.ts",
        ],
      },
    ],
    false
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
  console.error(`\nRequired money-commit template:\n\n${MONEY_DOD_COMMIT_TEMPLATE}\n`);
  process.exit(1);
}
console.log(`${LABEL}: PASS (${commits.length} branch commit(s) checked)`);
