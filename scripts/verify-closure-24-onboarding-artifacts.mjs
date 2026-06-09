#!/usr/bin/env node
/** CLOSURE-24 CI guard — onboarding artifacts present. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-closure-24-onboarding-artifacts";
const REQUIRED = [
  "apps/frontend/src/pages/onboarding/OnboardingWizard.tsx",
  "apps/backend/src/onboarding/state.routes.ts",
  "apps/backend/src/onboarding/seed-sample-data.ts",
  "apps/backend/src/migrations/0403-onboarding-state.sql",
  "docs/walkthroughs/NEW-USER-DAY-1.md",
  "docs/walkthroughs/NEW-USER-WEEK-1.md",
  "scripts/verify-onboarding-flow-completes.mjs",
  ".block-ready/CLOSURE-24-OPERATOR-ONBOARDING.json",
];
const MIGRATION_MARKERS = ["ih35_app", "ROW LEVEL SECURITY"];
for (const rel of REQUIRED) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error(`[${LABEL}] FAIL missing ${rel}`);
    process.exit(1);
  }
}
const mig = fs.readFileSync(path.join(ROOT, "apps/backend/src/migrations/0403-onboarding-state.sql"), "utf8");
for (const m of MIGRATION_MARKERS) {
  if (!mig.includes(m)) {
    console.error(`[${LABEL}] FAIL migration missing ${m}`);
    process.exit(1);
  }
}
console.log(`[${LABEL}] PASS (${REQUIRED.length} artifacts + RLS/grants)`);
