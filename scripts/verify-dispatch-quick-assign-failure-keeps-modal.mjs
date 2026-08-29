#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const boardPath = path.join(root, "apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
const modalPath = path.join(root, "apps/frontend/src/pages/dispatch/components/QuickAssignModal.tsx");

function verify(board, modal) {
  const failures = [];
  const quickAssignRegion = board.slice(board.indexOf("<QuickAssignModal"));
  const catchBlock = quickAssignRegion.match(/catch \(error\) \{[\s\S]{0,700}?\n\s*\}/)?.[0] ?? "";
  const submitRegion = modal.slice(modal.indexOf("onSubmit={async"));
  if (!catchBlock.includes('userFacingApiError(error, "Quick assign failed")')) {
    failures.push("quick-assign failure must remain operator-visible");
  }
  if (!catchBlock.includes("throw error;")) {
    failures.push("DispatchBoard must reject on quick-assign failure instead of resolving success");
  }
  const awaitedSubmit = submitRegion.search(/await\s+(?:onSubmit\s*\(\s*\{|submittedOnSubmit\s*\(\s*submittedPayload\s*\))/);
  const successfulClose = submitRegion.indexOf("handleClose();");
  if (awaitedSubmit < 0 || successfulClose < 0 || successfulClose < awaitedSubmit) {
    failures.push("QuickAssignModal must close only after awaiting a successful submit");
  }
  return failures;
}

const board = fs.readFileSync(boardPath, "utf8");
const modal = fs.readFileSync(modalPath, "utf8");
const failures = verify(board, modal);
if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["swallowed rejection", board.replace("throw error;", "return;")],
    ["missing disclosure", board.replace('userFacingApiError(error, "Quick assign failed")', '"Quick assign failed"')],
  ];
  for (const [name, mutatedBoard] of mutations) {
    if (verify(mutatedBoard, modal).length === 0) {
      console.error(`FAIL: selftest mutation escaped: ${name}`);
      process.exit(1);
    }
  }
  const modalMutations = [
    ["unawaited submit", modal.replace("await submittedOnSubmit(submittedPayload);", "void submittedOnSubmit(submittedPayload);")],
    [
      "close before submit",
      modal.replace(
        "await submittedOnSubmit(submittedPayload);\n            if (scopeGenerationRef.current !== submittedGeneration) return;\n            handleClose();",
        "handleClose();\n            await submittedOnSubmit(submittedPayload);\n            if (scopeGenerationRef.current !== submittedGeneration) return;"
      ),
    ],
  ];
  for (const [name, mutatedModal] of modalMutations) {
    if (verify(board, mutatedModal).length === 0) {
      console.error(`FAIL: selftest mutation escaped: ${name}`);
      process.exit(1);
    }
  }
  const caught = mutations.length + modalMutations.length;
  console.log(`PASS: ${caught}/${caught} planted defects caught`);
}

console.log("PASS: failed dispatch quick assignments stay open with visible error feedback");
