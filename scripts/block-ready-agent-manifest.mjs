import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function readManifestCandidate(worktreePath, filename) {
  const blockReadyDir = path.join(worktreePath, ".block-ready");
  const absolutePath = path.join(blockReadyDir, filename);
  try {
    return {
      filename,
      manifest: JSON.parse(fs.readFileSync(absolutePath, "utf8")),
      relativePath: path.relative(worktreePath, absolutePath),
    };
  } catch (error) {
    throw new Error(`cannot read block manifest ${filename}: ${error.message}`);
  }
}

function listPerBlockManifests(worktreePath) {
  const blockReadyDir = path.join(worktreePath, ".block-ready");
  if (!fs.existsSync(blockReadyDir)) {
    throw new Error(`missing block manifest directory: ${blockReadyDir}`);
  }
  return fs
    .readdirSync(blockReadyDir)
    .filter((filename) => filename.endsWith(".json") && filename !== ".gitkeep")
    .map((filename) => readManifestCandidate(worktreePath, filename));
}

export function resolveBlockReadyManifest(options = {}) {
  const worktreePath = path.resolve(options.worktreePath ?? process.cwd());
  const env = options.env ?? process.env;
  const blockId = String(options.blockId ?? env.BLOCK_ID ?? "").trim();
  const branch = resolveTrustedBranch({
    explicitBranch: options.branch,
    env,
    worktreePath,
  });
  const candidates = listPerBlockManifests(worktreePath);

  if (blockId) {
    const exactFilename = `${blockId}.json`;
    const candidate = candidates.find(({ filename }) => filename === exactFilename);
    if (!candidate) {
      throw new Error(`BLOCK_ID=${blockId} requires exact manifest .block-ready/${exactFilename}`);
    }
    const manifestBlockId = candidate.manifest.block_id ?? candidate.manifest.block;
    if (manifestBlockId !== blockId) {
      throw new Error(
        `BLOCK_ID=${blockId} does not match manifest block id ${String(manifestBlockId)}`
      );
    }
    return { agent: null, manifest: candidate.relativePath, worktreePath, resolution: "block-id" };
  }

  if (!branch) {
    if (options.allowAggregate === true) {
      return {
        agent: null,
        manifest: null,
        worktreePath,
        resolution: "aggregate",
        reason: "detached checkout has no trusted head branch context",
      };
    }
    throw new Error("cannot resolve block manifest without BLOCK_ID or trusted branch context");
  }
  const branchMatches = candidates.filter(({ manifest }) => manifest.branch === branch);
  if (branchMatches.length === 0) {
    if (options.allowAggregate === true) {
      return {
        agent: null,
        manifest: null,
        worktreePath,
        resolution: "aggregate",
        reason: `no exact manifest for trusted branch "${branch}"`,
      };
    }
    throw new Error(
      `no .block-ready manifest has exact branch "${branch}"; set BLOCK_ID to an exact manifest id`
    );
  }
  if (branchMatches.length > 1) {
    // MULTI-BLOCK BRANCH (fix 2026-07-20): one branch legitimately registering several
    // .block-ready manifests is a SET, not an ambiguity. This previously threw
    // unconditionally — even for callers that passed allowAggregate:true — which was
    // inconsistent with the branchMatches.length === 0 path above, which has always
    // degraded to aggregate for exactly those callers.
    //
    // Why it mattered: verify-pre-commit.mjs calls this with allowAggregate:true at
    // IMPORT time (line 13), before a single guard is constructed. So registering N
    // blocks on one branch made this throw and took down the ENTIRE ~250-guard suite,
    // with an error message that never mentions guards. Same failure class as the
    // known BLOCK_ID import-time crash: a manifest-resolution failure masquerading as
    // total verification loss. Aggregate mode already means "run every verify-step",
    // which is precisely the correct behavior for a branch carrying multiple blocks.
    //
    // BLOCK_ID still selects a single manifest when set (handled earlier), and callers
    // that do NOT opt into aggregate still get the hard error.
    if (options.allowAggregate === true) {
      return {
        agent: null,
        manifest: null,
        worktreePath,
        resolution: "aggregate",
        reason: `branch "${branch}" registers ${branchMatches.length} blocks (${branchMatches
          .map(({ relativePath }) => relativePath)
          .join(", ")}); running all verify-steps`,
      };
    }
    throw new Error(
      `ambiguous exact branch "${branch}" matches: ${branchMatches
        .map(({ relativePath }) => relativePath)
        .join(", ")}; set BLOCK_ID to an exact manifest id or pass allowAggregate`
    );
  }
  return {
    agent: null,
    manifest: branchMatches[0].relativePath,
    worktreePath,
    resolution: "exact-branch",
  };
}

export function resolveTrustedBranch({
  explicitBranch,
  env = process.env,
  worktreePath = process.cwd(),
} = {}) {
  if (typeof explicitBranch === "string" && explicitBranch.trim()) {
    return explicitBranch.trim();
  }
  const isGitHubActions = env.GITHUB_ACTIONS === "true";
  if (
    isGitHubActions &&
    typeof env.GITHUB_HEAD_REF === "string" &&
    env.GITHUB_HEAD_REF.trim()
  ) {
    return env.GITHUB_HEAD_REF.trim();
  }
  const githubRefName =
    typeof env.GITHUB_REF_NAME === "string" ? env.GITHUB_REF_NAME.trim() : "";
  const githubRef = typeof env.GITHUB_REF === "string" ? env.GITHUB_REF.trim() : "";
  const isTrustedBranchRef =
    isGitHubActions &&
    (env.GITHUB_REF_TYPE === "branch" || githubRef.startsWith("refs/heads/"));
  if (githubRefName && isTrustedBranchRef) return githubRefName;
  if (isGitHubActions && githubRef.startsWith("refs/heads/")) {
    return githubRef.slice("refs/heads/".length);
  }
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      cwd: worktreePath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Aggregate all per-block manifests from .block-ready/*.json.
 * Returns an array of parsed manifest objects (skips unreadable files).
 */
export function aggregateBlockReadyManifests(worktreePath = process.cwd()) {
  const blockReadyDir = path.join(path.resolve(worktreePath), ".block-ready");
  if (!fs.existsSync(blockReadyDir)) return [];
  const results = [];
  for (const filename of fs.readdirSync(blockReadyDir)) {
    if (!filename.endsWith(".json") || filename === ".gitkeep") continue;
    try {
      const raw = fs.readFileSync(path.join(blockReadyDir, filename), "utf8");
      results.push(JSON.parse(raw));
    } catch {
      // skip unreadable/unparseable files
    }
  }
  return results;
}
