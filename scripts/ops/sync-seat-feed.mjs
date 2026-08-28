#!/usr/bin/env node
/**
 * Copy docs/bus/FEED/NOW-*.md → ~/Desktop/IH35-SEAT-FEED/
 * so idle chats that never git-pull still have a current one-pager.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const srcDir = path.join(repoRoot, "docs/bus/FEED");
const destDir = path.join(os.homedir(), "Desktop/IH35-SEAT-FEED");

fs.mkdirSync(destDir, { recursive: true });
const files = fs.readdirSync(srcDir).filter((f) => f.startsWith("NOW-") && f.endsWith(".md"));
if (files.length === 0) {
  console.error("sync-seat-feed: no NOW-*.md in docs/bus/FEED");
  process.exit(1);
}
for (const f of files) {
  const from = path.join(srcDir, f);
  const to = path.join(destDir, f);
  fs.copyFileSync(from, to);
  console.log(`wrote ${to}`);
}
console.log(`sync-seat-feed: ${files.length} files → ${destDir}`);
