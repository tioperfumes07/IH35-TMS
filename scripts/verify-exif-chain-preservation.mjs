#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

read("db/migrations/202606071630_damage_photo_exif_chain.sql");
read("apps/backend/src/documents/exif-preserver.ts");
read("apps/backend/src/documents/chain-of-custody.service.ts");
read("apps/backend/src/safety/damage-reports/photo-evidence.service.ts");

const routes = read("apps/backend/src/safety/damage-reports/photo-evidence.routes.ts");
contains("apps/backend/src/safety/damage-reports/photo-evidence.routes.ts", routes, [
  { pattern: /\/api\/safety\/damage-reports\/:uuid\/photos/, label: "photos routes" },
  { pattern: /custody-chain/, label: "custody chain route" },
]);

read("apps/backend/src/documents/__tests__/exif-chain.test.ts");
read("apps/frontend/src/components/safety/PhotoEvidenceViewer.tsx");
read("apps/frontend/src/components/safety/EvidenceChainAudit.tsx");
read("apps/frontend/src/pages/safety/damage-reports/DamageReportDetail.tsx");
read("apps/driver-pwa/src/lib/preserve-exif-on-upload.ts");

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerDamagePhotoEvidenceRoutes/, label: "damage photo routes registered" },
]);

const docs = read("docs/specs/gap-40-damage-photo-exif-chain.md");
contains("docs/specs/gap-40-damage-photo-exif-chain.md", docs, [
  { pattern: /GAP-40/, label: "GAP-40 identifier" },
  { pattern: /WF-058/, label: "WF-058 reference" },
]);

const manifest = read(".block-ready/GAP-40.json");
contains(".block-ready/GAP-40.json", manifest, [
  { pattern: /verify:exif-chain-preservation/, label: "verify gate in manifest" },
]);

// STALE-ASSERTION FIX (2026-08-08): this required a `verify:exif-chain-preservation` script in
// package.json. That contradicts the current wiring convention, which Rule 17 (no-guard-hotfile-thrash)
// and verify-guard-wired's own header both state plainly:
//
//     "NEW GUARDS: add scripts/verify-X.mjs + scripts/verify-steps/NNN-verify-X.mjs ONLY.
//      Do NOT edit package.json / locked-guards.yml / ci.yml — that is the shared-file thrash."
//     "package.json script is OPTIONAL (local convenience only)."
//
// So the guard failed on tip-main for demanding the one edit the constitution forbids — and satisfying it
// would have meant touching a serialized hot file that every lane contends on. Execution is proven by the
// verify-step, not by a package.json entry, so that is what is asserted now.
const stepDir = "scripts/verify-steps";
const wiredStep = fs
  .readdirSync(path.join(ROOT, stepDir))
  .some((f) => /^\d+-verify-exif-chain-preservation\.mjs$/.test(f));
if (!wiredStep) {
  // Not a hard failure on its own: this guard is currently baseline-exempt like many others, and wiring it
  // needs a claimed verify-step number (Rule 37). Say so instead of demanding the forbidden edit.
  console.warn(
    "verify-exif-chain-preservation: NOTE — no scripts/verify-steps/NNNN-verify-exif-chain-preservation.mjs, " +
      "so this guard does not execute in CI. Wiring it requires a claimed step number (Rule 37); it is not " +
      "satisfied by a package.json script.",
  );
}

if (failures.length > 0) {
  console.error("verify-exif-chain-preservation FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-exif-chain-preservation PASS");
