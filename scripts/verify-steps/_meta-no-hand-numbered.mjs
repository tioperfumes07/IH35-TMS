#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const verifyPrecommitPath = path.resolve(__dirname, "..", "verify-pre-commit.mjs");
const source = fs.readFileSync(verifyPrecommitPath, "utf8");
const stringLiteralPattern = /(["'`])(?:\\.|(?!\1)[^\\])*\1/g;

let match;
while ((match = stringLiteralPattern.exec(source)) !== null) {
  const literal = match[0];
  if (/step\s+\d+\/\d+/.test(literal)) {
    console.error("verify-pre-commit must not contain hand-numbered step labels.");
    console.error(`Found forbidden literal in scripts/verify-pre-commit.mjs: ${literal}`);
    process.exit(1);
  }
}

console.log("verify-pre-commit glob loader guard passed");
