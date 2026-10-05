// Build / serving identity — pure reads of the deploy environment (Render / GitHub). No HTTP: the program tracker and the
// module-completion service import it from here, never from health.routes.ts (a service importing a route module drags the
// auth middleware and session provider in with it — CC-2 2026-10-04).

export function resolveBackendVersion(): string {
  return resolveBackendGitSha().slice(0, 7);
}

/** Full commit SHA when available (Render / GitHub CI); else `"dev"`. */
export function resolveBackendGitSha(): string {
  const renderCommit = process.env.RENDER_GIT_COMMIT?.trim();
  if (renderCommit) return renderCommit;
  const githubSha = process.env.GITHUB_SHA?.trim();
  if (githubSha) return githubSha;
  return "dev";
}

/**
 * HEALTH-NO-SHA-01 — build/serving identity timestamp (ISO-8601).
 * Prefer explicit bake env (`IH35_BUILD_AT` / `BUILD_TIMESTAMP`); else this Node process boot time
 * (on Render, a new deploy replaces the process — boot ≈ deploy of this instance).
 */
export function resolveBuildTimestamp(): string {
  const baked =
    process.env.IH35_BUILD_AT?.trim() ||
    process.env.BUILD_TIMESTAMP?.trim() ||
    process.env.SOURCE_DATE?.trim();
  if (baked) return baked;
  return new Date(Date.now() - process.uptime() * 1000).toISOString();
}

/** Branch or tag the process was built from (Render / GitHub Actions). */
export function resolveBuildRef(): string {
  const renderBranch = process.env.RENDER_GIT_BRANCH?.trim();
  if (renderBranch) return renderBranch;
  const githubRefName = process.env.GITHUB_REF_NAME?.trim();
  if (githubRefName) return githubRefName;
  const githubRef = process.env.GITHUB_REF?.trim();
  if (githubRef) {
    const m = githubRef.match(/^refs\/(?:heads|tags)\/(.+)$/);
    if (m?.[1]) return m[1];
    return githubRef;
  }
  return "unknown";
}
