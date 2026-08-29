#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_SAFETY_MEETINGS_TRAINING_ROOT ?? process.cwd();

const paths = {
  meetingsPage: path.join(ROOT, "apps/frontend/src/pages/safety/SafetyMeetingsPage.tsx"),
  programsPage: path.join(ROOT, "apps/frontend/src/pages/safety/TrainingProgramsPage.tsx"),
  recordsPage: path.join(ROOT, "apps/frontend/src/pages/safety/TrainingRecordsPage.tsx"),
  orphanPrograms: path.join(ROOT, "apps/frontend/src/pages/safety/training/TrainingProgramsPage.tsx"),
  tabsConfig: path.join(ROOT, "apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  meetingsTab: path.join(ROOT, "apps/frontend/src/pages/safety/tabs/SafetyMeetingsTab.tsx"),
  programsTab: path.join(ROOT, "apps/frontend/src/pages/safety/tabs/TrainingProgramsTab.tsx"),
  recordsTab: path.join(ROOT, "apps/frontend/src/pages/safety/tabs/TrainingRecordsTab.tsx"),
};

function read(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function loadSources() {
  const src = {};
  for (const [key, filePath] of Object.entries(paths)) src[key] = read(filePath);
  return src;
}

/**
 * RE-ANCHOR (found stale 2026-08-29, verify-selftests-can-fail.mjs meta-guard): this file's
 * --selftest used to test two hardcoded fixture strings against a regex inline, never calling this
 * assertion or reading any real repo file -- it proved the regex could compile, nothing about
 * whether the real guard logic still runs against real source. Extracted the normal-mode checks
 * into this exported function (taking a sources object, same shape loadSources() returns) so
 * --selftest can now mutate REAL file content and prove the real assertion catches a real planted
 * regression.
 */
export function assertWiring(src) {
  const failures = [];

  if (!src.meetingsPage.includes("export function SafetyMeetingsPage")) {
    failures.push("SafetyMeetingsPage.tsx missing canonical export");
  }
  if (!src.meetingsPage.includes('data-testid="safety-meetings-page"')) {
    failures.push("SafetyMeetingsPage.tsx missing safety-meetings-page test id");
  }
  if (!src.meetingsPage.includes("+ Create Meeting")) {
    failures.push("SafetyMeetingsPage.tsx must use + Create Meeting vocabulary");
  }

  if (!src.programsPage.includes("export function TrainingProgramsPage")) {
    failures.push("TrainingProgramsPage.tsx missing canonical export");
  }
  if (!src.programsPage.includes('data-testid="training-programs-page"')) {
    failures.push("TrainingProgramsPage.tsx missing training-programs-page test id");
  }
  if (!src.programsPage.includes("+ Create Training Program")) {
    failures.push("TrainingProgramsPage.tsx must use + Create Training Program vocabulary");
  }

  if (!src.recordsPage.includes("export function TrainingRecordsPage")) {
    failures.push("TrainingRecordsPage.tsx missing canonical export");
  }
  if (!src.recordsPage.includes('data-testid="training-records-page"')) {
    failures.push("TrainingRecordsPage.tsx missing training-records-page test id");
  }
  if (!/recordsQuery\.isError[\s\S]*?<ListErrorBanner[\s\S]*?recordsQuery\.refetch\(\)/.test(src.recordsPage)) {
    failures.push("TrainingRecordsPage.tsx must render retryable ListErrorBanner before empty copy");
  }

  if (!src.orphanPrograms.includes("ARCHIVE (A23-5)")) {
    failures.push("orphan training/TrainingProgramsPage.tsx must carry ARCHIVE (A23-5) header");
  }
  if (!src.orphanPrograms.includes("../TrainingProgramsPage")) {
    failures.push("orphan training/TrainingProgramsPage.tsx must re-export canonical page");
  }

  if (!src.tabsConfig.includes('id: "safety-meetings"') || !src.tabsConfig.includes('status: "Live"')) {
    failures.push("SAFETY_TABS_CONFIG safety-meetings tab must be Live");
  }

  if (!src.manifest.includes('path="safety-meetings"') || !src.manifest.includes("<SafetyMeetingsTab")) {
    failures.push("manifest must route safety-meetings to SafetyMeetingsTab");
  }
  if (!src.manifest.includes('path="training/programs"') || !src.manifest.includes("<TrainingProgramsTab")) {
    failures.push("manifest must route training/programs to TrainingProgramsTab under /safety");
  }
  if (!src.manifest.includes('path="training/records"') || !src.manifest.includes("<TrainingRecordsTab")) {
    failures.push("manifest must route training/records to TrainingRecordsTab under /safety");
  }
  if (!/path="training"[\s\S]{0,80}Navigate to="\/safety\/training\/programs"/.test(src.manifest)) {
    failures.push(
      "manifest must Navigate /safety/training (parent, no leaf) to /safety/training/programs — not the app catch-all /home",
    );
  }

  if (!src.meetingsTab.includes("SafetyMeetingsPage")) {
    failures.push("SafetyMeetingsTab must render SafetyMeetingsPage");
  }
  if (!src.programsTab.includes("TrainingProgramsPage")) {
    failures.push("TrainingProgramsTab must render TrainingProgramsPage");
  }
  if (!src.recordsTab.includes("TrainingRecordsPage")) {
    failures.push("TrainingRecordsTab must render TrainingRecordsPage");
  }

  return failures;
}

function selftest() {
  const real = loadSources();
  const baseline = assertWiring(real);
  if (baseline.length) {
    console.error("verify:safety-meetings-training-wire --selftest FAIL: real repo state already red:");
    for (const f of baseline) console.error(` - ${f}`);
    process.exit(1);
  }

  // Plant the exact real regression this file's stale fixture only pretended to test: drop the
  // /safety/training (parent, no leaf) Navigate redirect, which used to send an operator to the
  // app catch-all /home instead of the canonical /safety/training/programs.
  const navigateRe = /<Route\s+path="training"\s+element=\{<Navigate to="\/safety\/training\/programs"[^/]*\/>\}\s*\/>/;
  const mutatedManifest = real.manifest.replace(navigateRe, "");
  if (mutatedManifest === real.manifest) {
    console.error("verify:safety-meetings-training-wire --selftest FAIL: Navigate anchor not found in manifest.tsx — re-anchor");
    process.exit(1);
  }
  const mutatedFailures = assertWiring({ ...real, manifest: mutatedManifest });
  if (!mutatedFailures.some((f) => f.includes("Navigate /safety/training"))) {
    console.error("verify:safety-meetings-training-wire --selftest FAIL: planted missing /safety/training Navigate was NOT caught");
    process.exit(1);
  }

  // Second mutation: drop the canonical export, proving the assertion isn't only sensitive to the
  // one line above.
  const mutatedMeetingsPage = real.meetingsPage.replace("export function SafetyMeetingsPage", "function SafetyMeetingsPage");
  if (mutatedMeetingsPage === real.meetingsPage) {
    console.error("verify:safety-meetings-training-wire --selftest FAIL: canonical export anchor not found — re-anchor");
    process.exit(1);
  }
  const exportFailures = assertWiring({ ...real, meetingsPage: mutatedMeetingsPage });
  if (!exportFailures.some((f) => f.includes("missing canonical export"))) {
    console.error("verify:safety-meetings-training-wire --selftest FAIL: planted missing canonical export was NOT caught");
    process.exit(1);
  }

  console.log("verify:safety-meetings-training-wire --selftest OK — 2 planted regressions caught against real source, baseline clean");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = assertWiring(loadSources());
  if (failures.length > 0) {
    console.error("verify:safety-meetings-training-wire FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }
  console.log("verify:safety-meetings-training-wire OK");
}

main();
