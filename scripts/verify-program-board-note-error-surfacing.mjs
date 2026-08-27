#!/usr/bin/env node
// PROGRAM-BOARD-NOTE-RAW-VALIDATION-ERROR-TOAST — guard
//
// ProgramBoardPage.tsx's note-save mutation onError read a dead `.payload.message` property (ApiError
// has `.data`, never `.payload` — grepped the whole api client, no such property exists anywhere) and
// fell back to the bare ApiError.message, which for a zod 400 from POST /api/v1/program/board/notes
// (program-board.routes.ts's `{ error: "validation_error", details: parsed.error.flatten() }` body,
// no top-level `message` key) is the raw literal string "validation_error" — an unhelpful toast for,
// e.g., a note body over the 10,000-char server limit. The same file already imports and correctly
// uses userFacingApiError() (which reads details.fieldErrors) for the query's own error banner a few
// hundred lines below — this guard just requires the mutation's onError to use the same helper.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PAGE_FILE = "apps/frontend/src/pages/program/ProgramBoardPage.tsx";

export function check(text) {
  const failures = [];
  const idx = text.indexOf("mutationFn: postProgramBoardNote");
  const block = idx >= 0 ? text.slice(idx, idx + 400) : "";
  if (!/onError:\s*\(e:\s*unknown\)\s*=>\s*\{\s*pushToast\(userFacingApiError\(e,\s*"Save failed"\),\s*"error"\);/.test(block)) {
    failures.push(`${PAGE_FILE} note-save mutation onError no longer surfaces the real API error via userFacingApiError`);
  }
  if (/payload\?\.message/.test(block)) {
    failures.push(`${PAGE_FILE} note-save mutation onError still references the dead ApiError.payload property`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, PAGE_FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: program-board-note-error-surfacing");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: Program Board note-save error surfacing uses userFacingApiError, no dead .payload lookup");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, PAGE_FILE), "utf8");
  const offender = text.replace(
    'onError: (e: unknown) => {\n      pushToast(userFacingApiError(e, "Save failed"), "error");\n    },',
    'onError: (e: unknown) => {\n      const msg = String((e as { payload?: { message?: string } })?.payload?.message ?? (e as Error)?.message ?? "Save failed");\n      pushToast(msg, "error");\n    },'
  );
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (reverted to dead .payload lookup) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): 1/1 planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
