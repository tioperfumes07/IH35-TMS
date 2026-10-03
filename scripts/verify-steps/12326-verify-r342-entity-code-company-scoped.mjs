#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const r = spawnSync(process.execPath, ["scripts/verify-r342-entity-code-company-scoped.mjs", "--selftest"], {
  cwd: root,
  stdio: "inherit",
});
const r2 = spawnSync(process.execPath, ["scripts/verify-r342-factor-reserve-oci-field.mjs", "--selftest"], {
  cwd: root,
  stdio: "inherit",
});
const r3 = spawnSync(process.execPath, ["scripts/verify-r342-dual-scoped-factoring-reads.mjs", "--selftest"], {
  cwd: root,
  stdio: "inherit",
});
const r4 = spawnSync(process.execPath, ["scripts/verify-r342-dual-scoped-insurance-reads.mjs", "--selftest"], {
  cwd: root,
  stdio: "inherit",
});
process.exit(r.status === 0 && r2.status === 0 && r3.status === 0 && r4.status === 0 ? 0 : 1);
