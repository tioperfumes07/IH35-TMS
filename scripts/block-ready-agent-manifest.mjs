import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

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
  const blockId = String(options.blockId ?? process.env.BLOCK_ID ?? "").trim();
  const branch =
    options.branch ??
    execSync("git branch --show-current", {
      cwd: worktreePath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
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

  if (!branch) throw new Error("cannot resolve block manifest without BLOCK_ID or current branch");
  const branchMatches = candidates.filter(({ manifest }) => manifest.branch === branch);
  if (branchMatches.length === 0) {
    throw new Error(
      `no .block-ready manifest has exact branch "${branch}"; set BLOCK_ID to an exact manifest id`
    );
  }
  if (branchMatches.length > 1) {
    throw new Error(
      `ambiguous exact branch "${branch}" matches: ${branchMatches
        .map(({ relativePath }) => relativePath)
        .join(", ")}`
    );
  }
  return {
    agent: null,
    manifest: branchMatches[0].relativePath,
    worktreePath,
    resolution: "exact-branch",
  };
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
