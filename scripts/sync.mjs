#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { formatSyncStatus } from "./sync-status-format.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RENDER_SERVICE_ID = "srv-d7rpem7avr4c73fhp4n0";

function run(command, options = {}) {
  const res = spawnSync(command, {
    cwd: options.cwd ?? ROOT,
    shell: true,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
  });
  return {
    ok: res.status === 0,
    code: res.status ?? 1,
    stdout: (res.stdout ?? "").trim(),
    stderr: (res.stderr ?? "").trim(),
  };
}

function parseJson(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function parseRepoSlug() {
  const remote = run("git config --get remote.origin.url");
  if (!remote.ok || !remote.stdout) return null;
  const url = remote.stdout.replace(/\.git$/, "");
  if (url.startsWith("git@github.com:")) {
    const slug = url.replace("git@github.com:", "");
    const [owner, repo] = slug.split("/");
    return owner && repo ? { owner, repo, slug } : null;
  }
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], slug: `${match[1]}/${match[2]}` };
}

function hasGh() {
  return run("command -v gh").ok;
}

function getBranchState() {
  const branch = run("git rev-parse --abbrev-ref HEAD").stdout || "unknown";
  const head = run("git rev-parse --short HEAD").stdout || "unknown";
  const status = run("git status --porcelain").stdout.split(/\r?\n/).filter(Boolean);
  const mainHead = run("git rev-parse --short origin/main").stdout || "unknown";
  const ahead = Number(run("git rev-list --count origin/main..HEAD").stdout || "0");
  const behind = Number(run("git rev-list --count HEAD..origin/main").stdout || "0");
  const mergeCommits = Number(run("git rev-list --count --merges origin/main..HEAD").stdout || "0");
  const missingMainLine = run("git log --oneline -1 HEAD..origin/main").stdout;
  const mergedUpstream = ahead === 0 && behind > 0 && /Merge pull request/.test(missingMainLine) && missingMainLine.includes(branch);

  return {
    branch,
    head,
    workingTree: status.length === 0 ? "clean" : `dirty (${status.length} files)`,
    dirtyCount: status.length,
    mainHead,
    ahead,
    behind,
    mergeCommits,
    mergedUpstream,
    missingMainLine,
  };
}

function getGithubState({ branch, repoSlug, token, ghAvailable }) {
  if (!repoSlug) {
    return { openPr: "unknown (remote not GitHub)", latestMergedMain: "unknown" };
  }

  if (ghAvailable) {
    const prRes = run(`gh pr list --head "${branch}" --json number,state,mergeStateStatus,url,statusCheckRollup --limit 1`);
    const mergedRes = run("gh pr list --base main --state merged --json number,mergeCommit,url --limit 1");
    if (prRes.ok && mergedRes.ok) {
      const prs = parseJson(prRes.stdout, []);
      const merged = parseJson(mergedRes.stdout, []);
      const pr = prs[0];
      const mergedMain = merged[0];
      const checks = Array.isArray(pr?.statusCheckRollup) ? `${pr.statusCheckRollup.length} checks` : "unknown checks";
      return {
        openPr: pr
          ? `#${pr.number} (${pr.state}, mergeable: ${pr.mergeStateStatus ?? "unknown"}, CI ${checks})`
          : "none",
        latestMergedMain: mergedMain ? `#${mergedMain.number} (${mergedMain.mergeCommit?.oid?.slice(0, 7) ?? "unknown"})` : "unknown",
      };
    }
  }

  if (!token) {
    return { openPr: "unknown (gh missing, no GITHUB_TOKEN)", latestMergedMain: "unknown" };
  }

  const openUrl = `https://api.github.com/repos/${repoSlug.slug}/pulls?state=open&head=${repoSlug.owner}:${branch}`;
  const mergedUrl = `https://api.github.com/repos/${repoSlug.slug}/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=10`;
  const openRes = run(
    `curl -sS -H "Accept: application/vnd.github+json" -H "Authorization: Bearer ${token}" "${openUrl}"`
  );
  const mergedRes = run(
    `curl -sS -H "Accept: application/vnd.github+json" -H "Authorization: Bearer ${token}" "${mergedUrl}"`
  );
  const openJson = parseJson(openRes.stdout, []);
  const mergedJson = parseJson(mergedRes.stdout, []);
  const openPr = Array.isArray(openJson) && openJson[0] ? `#${openJson[0].number} (${openJson[0].state})` : "none";
  const mergedPr = Array.isArray(mergedJson) ? mergedJson.find((pr) => pr.merged_at) : null;
  return {
    openPr,
    latestMergedMain: mergedPr ? `#${mergedPr.number} (${String(mergedPr.merge_commit_sha ?? "").slice(0, 7)})` : "unknown",
  };
}

function getRenderState({ token }) {
  if (!token) {
    return { deploy: "unknown (missing Render token)", liveCommit: "unknown" };
  }
  const deployRes = run(
    `curl -sS -H "Authorization: Bearer ${token}" "https://api.render.com/v1/services/${RENDER_SERVICE_ID}/deploys?limit=3"`
  );
  const payload = parseJson(deployRes.stdout, null);
  if (!payload) return { deploy: "unknown (Render API unavailable)", liveCommit: "unknown" };
  const deploys = Array.isArray(payload) ? payload : payload.deploys ?? [];
  const latest = deploys[0];
  const live = deploys.find((d) => String(d.status ?? "").toLowerCase() === "live");
  if (!latest) return { deploy: "unknown", liveCommit: "unknown" };

  const summary = deploys
    .slice(0, 3)
    .map((d) => `${d.id ?? "?"}:${d.status ?? "unknown"}`)
    .join(", ");
  return {
    deploy: `${latest.id ?? "unknown"} ${latest.status ?? "unknown"} (last3: ${summary})`,
    liveCommit: String(live?.commit?.id ?? live?.commitId ?? "unknown").slice(0, 7) || "unknown",
  };
}

function getHealthStatus() {
  const urls = [
    process.env.PROD_HEALTH_URL,
    "https://app.ih35dispatch.com/api/v1/health",
    "https://api.ih35dispatch.com/api/v1/health",
  ].filter(Boolean);
  for (const url of urls) {
    const res = run(`curl -sS -m 8 "${url}"`);
    const payload = parseJson(res.stdout, null);
    if (payload && payload.status) {
      return `${payload.status} (${url})`;
    }
  }
  return "unknown";
}

function parseBlockPlan(fileContent) {
  const blockRegex = /^(\d+(?:\.\d+)?)\s+—\s+(P7-[A-Z0-9-]+)/gm;
  const blocks = [];
  let match;
  while ((match = blockRegex.exec(fileContent)) !== null) {
    blocks.push({ number: match[1], id: match[2] });
  }
  return blocks;
}

function readBlockPlanFile() {
  const candidates = [
    path.resolve(ROOT, "IH35-TMS-BLOCKS-02.5-TO-10.md"),
    "/mnt/user-data/IH35-TMS-BLOCKS-02.5-TO-10.md",
    "/Users/jorgemunoz/Downloads/IH35-TMS-BLOCKS-02.5-TO-10.md",
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, "utf8");
    }
  }
  return "";
}

function getBlockContext() {
  const manifestPath = path.resolve(ROOT, ".block-ready.json");
  const manifest = fs.existsSync(manifestPath) ? parseJson(fs.readFileSync(manifestPath, "utf8"), {}) : {};
  const planContent = readBlockPlanFile();
  if (!planContent) {
    return { blockContext: manifest.block_id ? `${manifest.block_id} — in progress` : "unknown", nextBlocks: "unknown" };
  }
  const blocks = parseBlockPlan(planContent);
  if (!manifest.block_id) {
    return {
      blockContext: "unknown",
      nextBlocks: blocks.slice(0, 3).map((b) => `${b.number} (${b.id})`).join(", ") || "unknown",
    };
  }
  const currentIdx = blocks.findIndex((b) => b.id === manifest.block_id);
  if (currentIdx < 0) {
    return { blockContext: `${manifest.block_id} — in progress`, nextBlocks: "unknown" };
  }
  return {
    blockContext: `BLOCK ${blocks[currentIdx].number} (${blocks[currentIdx].id}) — in progress`,
    nextBlocks: blocks.slice(currentIdx + 1, currentIdx + 4).map((b) => `${b.number} (${b.id})`).join(", ") || "none",
  };
}

export function computeRecommendedNext(state) {
  if (state.mergedUpstream) {
    return `git checkout main && git pull --ff-only origin main && git branch -D ${state.branch}`;
  }
  if (state.behind > 0) {
    return "npm run branch:rebuild-linear -- --source HEAD --message \"linear rebuild\"";
  }
  if (state.dirtyCount > 0) {
    return "git add -A && git commit -m \"<message>\" && npm run block:ship -- \"<message>\"";
  }
  if (state.ahead > 0) {
    return "npm run branch:precheck-push";
  }
  return "git checkout -b <next-block-branch> origin/main";
}

export function gatherSyncState() {
  run("git fetch origin");
  const envFile = parseEnvFile(path.resolve(ROOT, ".env.local"));
  const repoSlug = parseRepoSlug();
  const branchState = getBranchState();
  const ghAvailable = hasGh();
  const githubToken = process.env.GITHUB_TOKEN || envFile.GITHUB_TOKEN || "";
  const renderToken = process.env.RENDER_API_KEY || process.env.RENDER_TOKEN || envFile.RENDER_API_KEY || envFile.RENDER_TOKEN || "";
  const githubState = getGithubState({
    branch: branchState.branch,
    repoSlug,
    token: githubToken,
    ghAvailable,
  });
  const renderState = getRenderState({ token: renderToken });
  const health = getHealthStatus();
  const blockContext = getBlockContext();

  const envStatus = {
    GITHUB_BASE_SHA: process.env.GITHUB_BASE_SHA ? "set" : "unset (inferable from origin/main)",
    GITHUB_TOKEN: githubToken ? "set" : "unset",
    RENDER_API_KEY: renderToken ? "set" : "unset",
    GH_CLI: ghAvailable ? "installed" : "missing (brew install gh)",
  };

  const report = {
    timestamp: new Date().toISOString(),
    branch: branchState.branch,
    head: branchState.head,
    workingTree: branchState.workingTree,
    mainHead: `${branchState.mainHead} (${renderState.deploy}, /health ${health})`,
    branchVsMain: `${branchState.ahead} ahead, ${branchState.behind} behind, ${branchState.mergeCommits} merge commits`,
    openPr: githubState.openPr,
    env: envStatus,
    blockContext: blockContext.blockContext,
    nextBlocks: blockContext.nextBlocks,
    recommendedNext: computeRecommendedNext(branchState),
  };

  return {
    report,
    details: {
      ...branchState,
      repoSlug,
      latestMergedMain: githubState.latestMergedMain,
      renderLiveCommit: renderState.liveCommit,
    },
  };
}

function main() {
  const { report } = gatherSyncState();
  console.log(formatSyncStatus(report));
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main();
}
