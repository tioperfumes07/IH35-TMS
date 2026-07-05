#!/usr/bin/env node
// Guard: the Program Board service MUST resolve repo files via resolveMonorepoRoot (cwd-independent),
// not rely solely on process.cwd(). In the Render runtime cwd is NOT the repo root, and a cwd-only read
// silently left every extra track (Owner-Batch / Dispatch-Kit / Audit) empty in prod. This guard keeps
// the fix from regressing.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_PROGRAM_BOARD_ROOT ?? process.cwd();
const file = path.resolve(ROOT, "apps/backend/src/program/program-board.service.ts");
const failures = [];

let src = "";
try {
  src = fs.readFileSync(file, "utf8");
} catch {
  failures.push("program-board.service.ts not found");
}

if (src) {
  if (!src.includes("resolveMonorepoRoot"))
    failures.push("service no longer imports/uses resolveMonorepoRoot (cwd is not the repo root in prod)");
  // The resolved root must actually be consulted inside the JSON reader.
  if (!/REPO_ROOT\s*\?\s*\[path\.join\(REPO_ROOT/.test(src.replace(/\s+/g, " ")))
    failures.push("readRepoJson does not try the resolved REPO_ROOT before cwd fallbacks");
}

if (failures.length > 0) {
  console.error("verify:program-board-repo-root FAILED");
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("verify:program-board-repo-root OK — board reads repo JSON via resolveMonorepoRoot (cwd-independent).");
