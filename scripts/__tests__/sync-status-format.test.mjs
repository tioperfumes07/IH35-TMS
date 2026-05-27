import assert from "node:assert/strict";
import { test } from "node:test";

import { formatSyncStatus } from "../sync-status-format.mjs";

test("renders status block with required sections", () => {
  const text = formatSyncStatus({
    timestamp: "2026-05-26T00:00:00.000Z",
    branch: "feat/test",
    head: "abc1234",
    workingTree: "clean",
    mainHead: "def5678 (LIVE)",
    branchVsMain: "1 ahead, 0 behind, 0 merge commits",
    openPr: "#1 (open)",
    env: { GITHUB_BASE_SHA: "unset", GH_CLI: "missing" },
    blockContext: "BLOCK 02.5",
    nextBlocks: "03, 04, 05",
    recommendedNext: "npm run branch:precheck-push",
  });
  assert.match(text, /SYNC REPORT/);
  assert.match(text, /Branch:/);
  assert.match(text, /Env:/);
  assert.match(text, /RECOMMENDED NEXT:/);
});
