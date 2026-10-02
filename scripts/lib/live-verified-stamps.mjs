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

/**
 * Tri-state ancestry. Prefer this over isAncestor().
 * @returns {"yes"|"no"|"unknown"}
 *   unknown = unresolvable ref (shallow clone / unfetched SHA) — NEVER treat as "not an ancestor".
 */
export function ancestorCheck(root, maybeAncestor, descendant) {
  const a = expandSha(root, maybeAncestor);
  const b = expandSha(root, descendant);
  if (!a || !b) return "unknown";
  try {
    execSync(`git merge-base --is-ancestor ${a} ${b}`, {
      cwd: root,
      stdio: "ignore",
    });
    return "yes";
  } catch {
    // After expandSha, exit≠0 means "not an ancestor" (git merge-base --is-ancestor).
    return "no";
  }
}

/**
 * Make an unresolvable commit resolvable, cheaply and with a hard time bound.
 *
 * WHY THIS EXISTS — measured 2026-10-02, and it is the cause of "the pushes are taking too long".
 * A fresh worktree does not carry the SHA the live backend reports from /healthz, because that
 * commit was fetched into a different worktree's object store or landed after this clone's last
 * fetch. The previous recovery was a blind `execSync("git fetch -q origin")` with NO timeout. Over a
 * network-mounted repository that fetch walks every ref and does not come back for many minutes, and
 * it runs on EVERY seat's EVERY push, before a single guard has reported. Measured on the same
 * worktree and the same clone:
 *
 *   blind `git fetch origin`                        > 10 minutes, never observed to finish
 *   `git fetch --no-tags origin <the one sha>`         9.9 seconds
 *
 * So fetch the one object actually needed, bounded, and only fall back to the broad fetch — also
 * bounded — if the targeted one fails. A guard that costs ten minutes gets switched off, and a
 * switched-off guard protects nothing; this keeps the protection and returns the time.
 *
 * @returns {string} the full SHA once resolvable, or "" if it could not be resolved.
 */
export function ensureResolvable(root, sha, { timeoutMs = 45000 } = {}) {
  const already = expandSha(root, sha);
  if (already) return already;
  if (!/^[0-9a-f]{7,40}$/i.test(String(sha || ""))) return "";
  try {
    execSync(`git fetch -q --no-tags origin ${sha}`, {
      cwd: root,
      stdio: "ignore",
      timeout: timeoutMs,
    });
  } catch {
    try {
      execSync("git fetch -q --no-tags origin", { cwd: root, stdio: "ignore", timeout: timeoutMs });
    } catch {
      /* offline, or the remote does not serve that object — caller gets "" and fails closed */
    }
  }
  return expandSha(root, sha);
}

/**
 * Tri-state ancestry for MANY candidates against ONE descendant, in a single git process.
 *
 * WHY: every caller of ancestorCheck in this repo compares N claims against the same live SHA, so
 * the per-claim call spawned 3 git processes each — ~450 for the 151 prod_verified claims. The set of
 * a commit's ancestors is one `git rev-list`, measured at 0.3s for 25,569 commits on this clone.
 *
 * The semantics are IDENTICAL to ancestorCheck, including the two that matter:
 *   - a commit IS an ancestor of itself (rev-list emits the tip), matching `merge-base --is-ancestor`
 *   - an unresolvable candidate returns "unknown", NEVER "no" — fail closed, never guess
 *
 * @returns {(candidate: string) => "yes"|"no"|"unknown"}
 */
export function ancestorCheckerFor(root, descendant) {
  const tip = expandSha(root, descendant);
  if (!tip) return () => "unknown";
  let ancestors;
  try {
    ancestors = new Set(
      execSync(`git rev-list ${tip}`, {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      })
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    );
  } catch {
    // rev-list itself failed (corrupt or partial object store) — do not guess for anyone.
    return () => "unknown";
  }
  const memo = new Map();
  return (candidate) => {
    const key = String(candidate || "");
    if (memo.has(key)) return memo.get(key);
    const full = expandSha(root, key);
    const verdict = !full ? "unknown" : ancestors.has(full) ? "yes" : "no";
    memo.set(key, verdict);
    return verdict;
  };
}

/** @deprecated Prefer ancestorCheck — boolean false conflates "not ancestor" with "cannot determine". */
export function isAncestor(root, maybeAncestor, descendant) {
  return ancestorCheck(root, maybeAncestor, descendant) === "yes";
}

function ciOrProd() {
  return (
    process.env.CI === "true" ||
    process.env.CI === "1" ||
    process.env.GITHUB_ACTIONS === "true" ||
    process.env.NODE_ENV === "production"
  );
}

/** Env override is selftest-only and hard-refused under CI / NODE_ENV=production. */
export function healthzEnvOverrideAllowed(opts = {}) {
  const selftest = process.argv.includes("--selftest") || opts.selftest === true;
  if (ciOrProd()) return false;
  if (opts.forceCurl) return false;
  return selftest;
}

export function fetchHealthzVersionSync(url = HEALTHZ_SHALLOW, opts = {}) {
  if (healthzEnvOverrideAllowed(opts) && process.env.IH35_HEALTHZ_SHA) {
    return String(process.env.IH35_HEALTHZ_SHA).trim();
  }
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
    problems.push(
      `L6: CANNOT DETERMINE — healthz version ${healthzSha} is not resolvable in this clone (git fetch / fetch-depth 0)`
    );
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
    const verdict = ancestorCheck(gitRoot, s.sha, liveFull);
    if (verdict === "unknown") {
      problems.push(
        `${s.file} item ${s.id}: CANNOT DETERMINE whether live_verified_sha ${s.sha} is an ancestor of healthz ${healthzSha} — run git fetch origin (CI: fetch-depth 0)`
      );
    } else if (verdict === "no") {
      problems.push(
        `${s.file} item ${s.id}: live_verified_sha ${s.sha} is not an ancestor of healthz ${healthzSha}`
      );
    }
  }
  return problems;
}
