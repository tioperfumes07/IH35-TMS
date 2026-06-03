#!/usr/bin/env node
import { spawnSync } from "node:child_process";
const r = spawnSync("npm", ["run", "verify:names-master-no-new-tables"], { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
