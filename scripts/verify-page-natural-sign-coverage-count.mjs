#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCoverageGuard } from "./lib/visual-coverage-count.mjs";

runCoverageGuard({
  label: "verify-page-natural-sign-coverage-count",
  pattern: /naturalBalance|naturalCents|naturalSign/,
  floor: 1,
  root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  selftest: process.argv.includes("--selftest"),
});
