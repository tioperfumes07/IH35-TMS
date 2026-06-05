#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const REQUIRED = [
  {
    file: "apps/frontend/src/components/factoring/DeactivateFactorConfirmModal.tsx",
    markers: ["DEACTIVATE", "data-deactivate-factor-confirm-modal"],
  },
  {
    file: "apps/frontend/src/pages/factoring/FactoringHome.tsx",
    markers: ["DeactivateFactorConfirmModal", "data-deactivate-factor-confirm-modal"],
  },
];

const failures = [];

for (const req of REQUIRED) {
  const full = path.join(repoRoot, req.file);
  if (!fs.existsSync(full)) {
    failures.push(`${req.file} (missing)`);
    continue;
  }
  const source = fs.readFileSync(full, "utf8");
  for (const marker of req.markers) {
    if (!source.includes(marker)) failures.push(`${req.file} (missing marker: ${marker})`);
  }
}

const home = fs.readFileSync(path.join(repoRoot, "apps/frontend/src/pages/factoring/FactoringHome.tsx"), "utf8");
if (/variant=\"danger\"[\s\S]{0,400}Deactivate active factor/.test(home) && !home.includes("DeactivateFactorConfirmModal")) {
  failures.push("FactoringHome.tsx (destructive deactivate must use DeactivateFactorConfirmModal wrapper)");
}

if (failures.length > 0) {
  console.error("[verify-factoring-destructive-actions-have-confirm] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log("[verify-factoring-destructive-actions-have-confirm] OK — factoring deactivate uses 2-step confirm modal");
