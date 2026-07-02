#!/usr/bin/env node
// ExtraGuardSpec for the arch-design runner.
//
// IMPORTANT: importing this module MUST have no side effects. The runner
// (scripts/verify-architectural-design.ts -> loadExtraGuards) `await import`s
// every guard file solely to read its `default` spec, then runs the actual
// check via `execSync("node " + spec.script)`. A previous version ran
// spawnSync("npm", ...) + process.exit(...) at module top level, which
// terminated the runner process at import time and silently skipped every guard
// sorted after this file. Keep the check in `script`; only self-run when
// invoked directly.

export default {
  script: "scripts/verify-names-master-readonly.mjs",
  label: "verify-names-master-readonly",
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const { spawnSync } = await import("node:child_process");
  const res = spawnSync("node", ["scripts/verify-names-master-readonly.mjs"], {
    stdio: "inherit",
  });
  process.exit(res.status ?? 1);
}
