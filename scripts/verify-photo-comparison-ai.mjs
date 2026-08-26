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
const diffEngine = read("apps/backend/src/safety/photo-comparison/diff-engine.service.ts");

function failClosedProblems(source) {
  const problems = [];
  if (!/if \(pairs\.length === 0\) \{\s*throw new Error\("photo_evidence_pairs_missing"\)/.test(source)) problems.push("zero matched evidence pairs can be certified clean");
  if (!/pairs\.length !== prePhotos\.length \|\| pairs\.length !== postPhotos\.length[\s\S]{0,100}photo_evidence_pairs_incomplete/.test(source)) problems.push("unmatched pre/post evidence can be silently omitted");
  if (!/if \(!pair\.pre\.download_url \|\| !pair\.post\.download_url\) \{\s*throw new Error\(`photo_evidence_download_unavailable:\$\{pair\.angle\}`\)/.test(source)) problems.push("unavailable signed evidence can be converted to no-damage");
  return problems;
}

for (const problem of failClosedProblems(diffEngine)) fail(`apps/backend/src/safety/photo-comparison/diff-engine.service.ts: ${problem}`);

const anthropic = read("apps/backend/src/safety/photo-comparison/anthropic-client.ts");
contains("apps/backend/src/safety/photo-comparison/anthropic-client.ts", anthropic, [
  { pattern: /callAnthropicMessages/, label: "shared Anthropic credential/HTTP path" },
  { pattern: /apiKey: options\?\.apiKey/, label: "optional injected API key forwarding" },
  { pattern: /compareImages/, label: "compareImages export" },
  { pattern: /insurance damage assessor/, label: "assessor prompt" },
]);
if (/CircuitBreakerOpenError[\s\S]*has_new_damage:\s*false/.test(anthropic)) {
  fail("apps/backend/src/safety/photo-comparison/anthropic-client.ts: circuit-open state is fabricated as no damage");
}

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

// CLASS FIX (2026-08-08) — a guard must not fail for the absence of the one edit the constitution forbids.
//
// This block required a `verify:photo-comparison-ai` entry in package.json. Rule 17 (no-guard-hotfile-thrash) and
// verify-guard-wired's own header both say the opposite, verbatim:
//
//     "NEW GUARDS: add scripts/verify-X.mjs + scripts/verify-steps/NNN-verify-X.mjs ONLY.
//      Do NOT edit package.json / locked-guards.yml / ci.yml — that is the shared-file thrash."
//     "package.json script is OPTIONAL (local convenience only)."
//
// So these guards were red for missing the single edit they are forbidden to make, and "fixing" them
// literally meant touching a serialized hot file every lane contends on. Execution is proven by the
// verify-step, so that is what is reported — as a NOTE, because wiring needs a claimed number (Rule 37).
const wiredStep__photo_comparison_ai = fs
  .readdirSync(path.join(ROOT, "scripts/verify-steps"))
  .some((f) => /^\d+-verify-photo-comparison-ai\.mjs$/.test(f));
if (!wiredStep__photo_comparison_ai) {
  console.warn(
    "verify-photo-comparison-ai: NOTE — no scripts/verify-steps/NNNN-verify-photo-comparison-ai.mjs, so this guard does not execute " +
      "in CI. Wiring it requires a claimed step number (Rule 37); a package.json script does not wire it.",
  );
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    diffEngine.replace('throw new Error("photo_evidence_pairs_missing");', "return { diff_status: 'clean' } as never;"),
    diffEngine.replace('throw new Error("photo_evidence_pairs_incomplete");', "// planted: unmatched evidence ignored"),
    diffEngine.replace('throw new Error(`photo_evidence_download_unavailable:${pair.angle}`);', "continue;"),
  ];
  for (const [index, candidate] of mutations.entries()) {
    if (candidate === diffEngine || failClosedProblems(candidate).length === 0) {
      console.error(`verify-photo-comparison-ai SELFTEST FAILED — mutation ${index + 1} escaped`);
      process.exit(1);
    }
  }
  const clientMutation = `${anthropic}\n// CircuitBreakerOpenError planted fallback\nconst plantedFallback = { has_new_damage: false, findings: [] };`;
  if (!/CircuitBreakerOpenError[\s\S]*has_new_damage:\s*false/.test(clientMutation)) {
    console.error("verify-photo-comparison-ai SELFTEST FAILED — circuit-open fallback mutation escaped");
    process.exit(1);
  }
  console.log("verify-photo-comparison-ai SELFTEST PASS — 4/4 false-clean mutations rejected");
  process.exit(0);
}

if (failures.length > 0) {
  console.error("verify-photo-comparison-ai FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-photo-comparison-ai PASS");
