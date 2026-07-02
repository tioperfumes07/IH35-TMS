#!/usr/bin/env node
// ExtraGuardSpec for the arch-design runner.
//
// IMPORTANT: importing this module MUST have no side effects. The runner
// (scripts/verify-architectural-design.ts -> loadExtraGuards) `await import`s
// every guard file solely to read its `default` spec, then runs the actual
// check via `execSync("node " + spec.script)`. A previous version ran
// spawnSync(...) + process.exit(...) at module top level, which terminated the
// runner process at import time and silently skipped every guard sorted after
// this file. Keep the check in `script`; only self-run when invoked directly.

export default {
  script: "scripts/verify-kpi-sources-of-truth-exists.mjs",
  label: "verify-kpi-sources-of-truth-exists",
};

// Preserve direct-invocation behavior (`node scripts/verify-guards/139-...mjs`)
// without side effects on import.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { spawnSync } = await import("node:child_process");
  const path = (await import("node:path")).default;
  const { fileURLToPath } = await import("node:url");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const res = spawnSync("node", ["scripts/verify-kpi-sources-of-truth-exists.mjs"], {
    cwd: root,
    stdio: "inherit",
  });
  process.exit(res.status ?? 1);
}
