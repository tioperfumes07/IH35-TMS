#!/usr/bin/env node
// ENG-18: explicit commit intent, with hooks left enabled. No arbitrary Git flags
// are forwarded: the requested kind must agree with the command actually executed.
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
let kind, messageFile, allowEmpty = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--kind") kind = args[++i];
  else if (args[i] === "--message-file") messageFile = args[++i];
  else if (args[i] === "--allow-empty") allowEmpty = true;
  else throw new Error(`Unsupported option: ${args[i]}`);
}
if (!["new", "amend"].includes(kind) || !messageFile) {
  throw new Error("Usage: node scripts/commit-with-evidence.mjs --kind new|amend --message-file <file> [--allow-empty]");
}
const result = spawnSync("git", ["commit", kind === "amend" ? "--amend" : "--no-amend", "--file", messageFile, ...(allowEmpty ? ["--allow-empty"] : [])], {
  stdio: "inherit", env: { ...process.env, IH35_COMMIT_INTENT: kind },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
