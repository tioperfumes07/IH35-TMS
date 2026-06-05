#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function run(command) {
  const result = spawnSync(command, {
    cwd: ROOT,
    shell: true,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    throw new Error(detail || `${command} failed`);
  }
  return (result.stdout ?? "").trim();
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function countHardcodedStrings(sourceText) {
  const jsxTextRegex = />\s*([^<>{}\n][^<>{}]*[A-Za-z][^<>{}]*)\s*</g;
  const attrTextRegex = /\b(?:title|aria-label|placeholder|label|alt)\s*=\s*"([^"]*[A-Za-z][^"]*)"/g;
  let count = 0;
  let match = null;

  while ((match = jsxTextRegex.exec(sourceText)) !== null) {
    const text = normalizeText(match[1] ?? "");
    if (text.length >= 2) count += 1;
  }
  while ((match = attrTextRegex.exec(sourceText)) !== null) {
    const text = normalizeText(match[1] ?? "");
    if (text.length >= 2) count += 1;
  }
  return count;
}

function isTrackedFrontendSource(filePath) {
  if (!filePath.startsWith("apps/frontend/src/")) return false;
  if (!/\.(tsx|jsx)$/.test(filePath)) return false;
  if (/(\.test\.|\.spec\.|\/__tests__\/)/.test(filePath)) return false;
  if (filePath.includes("/i18n/translations/")) return false;
  return true;
}

function getBaselineContent(baseRef, filePath) {
  const result = spawnSync(`git show ${baseRef}:${filePath}`, {
    cwd: ROOT,
    shell: true,
    encoding: "utf8",
  });
  if (result.status !== 0) return "";
  return result.stdout ?? "";
}

const baseRef = run("git merge-base HEAD origin/main");
const changedFiles = run(`git diff --name-only ${baseRef}..HEAD -- apps/frontend/src`)
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .filter(isTrackedFrontendSource);

if (changedFiles.length === 0) {
  console.log("verify-i18n-coverage: no changed frontend TSX/JSX files.");
  process.exit(0);
}

const regressions = [];
for (const relativePath of changedFiles) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) continue;
  const currentContent = fs.readFileSync(absolutePath, "utf8");
  const baselineContent = getBaselineContent(baseRef, relativePath);
  const currentCount = countHardcodedStrings(currentContent);
  const baselineCount = countHardcodedStrings(baselineContent);
  if (currentCount > baselineCount) {
    regressions.push({
      file: relativePath,
      baseline: baselineCount,
      current: currentCount,
      delta: currentCount - baselineCount,
    });
  }
}

if (regressions.length > 0) {
  console.error("verify-i18n-coverage: detected new hardcoded UI strings.");
  for (const row of regressions) {
    console.error(`- ${row.file}: ${row.baseline} -> ${row.current} (+${row.delta})`);
  }
  process.exit(1);
}

console.log(`verify-i18n-coverage: PASS across ${changedFiles.length} changed file(s).`);
