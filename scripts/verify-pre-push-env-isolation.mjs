#!/usr/bin/env node
/**
 * verify-pre-push-env-isolation — Rule 18 / CURSOR-PIPELINE-REPAIR P0-1.
 *
 * Locks: husky pre-push must NOT shell-source repository `.env`, and
 * branch-precheck database capability must NOT treat a bare DATABASE_URL
 * string as proof. Wired via Rule 17 verify-steps only (no package/CI hotfiles).
 *
 * Self-test: node scripts/verify-pre-push-env-isolation.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-pre-push-env-isolation";

const FILES = Object.freeze({
  prePush: ".husky/pre-push",
  installHooks: "scripts/install-git-hooks.mjs",
  precheck: "scripts/branch-precheck-push.mjs",
  precheckTests: "scripts/__tests__/branch-precheck-push.test.mjs",
  branchTooling: "docs/specs/BRANCH-TOOLING.md",
  verifyStep: "scripts/verify-steps/912-verify-pre-push-env-isolation.mjs",
});

function read(rel, root = ROOT) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

export function checkPrePushEnvIsolation(fixture) {
  const violations = [];
  const prePush = fixture.prePush ?? "";
  const installHooks = fixture.installHooks ?? "";
  const precheck = fixture.precheck ?? "";
  const tests = fixture.precheckTests ?? "";
  const docs = fixture.branchTooling ?? "";
  const step = fixture.verifyStep ?? "";

  // Strip comments before scanning for shell source — prose may mention ".env".
  const prePushCode = prePush
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  if (/(?:^|\n)\s*\.\s+["']?\$?\(?.*\.env/.test(prePushCode) || /(?:^|\n)\s*set -a\s*\n/.test(prePushCode)) {
    violations.push(".husky/pre-push must not shell-source repository .env (set -a / . .env)");
  }
  if (/(?:^|\n)\s*source\s+.*\.env/.test(prePushCode)) {
    violations.push(".husky/pre-push must not `source` repository .env");
  }
  if (!/npm run branch:precheck-push/.test(prePush)) {
    violations.push(".husky/pre-push must invoke npm run branch:precheck-push");
  }
  if (/HUSKY\s*=\s*0|--no-verify/.test(prePush)) {
    violations.push(".husky/pre-push must not weaken/bypass verification");
  }

  if (/set -a[\s\S]*\.env/.test(installHooks) || /\. "\$\(git rev-parse/.test(installHooks)) {
    violations.push("install-git-hooks.mjs must not regenerate a .env-sourcing pre-push");
  }

  if (/database:\s*Boolean\(\s*env\.DATABASE_URL/.test(precheck)) {
    violations.push("detectLocalCapabilities must not treat DATABASE_URL string presence as capability");
  }
  if (!/validateOwnershipProof/.test(precheck) || !/isLocalVerifyDatabaseUrl/.test(precheck)) {
    violations.push("detectLocalCapabilities must require owned VLCI proof or local-verify URL validation");
  }
  if (!/probeLocalVerifyTcp/.test(precheck)) {
    violations.push("detectLocalCapabilities must validate local-CI connections (TCP probe)");
  }
  if (!/serverRequiredCiEquivalent:\s*"ci \/ build-typecheck"/.test(precheck)) {
    violations.push("precheck must preserve server-required CI equivalent fail-closed skip");
  }

  for (const planted of [
    "stale Neon DATABASE_URL string alone is never a database capability",
    "actual pre-push hook does not source hostile .env",
    "explicitly inherited owned ephemeral DB context still runs DB gates",
    "precheck with stale Neon env skips block-ready via server-required CI equivalent",
  ]) {
    if (!tests.includes(planted)) {
      violations.push(`precheck behavioral test missing: ${planted}`);
    }
  }

  if (
    !/Do NOT source repository/.test(docs) &&
    !/must not shell-source/.test(docs) &&
    !/must not source repository/.test(docs)
  ) {
    violations.push("BRANCH-TOOLING.md must document that pre-push must not source repository .env");
  }
  if (!/owned ephemeral|VLCI|validated/.test(docs)) {
    violations.push("BRANCH-TOOLING.md must document owned-lifecycle / validated DB capability law");
  }

  if (!/verify-pre-push-env-isolation/.test(step)) {
    violations.push("Rule 17 verify-step 912 must invoke verify-pre-push-env-isolation");
  }

  return violations;
}

function loadFixture(root = ROOT) {
  return Object.fromEntries(
    Object.entries(FILES).map(([key, rel]) => [key, read(rel, root)])
  );
}

function selftest() {
  const good = {
    prePush: "#!/usr/bin/env sh\nnpm run branch:precheck-push\n",
    installHooks: 'const script = `#!/usr/bin/env sh\\nnpm run branch:precheck-push\\n`;\n',
    precheck:
      'import { validateOwnershipProof, isLocalVerifyDatabaseUrl } from "./vlci-lifecycle.mjs";\n' +
      "export function probeLocalVerifyTcp() {}\n" +
      'serverRequiredCiEquivalent: "ci / build-typecheck"\n' +
      "export function detectLocalCapabilities() { return { database: false }; }\n",
    precheckTests:
      "stale Neon DATABASE_URL string alone is never a database capability\n" +
      "actual pre-push hook does not source hostile .env\n" +
      "explicitly inherited owned ephemeral DB context still runs DB gates\n" +
      "precheck with stale Neon env skips block-ready via server-required CI equivalent\n",
    branchTooling:
      "Do NOT source repository `.env` in the husky pre-push hook.\n" +
      "Database capability requires owned ephemeral VLCI lifecycle or a validated local-CI connection.\n",
    verifyStep: 'ctx.run("node", ["scripts/verify-pre-push-env-isolation.mjs"])\n',
  };
  const goodViolations = checkPrePushEnvIsolation(good);
  if (goodViolations.length) {
    throw new Error(`selftest good fixture failed: ${goodViolations.join("; ")}`);
  }

  const bad = {
    ...good,
    prePush: `#!/usr/bin/env sh
if [ -f "$(git rev-parse --show-toplevel)/.env" ]; then
  set -a
  . "$(git rev-parse --show-toplevel)/.env"
  set +a
fi
npm run branch:precheck-push
`,
    precheck: "export function detectLocalCapabilities(env = process.env) {\n  return { database: Boolean(env.DATABASE_URL?.trim()) };\n}\n",
  };
  const badViolations = checkPrePushEnvIsolation(bad);
  if (badViolations.length < 2) {
    throw new Error(`selftest bad fixture should flag .env source + string capability; got: ${badViolations.join("; ")}`);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const violations = checkPrePushEnvIsolation(loadFixture());
  if (violations.length) {
    console.error(`${LABEL} FAIL:`);
    for (const v of violations) console.error(`  ✗ ${v}`);
    process.exit(1);
  }
  // Behavioral suite is the live proof; invoke when not skipped by caller.
  if (process.env.IH35_PRE_PUSH_ENV_ISOLATION_RUN_TESTS === "1") {
    const run = spawnSync(
      process.execPath,
      ["--test", "scripts/__tests__/branch-precheck-push.test.mjs"],
      { cwd: ROOT, encoding: "utf8" }
    );
    if (run.status !== 0) {
      console.error(run.stdout);
      console.error(run.stderr);
      console.error(`${LABEL} FAIL: behavioral tests exited ${run.status}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} OK — pre-push env isolation + capability law locked`);
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) main();
