#!/usr/bin/env node
/**
 * Banking DoD — reconciliation may close normally only at exactly $0.00.
 * Any non-zero difference requires the existing Owner-only, reasoned override.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendPath = "apps/backend/src/banking/reconciliation.routes.ts";
const frontendPath = "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx";

function read(rootDir, relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

export function run(rootDir = root) {
  const failures = [];
  const backend = read(rootDir, backendPath);
  const frontend = read(rootDir, frontendPath);

  if (!backend.includes("if (varianceCents !== 0 && !body.data.force_complete)")) {
    failures.push("reconciliation completion must reject every non-zero variance without an explicit override");
  }
  if (backend.includes("Math.abs(varianceCents) > 1000")) {
    failures.push("reconciliation completion must not retain an under-$10 tolerance");
  }
  if (!backend.includes('error: "reconciliation_difference_not_zero"')) {
    failures.push("reconciliation completion must return the truthful non-zero difference error");
  }
  if (!frontend.includes("const needsForceComplete = summary.varianceCents !== 0;")) {
    failures.push("reconciliation UI must require an override for every non-zero difference");
  }
  if (frontend.includes("absVariance >= 1000")) {
    failures.push("reconciliation UI must not hide under-$10 differences from the override gate");
  }
  if (!frontend.includes('placeholder="Force-complete reason (Owner only)"')) {
    failures.push("reconciliation UI must retain the accountable Owner reason field");
  }

  return failures;
}

function write(rootDir, relativePath, contents) {
  const target = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

if (process.argv.includes("--selftest")) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-banking-recon-zero-variance-"));
  try {
    const backend = read(root, backendPath);
    const frontend = read(root, frontendPath);
    write(temp, backendPath, backend);
    write(temp, frontendPath, frontend);

    const correctedFailures = run(temp);
    if (correctedFailures.length > 0) throw new Error(`corrected source failed: ${correctedFailures.join("; ")}`);

    write(temp, backendPath, backend.replace("if (varianceCents !== 0 && !body.data.force_complete)", "if (Math.abs(varianceCents) > 1000 && !body.data.force_complete)"));
    write(temp, frontendPath, frontend.replace("const needsForceComplete = summary.varianceCents !== 0;", "const needsForceComplete = absVariance >= 1000;"));

    const mutationFailures = run(temp);
    if (mutationFailures.length === 0) throw new Error("mutated tolerance regression was not detected");
    console.log("verify-banking-recon-zero-variance --selftest OK");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
} else {
  const failures = run();
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-recon-zero-variance OK");
}
