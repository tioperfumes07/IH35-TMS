#!/usr/bin/env node
/** LST-F151 — CreateTaskModal profile/assignee use Combobox (profile has + Add new; not bare <select>). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-create-task-modal-pickers";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/frontend/src/components/tasks/CreateTaskModal.tsx";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function assertSrc(src) {
  const code = stripComments(src);
  const problems = [];
  if (!/data-testid="create-task-profile-picker"/.test(code)) problems.push("missing profile picker testid");
  if (!/data-testid="create-task-assignee-picker"/.test(code)) problems.push("missing assignee picker testid");
  if (!/allowAddNew=\{\{[\s\S]*label:\s*"\+ Add new profile"/.test(code)) {
    problems.push("profile picker missing + Add new profile");
  }
  if (!/userFacingApiError\(/.test(code)) problems.push("missing userFacingApiError on create error");
  const profileBlock = code.match(/data-testid="create-task-profile-picker"[\s\S]{0,900}?Assignee/)?.[0];
  if (profileBlock && /<select[\s>]/.test(profileBlock)) problems.push("profile still bare <select>");
  const assigneeBlock = code.match(/data-testid="create-task-assignee-picker"[\s\S]{0,600}?Scheduled date/)?.[0];
  if (assigneeBlock && /<select[\s>]/.test(assigneeBlock)) problems.push("assignee still bare <select>");
  // BANK-F91306 leftover refuse — CreateTaskModal.tsx page-scoped text token ratchet
  if (src.includes("text-[11px]")) problems.push("leftover text-[11px]");
  if (src.includes("#8A92AB") || src.includes("#334155")) problems.push("leftover off-scale muted");
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const planted = stripComments(read()).replace(/allowAddNew=\{\{[\s\S]*?\}\}/, "").replace(
    /data-testid="create-task-assignee-picker"[\s\S]*?<\/div>\s*<\/div>/,
    'data-testid="create-task-assignee-picker"><select id="create-task-assignee"></select></div></div>',
  );
  if (!assertSrc(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const live = assertSrc(read());
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  // BANK-F91306 leftover plant — CreateTaskModal page-scoped text token ratchet
  const filePath = path.join(ROOT, FILE);
  const realGood = fs.readFileSync(filePath, "utf8");
  const leftoverPlant = realGood + '\n<div className="text-[11px] text-[#8A92AB]">plant</div>\n';
  fs.writeFileSync(filePath, leftoverPlant);
  const leftoverProblems = assertSrc(leftoverPlant);
  fs.writeFileSync(filePath, realGood);
  if (!leftoverProblems.length) {
    console.error(`${LABEL} SELFTEST FAILED: leftover plant escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertSrc(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
