// verify-steps wrapper for scripts/verify-home-create-actions-chrome-law.mjs
// (WAVE 2 home item-8 chrome-law audit per INBOX-CC-3.md "NO LEFTOVERS" correction: home's
// QboStyleHomePage.tsx CREATE_ACTIONS quick-buttons were bare verbs with no "+ " prefix, one used
// the forbidden "Add" verb — relabeled to match each destination page's own canonical create-button
// text), verify-step 4187, Rule 37 claim-then-author pattern (claim shipped in #13414). Static, no
// DB — same shape as sibling verify-steps/*.mjs files.
export default {
  name: "verify-home-create-actions-chrome-law",
  run(ctx) {
    ctx.run("node", ["scripts/verify-home-create-actions-chrome-law.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-home-create-actions-chrome-law.mjs"]);
  },
};
