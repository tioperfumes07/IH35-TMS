import assert from "node:assert/strict";
import { test } from "node:test";

import { decideFlow, isFeatureBranch, parseCommitMessage } from "../block-ship.mjs";

test("refuses main branch as feature branch", () => {
  assert.equal(isFeatureBranch("main"), false);
  assert.equal(isFeatureBranch("feat/x"), true);
});

test("parses commit message after -- separator", () => {
  const msg = parseCommitMessage(["--", "feat:", "hello"]);
  assert.equal(msg, "feat: hello");
});

test("decision tree handles merged, behind, dirty, clean", () => {
  assert.equal(decideFlow({ mergedUpstream: true, behind: 0, dirtyCount: 0 }), "already-merged");
  assert.equal(decideFlow({ mergedUpstream: false, behind: 2, dirtyCount: 0 }), "behind");
  assert.equal(decideFlow({ mergedUpstream: false, behind: 0, dirtyCount: 1 }), "dirty");
  assert.equal(decideFlow({ mergedUpstream: false, behind: 0, dirtyCount: 0 }), "verify-push");
});
