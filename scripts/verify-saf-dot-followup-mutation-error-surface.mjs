#!/usr/bin/env node
/**
 * verify-saf-dot-followup-mutation-error-surface
 * SAF-DOT-FOLLOWUP-MUTATION-SILENT-FAIL — DOT followUp + PDF upload must surface isError.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-dot-followup-mutation-error-surface";
const CHECKS = [
  {
    file: "apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx",
    needles: [
      "userFacingApiError",
      "followUpMutation.isError",
      "uploadMutation.isError",
      "dot-inspection-followup-error",
      "dot-inspection-upload-error",
    ],
  },
  {
    file: "apps/frontend/src/pages/safety/DotInspectionsPage.tsx",
    needles: ["userFacingApiError", "followUpMutation.isError", "dot-inspection-page-followup-error"],
  },
];

function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles.filter((n) => !src.includes(n)).map((n) => `${rel}: missing ${n}`);
}

function selftest() {
  const bad = `onClick={() => followUpMutation.mutate({})}`;
  const good = CHECKS[0].needles.join("\n");
  const tmp = path.join(process.cwd(), ".tmp-dot-followup-selftest.tsx");
  fs.writeFileSync(tmp, bad);
  try {
    if (assertFile(".tmp-dot-followup-selftest.tsx", ["followUpMutation.isError"]).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL bad`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  fs.writeFileSync(tmp, good);
  try {
    if (assertFile(".tmp-dot-followup-selftest.tsx", CHECKS[0].needles).length > 0) {
      console.error(`${LABEL} SELFTEST FAIL good`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  // BANK-F91248 leftover plant on DotInspectionsPage
  const pageRel = "apps/frontend/src/pages/safety/DotInspectionsPage.tsx";
  const abs = path.join(process.cwd(), pageRel);
  const original = fs.readFileSync(abs, "utf8");
  try {
    fs.writeFileSync(abs, `${original}\n<div className="text-[11px] text-[#8A92AB]">plant</div>\n`);
    const plantErrors = [];
    const pageSrc = fs.readFileSync(abs, "utf8");
    if (pageSrc.includes("text-[11px]")) plantErrors.push("leftover text-[11px]");
    if (pageSrc.includes("#8A92AB") || pageSrc.includes("#334155")) plantErrors.push("leftover off-scale muted");
    if (!plantErrors.includes("leftover text-[11px]") || !plantErrors.includes("leftover off-scale muted")) {
      console.error(`${LABEL} SELFTEST FAIL leftover plant escaped`, plantErrors);
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(abs, original);
  }
  console.log(`${LABEL} selftest PASS — leftover plant rejected`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = [];
for (const c of CHECKS) {
  if (!fs.existsSync(path.join(process.cwd(), c.file))) {
    errors.push(`missing ${c.file}`);
    continue;
  }
  errors.push(...assertFile(c.file, c.needles));
}
// BANK-F91248 leftover refuse — DotInspectionsPage only
{
  const pageRel = "apps/frontend/src/pages/safety/DotInspectionsPage.tsx";
  const pageSrc = fs.readFileSync(path.join(process.cwd(), pageRel), "utf8");
  if (pageSrc.includes("text-[11px]")) errors.push("leftover text-[11px]");
  if (pageSrc.includes("#8A92AB") || pageSrc.includes("#334155")) errors.push("leftover off-scale muted");
}
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — DOT followUp/upload mutations surface isError`);
