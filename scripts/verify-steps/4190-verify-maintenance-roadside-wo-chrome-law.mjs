// verify-steps wrapper for scripts/verify-maintenance-roadside-wo-chrome-law.mjs
// (WAVE 2 maintenance item-8 chrome-law audit, found live-verifying /maintenance per
// INBOX-CC-3.md's "rest of WAVE2" instruction: 2 real "+ Roadside WO" create buttons had no verb
// at all, relabeled to "+ Create Roadside WO"), verify-step 4190, Rule 37 claim-then-author
// pattern (claim shipped in #13481). Static, no DB — same shape as sibling verify-steps/*.mjs files.
export default {
  name: "verify-maintenance-roadside-wo-chrome-law",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-roadside-wo-chrome-law.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-maintenance-roadside-wo-chrome-law.mjs"]);
  },
};
