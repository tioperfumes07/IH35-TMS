#!/usr/bin/env node
// Step 18805 proxy — delegates to the full guard
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync("node", [path.join(root, "scripts/verify-faro-gap-account-posts-correctly.mjs")], {
  stdio: "inherit",
});
