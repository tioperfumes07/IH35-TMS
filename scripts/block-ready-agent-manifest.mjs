import path from "node:path";

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

export function resolveBlockReadyManifest(options = {}) {
  const worktreePath = path.resolve(options.worktreePath ?? process.cwd());
  const envAgent = normalizeAgent(options.agentEnv ?? process.env.AGENT);
  const inferredAgent = inferAgentFromWorktreePath(worktreePath);
  const agent = envAgent ?? inferredAgent ?? "1";
  const manifest = AGENT_MANIFEST_REGISTRY[agent] ?? AGENT_MANIFEST_REGISTRY["1"];
  return { agent, manifest, worktreePath };
}
