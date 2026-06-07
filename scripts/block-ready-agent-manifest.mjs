import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export const AGENT_MANIFEST_REGISTRY = Object.freeze({
  "1": ".block-ready.agent1.json",
  "2": ".block-ready.agent2.json",
});

function normalizeAgent(raw) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value === "1" || value === "agent1" || value === "agent-1") return "1";
  if (value === "2" || value === "agent2" || value === "agent-2") return "2";
  return null;
}

function inferAgentFromWorktreePath(worktreePath) {
  const normalized = String(worktreePath ?? "").replace(/\\/g, "/").toLowerCase();
  if (!normalized) return null;
  if (/agent[-_]?2\b/.test(normalized)) return "2";
  if (/agent[-_]?1\b/.test(normalized)) return "1";
  return null;
}

function inferBlockIdFromBranch(worktreePath) {
  try {
    const branch = execSync("git branch --show-current", {
      cwd: worktreePath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const numbered = branch.match(/(?:^|\/)gap-(\d+)\b/i);
    if (numbered) return `GAP-${numbered[1]}`;
    const named = branch.match(/(?:^|\/)gap-([\w-]+)\b/i);
    if (named) return `GAP-${named[1].toUpperCase()}`;
  } catch {
    return null;
  }
  return null;
}

function manifestCandidate(worktreePath, blockReadyDir, blockId) {
  const exact = path.join(blockReadyDir, `${blockId}.json`);
  if (fs.existsSync(exact)) {
    return path.relative(worktreePath, exact);
  }
  const prefixMatches = fs
    .readdirSync(blockReadyDir)
    .filter((file) => file.endsWith(".json") && file.startsWith(`${blockId}-`));
  if (prefixMatches.length === 1) {
    return path.relative(worktreePath, path.join(blockReadyDir, prefixMatches[0]));
  }
  return null;
}

/**
 * Scan .block-ready/ for a per-block manifest JSON file.
 *
 * Priority order:
 *   1. BLOCK_ID env var  → .block-ready/<BLOCK_ID>.json
 *   2. block_id field from the legacy agentN file (if it exists)
 *      → .block-ready/<block_id>.json
 *   3. Single non-gitkeep .json in .block-ready/ (unambiguous case)
 *
 * Returns the relative manifest path if found, null otherwise.
 */
function resolvePerBlockManifest(worktreePath, legacyManifestPath) {
  const blockReadyDir = path.join(worktreePath, ".block-ready");
  if (!fs.existsSync(blockReadyDir)) return null;

  // Priority 1: explicit BLOCK_ID env var
  const envBlockId = (process.env.BLOCK_ID ?? "").trim();
  if (envBlockId) {
    const resolved = manifestCandidate(worktreePath, blockReadyDir, envBlockId);
    if (resolved) return resolved;
  }

  const branchBlockId = inferBlockIdFromBranch(worktreePath);
  if (branchBlockId) {
    const resolved = manifestCandidate(worktreePath, blockReadyDir, branchBlockId);
    if (resolved) return resolved;
  }

  // Priority 2: derive block_id from legacy manifest file
  const legacyAbs = path.resolve(worktreePath, legacyManifestPath);
  if (fs.existsSync(legacyAbs)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(legacyAbs, "utf8"));
      const blockId = parsed?.block_id;
      if (blockId) {
        const resolved = manifestCandidate(worktreePath, blockReadyDir, blockId);
        if (resolved) return resolved;
      }
    } catch {
      // malformed legacy file; fall through
    }
  }

  // Priority 3: only one non-.gitkeep JSON file in .block-ready/
  let jsonFiles;
  try {
    jsonFiles = fs
      .readdirSync(blockReadyDir)
      .filter((f) => f.endsWith(".json") && f !== ".gitkeep");
  } catch {
    return null;
  }
  if (jsonFiles.length === 1) {
    return path.relative(worktreePath, path.join(blockReadyDir, jsonFiles[0]));
  }

  return null;
}

export function resolveBlockReadyManifest(options = {}) {
  const worktreePath = path.resolve(options.worktreePath ?? process.cwd());
  const envAgent = normalizeAgent(options.agentEnv ?? process.env.AGENT);
  const inferredAgent = inferAgentFromWorktreePath(worktreePath);
  const agent = envAgent ?? inferredAgent ?? "1";
  const legacyManifest = AGENT_MANIFEST_REGISTRY[agent] ?? AGENT_MANIFEST_REGISTRY["1"];

  // Prefer the new per-block pattern when available
  const perBlockManifest = resolvePerBlockManifest(worktreePath, legacyManifest);
  const manifest = perBlockManifest ?? legacyManifest;

  return { agent, manifest, worktreePath };
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
