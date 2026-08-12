// verify-steps wrapper for scripts/verify-liability-column-wave.mjs
// (WAVE-C liability column-wave, verify-step 3197). Static, no DB — same shape as
// verify-steps/3193-*.mjs and siblings.
export default {
  name: "verify-liability-column-wave",
  run(ctx) {
    ctx.run("node", ["scripts/verify-liability-column-wave.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-liability-column-wave.mjs"]);
  },
};
