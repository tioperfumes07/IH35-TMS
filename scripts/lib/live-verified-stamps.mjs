/**
 * L6 — a completion-leaf stamp is valid only when live_verified_sha is an ancestor
 * of GET /api/v1/healthz/shallow `version`. Zero stamps is FAIL (empty scope is not a pass).
 */
import { execSync } from "node:child_process";

export const HEALTHZ_SHALLOW = "https://api.ih35dispatch.com/api/v1/healthz/shallow";

export function collectLiveVerifiedStamps(manifests) {
  const stamps = [];
  for (const { file, data } of manifests) {
    for (const it of data.items || []) {
      const sha = typeof it.live_verified_sha === "string" ? it.live_verified_sha.trim() : "";
      const at = it.live_verified_at;
      if (!sha && (at === undefined || at === null || at === "")) continue;
      stamps.push({
        file,
        id: it.id || "?",
        sha,
        at: at == null ? "" : String(at),
      });
    }
  }
  return stamps;
}

export function expandSha(root, short) {
  try {
    return execSync(`git rev-parse --verify ${short}^{commit}`, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function isAncestor(root, maybeAncestor, descendant) {
  try {
    execSync(`git merge-base --is-ancestor ${maybeAncestor} ${descendant}`, {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function fetchHealthzVersionSync(url = HEALTHZ_SHALLOW) {
  if (process.env.IH35_HEALTHZ_SHA) return String(process.env.IH35_HEALTHZ_SHA).trim();
  try {
    const body = execSync(`curl -fsS --max-time 8 ${JSON.stringify(url)}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const j = JSON.parse(body);
    const v = j && j.version;
    if (!v || typeof v !== "string") throw new Error("missing version");
    return v.trim();
  } catch (e) {
    throw new Error(`L6: GET ${url} failed — ${e.message || e}`);
  }
}

/**
 * @param {{ stamps: {file:string,id:string,sha:string,at:string}[], healthzSha: string, gitRoot: string }} args
 */
export function assertLiveVerifiedStamps({ stamps, healthzSha, gitRoot }) {
  const problems = [];
  if (!stamps.length) {
    problems.push(
      "L6: no live_verified_sha stamps on any completion leaf — empty scope is not a pass"
    );
    return problems;
  }
  const liveFull = expandSha(gitRoot, healthzSha);
  if (!liveFull) {
    problems.push(`L6: healthz version ${healthzSha} is not a git commit in this repo`);
    return problems;
  }
  for (const s of stamps) {
    if (!s.sha) {
      problems.push(`${s.file} item ${s.id}: live_verified_at set without live_verified_sha`);
      continue;
    }
    if (!s.at) {
      problems.push(`${s.file} item ${s.id}: live_verified_sha set without live_verified_at`);
      continue;
    }
    const stampFull = expandSha(gitRoot, s.sha);
    if (!stampFull) {
      problems.push(`${s.file} item ${s.id}: live_verified_sha ${s.sha} is not a git commit`);
      continue;
    }
    if (!isAncestor(gitRoot, stampFull, liveFull)) {
      problems.push(
        `${s.file} item ${s.id}: live_verified_sha ${s.sha} is not an ancestor of healthz ${healthzSha}`
      );
    }
  }
  return problems;
}
