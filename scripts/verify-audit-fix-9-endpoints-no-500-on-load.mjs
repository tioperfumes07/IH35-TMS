#!/usr/bin/env node
import { runNpmScripts } from "./pass-7/_delegate.mjs";
import { spawnSync } from "node:child_process";

const selftest = spawnSync(process.execPath, ["scripts/verify-no-flaky-endpoints-on-page-load.mjs", "--selftest"], {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: "inherit",
});
if (selftest.status !== 0) process.exit(selftest.status ?? 1);
runNpmScripts(["verify:no-flaky-endpoints-on-page-load"], "verify-audit-fix-9-endpoints-no-500-on-load");
