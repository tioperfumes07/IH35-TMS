// verify-steps wrapper for scripts/verify-settlements-liability-forward-link.mjs
// (WAVE-C liability column, settlements forward-direction fix, verify-step 3213). Static, no DB —
// same shape as verify-steps/3209-*.mjs and siblings.
export default {
  name: "verify-settlements-liability-forward-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlements-liability-forward-link.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlements-liability-forward-link.mjs"]);
  },
};
