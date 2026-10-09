#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCoverageGuard } from "./lib/visual-coverage-count.mjs";

runCoverageGuard({
  label: "verify-page-row-click-coverage-count",
  pattern: /onRowClick/,
  floor: 79,
  root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  selftest: process.argv.includes("--selftest"),
});
