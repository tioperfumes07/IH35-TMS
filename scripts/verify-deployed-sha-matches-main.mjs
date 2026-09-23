#!/usr/bin/env node
// DEPLOY-DRIFT STALENESS GATE — 2026-09-23 P0: backend autoDeploy has been "no" /
// autoDeployTrigger "off" since 2026-08-21T12:09:58Z (PR #13442, deliberately disabled to stop
// an 8.3-deploys/hour 502 storm; never replaced with an enforced cadence). The house law since
// (FAST-MERGE-4MIN-LAW.md, owner ruling 2026-09-04) is "the seat that merges triggers exactly
// one deploy" — a manual, easy-to-forget step. On 2026-09-23 it WAS forgotten: PR #22450 (the
// cascade void engine, a real financial fix) sat merged on main for ~50+ minutes, never
// deployed, while `deploy-parity-monitor.yml` (scripts/verify-deploy-parity.mjs) — the ONLY
// existing live check — went red on schedule and nobody looked, because that check demands
// EXACT frontend==backend==main equality and is therefore expected to be red during every
// normal few-minute merge-then-deploy gap. A guard that is "always a little red" trains
// everyone to ignore it. This guard is deliberately different: it tolerates a bounded number
// of commits of normal lag and only fails on genuine, actionable drift — so a red run here
// means "go trigger a deploy now," not "wait, that's just normal."
//
// Modes:
//   --selftest                        pure compare-logic fixtures, no network — always safe in CI.
//   DEPLOYED_SHA_CHECK_LIVE=1          live fetch (backend healthz) + git ancestry check.
//   (neither)                         SKIP exit 0, so the static verify:* glob never fails on a no-network run.
//
// Env (live mode only):
//   BACKEND_URL            default https://api.ih35dispatch.com
//   MAX_COMMITS_BEHIND      default 5 — fail once the live deploy is behind origin/main by MORE than this
//   GIT_MAIN_REF            default origin/main (must already be fetched by the caller/workflow)
//
// node scripts/verify-deployed-sha-matches-main.mjs --selftest
// DEPLOYED_SHA_CHECK_LIVE=1 node scripts/verify-deployed-sha-matches-main.mjs
import { execSync } from "node:child_process";

const LABEL = "verify-deployed-sha-matches-main";

/**
 * Pure staleness decision — no network, no git, fully testable.
 * @param {{ deployedSha: string|null, isAncestorOfMain: boolean|null, commitsBehind: number|null,
 *           maxCommitsBehind: number, financialCommitsBehind: string[] }} input
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function computeStaleness({ deployedSha, isAncestorOfMain, commitsBehind, maxCommitsBehind, financialCommitsBehind }) {
  const reasons = [];
  if (!deployedSha) {
    reasons.push("live deployed sha unavailable (healthz did not return git_sha/commit) — cannot verify, treat as FAIL");
    return { ok: false, reasons };
  }
  if (isAncestorOfMain === false) {
    reasons.push(`deployed sha ${deployedSha} is NOT an ancestor of main — deployed build is off-history (force-push, wrong branch, or unmerged) — cannot compute drift`);
    return { ok: false, reasons };
  }
  if (commitsBehind === null) {
    reasons.push(`could not compute commits-behind for ${deployedSha} — treat as FAIL`);
    return { ok: false, reasons };
  }
  if (commitsBehind > maxCommitsBehind) {
    reasons.push(`live deploy is ${commitsBehind} commits behind origin/main (max allowed ${maxCommitsBehind}) — trigger a deploy`);
  }
  if (financialCommitsBehind && financialCommitsBehind.length) {
    reasons.push(
      `${financialCommitsBehind.length} LANE: FINANCIAL commit(s) merged but not live: ${financialCommitsBehind.join("; ")}`
    );
  }
  return { ok: reasons.length === 0, reasons };
}

function selfTest() {
  const cases = [
    {
      name: "zero behind -> ok",
      in: { deployedSha: "abc1234", isAncestorOfMain: true, commitsBehind: 0, maxCommitsBehind: 5, financialCommitsBehind: [] },
      want: true,
    },
    {
      name: "within tolerance -> ok",
      in: { deployedSha: "abc1234", isAncestorOfMain: true, commitsBehind: 5, maxCommitsBehind: 5, financialCommitsBehind: [] },
      want: true,
    },
    {
      name: "over tolerance -> fail",
      in: { deployedSha: "abc1234", isAncestorOfMain: true, commitsBehind: 6, maxCommitsBehind: 5, financialCommitsBehind: [] },
      want: false,
    },
    {
      name: "any FINANCIAL commit behind -> fail even within tolerance",
      in: { deployedSha: "abc1234", isAncestorOfMain: true, commitsBehind: 1, maxCommitsBehind: 5, financialCommitsBehind: ["deadbeef cascade void engine"] },
      want: false,
    },
    {
      name: "no deployed sha -> fail",
      in: { deployedSha: null, isAncestorOfMain: null, commitsBehind: null, maxCommitsBehind: 5, financialCommitsBehind: [] },
      want: false,
    },
    {
      name: "deployed sha not an ancestor of main -> fail",
      in: { deployedSha: "abc1234", isAncestorOfMain: false, commitsBehind: null, maxCommitsBehind: 5, financialCommitsBehind: [] },
      want: false,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const ok = computeStaleness(c.in).ok === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}`);
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed}/${cases.length}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS: ${cases.length}/${cases.length}`);
}

async function fetchJson(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function git(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function liveCheck() {
  const backendUrl = (process.env.BACKEND_URL || "https://api.ih35dispatch.com").replace(/\/$/, "");
  const maxCommitsBehind = Number(process.env.MAX_COMMITS_BEHIND || 5);
  const mainRef = process.env.GIT_MAIN_REF || "origin/main";

  const health = await fetchJson(`${backendUrl}/api/v1/healthz/shallow`);
  const deployedSha = health?.git_sha || health?.commit || health?.version || null;

  let isAncestorOfMain = null;
  let commitsBehind = null;
  let financialCommitsBehind = [];

  if (deployedSha) {
    const ancestorCheck = git(`git merge-base --is-ancestor ${deployedSha} ${mainRef} && echo yes || echo no`);
    isAncestorOfMain = ancestorCheck === "yes";
    if (isAncestorOfMain) {
      const countRaw = git(`git rev-list --count ${deployedSha}..${mainRef}`);
      commitsBehind = countRaw !== null ? Number(countRaw) : null;
      if (commitsBehind) {
        const log = git(`git log --oneline ${deployedSha}..${mainRef} --grep="LANE: FINANCIAL" -i`);
        financialCommitsBehind = log ? log.split("\n").filter(Boolean) : [];
      }
    }
  }

  const result = computeStaleness({ deployedSha, isAncestorOfMain, commitsBehind, maxCommitsBehind, financialCommitsBehind });

  console.log(`\n=== ${LABEL} (${new Date().toISOString()}) ===`);
  console.log(`backend: ${backendUrl}/api/v1/healthz/shallow`);
  console.log(`deployed sha: ${deployedSha || "(unavailable)"}`);
  console.log(`ancestor of ${mainRef}: ${isAncestorOfMain === null ? "?" : isAncestorOfMain}`);
  console.log(`commits behind: ${commitsBehind === null ? "?" : commitsBehind} (max allowed ${maxCommitsBehind})`);

  if (!result.ok) {
    console.error(`\nFAIL ${LABEL}:`);
    result.reasons.forEach((r) => console.error(`  • ${r}`));
    process.exit(1);
  }
  console.log(`\nPASS ${LABEL} — live backend is current with ${mainRef} within tolerance.`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    selfTest();
    return;
  }
  if (process.env.DEPLOYED_SHA_CHECK_LIVE !== "1") {
    console.log(`SKIP ${LABEL}: set DEPLOYED_SHA_CHECK_LIVE=1 to run the live check (post-merge/scheduled). Pure logic covered by --selftest.`);
    return; // exit 0 — never fails the static verify:* glob on a no-network run
  }
  selfTest();
  await liveCheck();
}

main();
