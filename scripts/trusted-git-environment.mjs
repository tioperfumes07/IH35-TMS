import { spawnSync } from "node:child_process";

// Bootstrap set documented by Git 2.51 on the project host. This set makes the command that discovers the
// authoritative dynamic list immune to repository/config redirection. The dynamic result may add names,
// but it may never omit these known controls.
export const BOOTSTRAP_LOCAL_GIT_VARIABLES = Object.freeze([
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_CONFIG",
  "GIT_CONFIG_COUNT",
  "GIT_CONFIG_PARAMETERS",
  "GIT_DIR",
  "GIT_GRAFT_FILE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_OBJECT_DIRECTORY",
  "GIT_PREFIX",
  "GIT_REPLACE_REF_BASE",
  "GIT_SHALLOW_FILE",
  "GIT_WORK_TREE",
]);

export const GITHUB_CONFIG_VARIABLES = Object.freeze([
  "GH_CONFIG_DIR",
  "GH_ENTERPRISE_TOKEN",
  "GH_HOST",
  "GH_REPO",
  "GITHUB_ENTERPRISE_TOKEN",
]);

export const GIT_CONFIG_VARIABLES = Object.freeze([
  "GIT_CONFIG",
  "GIT_CONFIG_COUNT",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_NOSYSTEM",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_SYSTEM",
]);

function stripVariables(source, names) {
  const env = { ...source };
  for (const name of names) delete env[name];
  return env;
}

function commandFailure(result, label) {
  if (result.error) {
    return `${label} failed: ${result.error.code ?? result.error.name}: ${result.error.message}`;
  }
  const detail = String(result.stderr || result.stdout || "").trim();
  return `${label} failed with exit ${result.status}${detail ? `: ${detail}` : ""}`;
}

export function readDocumentedLocalGitVariables(
  root,
  {
    sourceEnv = process.env,
    run = (command, args, options) => spawnSync(command, args, options),
  } = {}
) {
  const bootstrapEnv = stripVariables(sourceEnv, [
    ...BOOTSTRAP_LOCAL_GIT_VARIABLES,
    ...GIT_CONFIG_VARIABLES,
    ...GITHUB_CONFIG_VARIABLES,
    ...Object.keys(sourceEnv).filter((name) => /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(name)),
  ]);
  const result = run("git", ["rev-parse", "--local-env-vars"], {
    cwd: root,
    env: bootstrapEnv,
    encoding: "utf8",
    timeout: 5_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0 || result.error) {
    throw new Error(commandFailure(result, "Git local-environment discovery"));
  }
  const variables = String(result.stdout ?? "")
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
  if (
    variables.length === 0 ||
    variables.some((name) => !/^GIT_[A-Z0-9_]+$/.test(name))
  ) {
    throw new Error("Git local-environment discovery returned an invalid variable list");
  }
  const missingBootstrap = BOOTSTRAP_LOCAL_GIT_VARIABLES.filter(
    (name) => !variables.includes(name)
  );
  if (missingBootstrap.length > 0) {
    throw new Error(
      `Git local-environment discovery omitted known controls: ${missingBootstrap.join(", ")}`
    );
  }
  return [...new Set(variables)];
}

export function sanitizeTrustedProcessEnvironment(
  root,
  {
    sourceEnv = process.env,
    run,
  } = {}
) {
  const localGitVariables = readDocumentedLocalGitVariables(root, {
    sourceEnv,
    run,
  });
  return {
    env: stripVariables(sourceEnv, [
      ...localGitVariables,
      ...GIT_CONFIG_VARIABLES,
      ...GITHUB_CONFIG_VARIABLES,
      ...Object.keys(sourceEnv).filter((name) => /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(name)),
    ]),
    localGitVariables,
  };
}

/**
 * The env every child `git` in a FIXTURE-BUILDING script must use.
 *
 * Git invokes hooks with GIT_DIR (and, in a worktree, GIT_COMMON_DIR / GIT_INDEX_FILE) exported, and
 * git's own environment outranks the `cwd:` a caller passes to spawn. A selftest that builds a
 * throwaway repo therefore aims its `git add -A` / `git commit` / `git config` at the repo being
 * pushed, with the throwaway directory as the work tree. Measured 2026-07-28 on this repo: the
 * pre-push run of `verify-no-money-theater --selftest` staged the deletion of all 12,011 tracked
 * files and committed it over the branch as "c0"; the branch had to be rebuilt from the worktree.
 *
 * Stripping the repository-local variables makes each child resolve its repo by discovery from
 * `cwd`, which is what those call sites already mean, and is a no-op outside a hook. Falls back to
 * the documented bootstrap floor when discovery itself cannot run.
 */
let cachedChildEnv = null;
export function gitChildEnv(root = process.cwd()) {
  if (cachedChildEnv) return cachedChildEnv;
  try {
    cachedChildEnv = sanitizeTrustedProcessEnvironment(root).env;
  } catch {
    cachedChildEnv = stripVariables(process.env, [
      ...BOOTSTRAP_LOCAL_GIT_VARIABLES,
      ...GIT_CONFIG_VARIABLES,
      ...GITHUB_CONFIG_VARIABLES,
    ]);
  }
  return cachedChildEnv;
}
