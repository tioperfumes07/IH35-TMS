// verify-steps wrapper for scripts/verify-factoring-liability-invoice-gl-wired.mjs
// (WAVE 1 factoring money — invoice/liability/gl_je cluster, verify-step 4154). Static, no DB — same
// shape as verify-steps/4153-*.mjs and siblings.
export default {
  name: "verify-factoring-liability-invoice-gl-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-liability-invoice-gl-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-liability-invoice-gl-wired.mjs"]);
  },
};
