// verify-steps wrapper for scripts/verify-cash-flow-adjustment-add-chrome-law.mjs
// (WAVE 2 cash-flow item-8 chrome-law audit, found live-verifying /cash-flow per INBOX-CC-3.md's
// "rest of WAVE2" instruction: DailyPredictionTab.tsx's adjustment button rendered a Plus icon +
// "Add" text — visually the forbidden "+ Add" pattern — relabeled to "Create"), verify-step 4191,
// Rule 37 claim-then-author pattern (claim shipped in #13486). Static, no DB — same shape as
// sibling verify-steps/*.mjs files.
export default {
  name: "verify-cash-flow-adjustment-add-chrome-law",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-adjustment-add-chrome-law.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cash-flow-adjustment-add-chrome-law.mjs"]);
  },
};
