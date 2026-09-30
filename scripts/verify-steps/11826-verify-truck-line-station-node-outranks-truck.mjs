#!/usr/bin/env node
// verify-step 11826 -- wrapper. See scripts/verify-truck-line-station-node-outranks-truck.mjs.
// Closes the owner-live 2026-09-30 defect where the truck graphic (z-index 5) painted over the
// 17px station dot, so T170 -- correctly parked at Dispatched on a 15h44m-stale ping -- read as
// "the green circle is not on".
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync("node", [path.join(ROOT, "scripts/verify-truck-line-station-node-outranks-truck.mjs")], { stdio: "inherit" });
