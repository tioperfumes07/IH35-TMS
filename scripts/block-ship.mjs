#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gatherSyncState } from "./sync.mjs";

function run(command) {
  const res = spawnSync(command, { shell: true, encoding: "utf8", env: process.env });
  return {
    ok: res.status === 0,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    code: res.status ?? 1,
  };
}

function log(step, message) {
  console.log(`[${step}] ${message}`);
}

export function isFeatureBranch(branch) {
  return Boolean(branch && !["main", "master", "HEAD", "origin/main"].includes(branch));
}

export function parseCommitMessage(argv) {
  const dashIdx = argv.indexOf("--");
  if (dashIdx >= 0) return argv.slice(dashIdx + 1).join(" ").trim();
  return argv.join(" ").trim();
}

export function decideFlow(state) {
  if (state.mergedUpstream) return "already-merged";
  if (state.behind > 0) return "behind";
  if (state.dirtyCount > 0) return "dirty";
  return "verify-push";
}

function main() {
  const message = parseCommitMessage(process.argv.slice(2));
  const { report, details } = gatherSyncState();

  log("SYNC", `${report.branch} @ ${report.head}`);
  if (!isFeatureBranch(details.branch)) {
    log("DIAG", "Refusing to run on non-feature branch.");
    process.exit(1);
  }

  const flow = decideFlow(details);
  if (flow === "already-merged") {
    log(
      "DIAG",
      `Branch ${details.branch} already merged upstream. Run: git checkout main && git pull --ff-only origin main && git branch -D ${details.branch}`
    );
    return;
  }
  if (flow === "behind") {
    log("DIAG", `Branch is ${details.behind} commit(s) behind origin/main.`);
    log(
      "DIAG",
      `Suggested: npm run branch:rebuild-linear -- --source HEAD --message "${message || "linear rebuild"}"`
    );
    process.exit(1);
  }

  if (flow === "dirty") {
    if (!message) {
      log("COMMIT", "Missing commit message argument. Usage: npm run block:ship -- \"<message>\"");
      process.exit(1);
    }
    log("COMMIT", "Staging changes");
    const addRes = run("git add -A");
    if (!addRes.ok) {
      log("COMMIT", "git add failed");
      process.exit(1);
    }
    const commitRes = run(`git commit -m ${JSON.stringify(message)}`);
    if (!commitRes.ok) {
      process.stdout.write(commitRes.stdout);
      process.stderr.write(commitRes.stderr);
      process.exit(1);
    }
    process.stdout.write(commitRes.stdout);
  } else {
    log("COMMIT", "Working tree clean; skipping commit");
  }

  log("VERIFY", "Running branch:precheck-push");
  const verifyRes = run("npm run branch:precheck-push");
  process.stdout.write(verifyRes.stdout);
  process.stderr.write(verifyRes.stderr);
  if (!verifyRes.ok) {
    log("VERIFY", "Failed");
    process.exit(1);
  }

  log("PUSH", `git push --force-with-lease origin ${details.branch}`);
  const pushRes = run(`git push --force-with-lease origin ${details.branch}`);
  process.stdout.write(pushRes.stdout);
  process.stderr.write(pushRes.stderr);
  if (!pushRes.ok) {
    log("PUSH", "Failed");
    process.exit(1);
  }

  if (details.repoSlug?.slug) {
    log("PUSH", `PR URL: https://github.com/${details.repoSlug.slug}/compare/main...${details.branch}?expand=1`);
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main();
}
