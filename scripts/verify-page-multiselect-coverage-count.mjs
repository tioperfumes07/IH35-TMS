#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCoverageGuard } from "./lib/visual-coverage-count.mjs";

runCoverageGuard({
  label: "verify-page-multiselect-coverage-count",
  pattern: /MultiSelectDropdown|multiSelect/,
  floor: 35,
  root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  selftest: process.argv.includes("--selftest"),
});
