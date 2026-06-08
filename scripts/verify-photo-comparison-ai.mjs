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

const migrationPath = "db/migrations/202606071830_pre_post_trip_photo_sessions.sql";
const migration = read(migrationPath);
contains(migrationPath, migration, [
  { pattern: /safety\.photo_comparison_sessions/, label: "photo_comparison_sessions table" },
  { pattern: /diff_status/, label: "diff_status column" },
  { pattern: /ENABLE ROW LEVEL SECURITY/, label: "RLS enabled" },
  { pattern: /TO ih35_app/, label: "ih35_app grants" },
]);

read("apps/backend/src/safety/photo-comparison/session.service.ts");
read("apps/backend/src/safety/photo-comparison/diff-engine.service.ts");

const anthropic = read("apps/backend/src/safety/photo-comparison/anthropic-client.ts");
contains("apps/backend/src/safety/photo-comparison/anthropic-client.ts", anthropic, [
  { pattern: /ANTHROPIC_API_KEY/, label: "ANTHROPIC_API_KEY env" },
  { pattern: /compareImages/, label: "compareImages export" },
  { pattern: /insurance damage assessor/, label: "assessor prompt" },
]);

const routes = read("apps/backend/src/safety/photo-comparison/routes.ts");
contains("apps/backend/src/safety/photo-comparison/routes.ts", routes, [
  { pattern: /\/api\/safety\/photo-comparison\/pre-trip/, label: "pre-trip route" },
  { pattern: /\/api\/safety\/photo-comparison\/:session_uuid\/post-trip/, label: "post-trip route" },
  { pattern: /\/api\/safety\/photo-comparison\/:session_uuid/, label: "session detail route" },
  { pattern: /\/api\/safety\/photo-comparison\/sessions/, label: "sessions list route" },
  { pattern: /manual-override/, label: "manual override route" },
  { pattern: /registerPhotoComparisonRoutes/, label: "route register export" },
]);

read("apps/backend/src/safety/photo-comparison/__tests__/diff-engine.test.ts");
read("apps/backend/src/safety/photo-comparison/__tests__/anthropic-client.test.ts");

read("apps/driver-pwa/src/screens/PreTripPhotoCapture.tsx");
read("apps/driver-pwa/src/screens/PostTripPhotoCapture.tsx");
read("apps/driver-pwa/src/components/photo/AngleGuide.tsx");
read("apps/driver-pwa/src/lib/preserve-exif-on-upload.ts");

read("apps/frontend/src/pages/safety/photo-comparison/SessionDetail.tsx");
const sessionDetail = read("apps/frontend/src/pages/safety/photo-comparison/SessionDetail.tsx");
contains("apps/frontend/src/pages/safety/photo-comparison/SessionDetail.tsx", sessionDetail, [
  { pattern: /PhotoDiffViewer/, label: "PhotoDiffViewer wired" },
  { pattern: /DiffFindingsList/, label: "DiffFindingsList wired" },
]);

read("apps/frontend/src/components/safety/PhotoDiffViewer.tsx");
read("apps/frontend/src/components/safety/DiffFindingsList.tsx");

const sessionService = read("apps/backend/src/safety/photo-comparison/session.service.ts");
contains("apps/backend/src/safety/photo-comparison/session.service.ts", sessionService, [
  { pattern: /chain-of-custody/, label: "GAP-40 chain-of-custody import" },
  { pattern: /validateAndPreserveExif/, label: "GAP-40 EXIF preserver" },
]);

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerPhotoComparisonRoutes/, label: "photo comparison routes registered" },
]);

const docs = read("docs/specs/gap-50-ai-photo-comparison.md");
contains("docs/specs/gap-50-ai-photo-comparison.md", docs, [
  { pattern: /GAP-50/, label: "GAP-50 identifier" },
  { pattern: /GAP-40/, label: "GAP-40 EXIF reference" },
  { pattern: /GAP-38/, label: "GAP-38 continuity reference" },
  { pattern: /claude-sonnet-4-20250514/, label: "Anthropic vision model" },
]);

const manifest = read(".block-ready/GAP-50.json");
contains(".block-ready/GAP-50.json", manifest, [
  { pattern: /verify:photo-comparison-ai/, label: "verify gate in manifest" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:photo-comparison-ai/, label: "verify script in package.json" },
]);

if (failures.length > 0) {
  console.error("verify-photo-comparison-ai FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-photo-comparison-ai PASS");
