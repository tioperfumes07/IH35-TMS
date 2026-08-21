// verify-steps wrapper for scripts/verify-banking-bare-plus-accessible-label.mjs
// (WAVE 1 banking item-8 chrome-law audit, found live-interacting with /banking per the "next wave
// of chrome verification" instruction: BankingHome.tsx's bare "+" panel-header button had zero
// accessible text, added aria-label="Manage bank accounts"), verify-step 4193, Rule 37
// claim-then-author pattern (claim shipped in #13543). Static, no DB — same shape as sibling
// verify-steps/*.mjs files.
export default {
  name: "verify-banking-bare-plus-accessible-label",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-bare-plus-accessible-label.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-bare-plus-accessible-label.mjs"]);
  },
};
