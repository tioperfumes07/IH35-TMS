#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN_TOUCH_PATTERNS = [
  "catalogs.maintenance_parts",
  "catalogs.parts",
  "maintenance.parts_inventory",
  "maint.part",
];

function fail(message) {
  console.error(`verify:oem-parts-no-touch-existing-parts-surfaces FAIL: ${message}`);
  process.exit(1);
}

const diff = spawnSync("git", ["diff", "origin/main..HEAD", "--name-only"], {
  cwd: ROOT,
  encoding: "utf8",
});

if (diff.status !== 0) {
  fail(diff.stderr || diff.stdout || "git diff failed");
}

const changedFiles = diff.stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

if (changedFiles.length === 0) {
  console.log("verify:oem-parts-no-touch-existing-parts-surfaces PASS (no diff vs origin/main)");
  process.exit(0);
}

const patch = spawnSync("git", ["diff", "origin/main..HEAD"], {
  cwd: ROOT,
  encoding: "utf8",
});

if (patch.status !== 0) {
  fail(patch.stderr || patch.stdout || "git diff patch failed");
}

const patchText = patch.stdout;

for (const pattern of FORBIDDEN_TOUCH_PATTERNS) {
  const touched = changedFiles.filter((file) => file.includes(pattern.replace(/\./g, "/")) || file.includes(pattern));
  if (touched.length > 0) {
    fail(`forbidden file touched for ${pattern}: ${touched.join(", ")}`);
  }

  const addedLines = patchText
    .split(/\r?\n/)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .filter((line) => line.includes(pattern));

  const removedLines = patchText
    .split(/\r?\n/)
    .filter((line) => line.startsWith("-") && !line.startsWith("---"))
    .filter((line) => line.includes(pattern));

  if (removedLines.length > 0) {
    fail(`diff removes or modifies forbidden surface ${pattern}`);
  }

  const modifyingAdds = addedLines.filter((line) => !line.includes("verify-oem-parts-no-touch-existing-parts-surfaces"));
  if (modifyingAdds.length > 0) {
    const guardOnly = modifyingAdds.every(
      (line) =>
        line.includes("does NOT replace") ||
        line.includes("does NOT touch") ||
        line.includes("company inventory") ||
        line.includes("complements existing") ||
        line.includes("untouched") ||
        line.includes("ARCHITECTURAL_DESIGN")
    );
    if (!guardOnly) {
      fail(`diff adds references that may modify forbidden surface ${pattern}`);
    }
  }
}

console.log("verify:oem-parts-no-touch-existing-parts-surfaces PASS");
