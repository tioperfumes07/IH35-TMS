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

function main() {
  const failures = [];
  const meetingsPage = read(paths.meetingsPage);
  const programsPage = read(paths.programsPage);
  const recordsPage = read(paths.recordsPage);
  const orphanPrograms = read(paths.orphanPrograms);
  const tabsConfig = read(paths.tabsConfig);
  const manifest = read(paths.manifest);
  const meetingsTab = read(paths.meetingsTab);
  const programsTab = read(paths.programsTab);
  const recordsTab = read(paths.recordsTab);

  if (!meetingsPage.includes("export function SafetyMeetingsPage")) {
    failures.push("SafetyMeetingsPage.tsx missing canonical export");
  }
  if (!meetingsPage.includes('data-testid="safety-meetings-page"')) {
    failures.push("SafetyMeetingsPage.tsx missing safety-meetings-page test id");
  }
  if (!meetingsPage.includes("+ Create Meeting")) {
    failures.push("SafetyMeetingsPage.tsx must use + Create Meeting vocabulary");
  }

  if (!programsPage.includes("export function TrainingProgramsPage")) {
    failures.push("TrainingProgramsPage.tsx missing canonical export");
  }
  if (!programsPage.includes('data-testid="training-programs-page"')) {
    failures.push("TrainingProgramsPage.tsx missing training-programs-page test id");
  }
  if (!programsPage.includes("+ Create Training Program")) {
    failures.push("TrainingProgramsPage.tsx must use + Create Training Program vocabulary");
  }

  if (!recordsPage.includes("export function TrainingRecordsPage")) {
    failures.push("TrainingRecordsPage.tsx missing canonical export");
  }
  if (!recordsPage.includes('data-testid="training-records-page"')) {
    failures.push("TrainingRecordsPage.tsx missing training-records-page test id");
  }

  if (!orphanPrograms.includes("ARCHIVE (A23-5)")) {
    failures.push("orphan training/TrainingProgramsPage.tsx must carry ARCHIVE (A23-5) header");
  }
  if (!orphanPrograms.includes("../TrainingProgramsPage")) {
    failures.push("orphan training/TrainingProgramsPage.tsx must re-export canonical page");
  }

  if (!tabsConfig.includes('id: "safety-meetings"') || !tabsConfig.includes('status: "Live"')) {
    failures.push("SAFETY_TABS_CONFIG safety-meetings tab must be Live");
  }

  if (!manifest.includes('path="safety-meetings"') || !manifest.includes("<SafetyMeetingsTab")) {
    failures.push("manifest must route safety-meetings to SafetyMeetingsTab");
  }
  if (!manifest.includes('path="/safety/training/programs"') || !manifest.includes("<TrainingProgramsTab")) {
    failures.push("manifest must route /safety/training/programs to TrainingProgramsTab");
  }
  if (!manifest.includes('path="/safety/training/records"') || !manifest.includes("<TrainingRecordsTab")) {
    failures.push("manifest must route /safety/training/records to TrainingRecordsTab");
  }

  if (!meetingsTab.includes("SafetyMeetingsPage")) {
    failures.push("SafetyMeetingsTab must render SafetyMeetingsPage");
  }
  if (!programsTab.includes("TrainingProgramsPage")) {
    failures.push("TrainingProgramsTab must render TrainingProgramsPage");
  }
  if (!recordsTab.includes("TrainingRecordsPage")) {
    failures.push("TrainingRecordsTab must render TrainingRecordsPage");
  }

  if (failures.length > 0) {
    console.error("verify:safety-meetings-training-wire FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:safety-meetings-training-wire OK");
}

main();
