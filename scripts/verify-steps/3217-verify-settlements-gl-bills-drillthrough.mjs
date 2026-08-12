// verify-steps wrapper for scripts/verify-settlements-gl-bills-drillthrough.mjs
// (WAVE-C settlements ap_bill+gl_je, verify-step 3217). Static, no DB — same shape as
// verify-steps/3213-*.mjs and siblings.
export default {
  name: "verify-settlements-gl-bills-drillthrough",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlements-gl-bills-drillthrough.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlements-gl-bills-drillthrough.mjs"]);
  },
};
