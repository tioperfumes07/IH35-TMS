// verify-steps wrapper for scripts/verify-factoring-liability-reserve-column.mjs
// (WAVE-C liability column, factoring sub-fix, verify-step 3209). Static, no DB — same shape as
// verify-steps/3205-*.mjs and siblings.
export default {
  name: "verify-factoring-liability-reserve-column",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-liability-reserve-column.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-liability-reserve-column.mjs"]);
  },
};
