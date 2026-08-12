// verify-steps wrapper for scripts/verify-gl-je-column-wave.mjs
// (WAVE-C gl_je column-wave, verify-step 3193). Static, no DB — same shape as
// verify-steps/3185-*.mjs and siblings.
export default {
  name: "verify-gl-je-column-wave",
  run(ctx) {
    ctx.run("node", ["scripts/verify-gl-je-column-wave.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-gl-je-column-wave.mjs"]);
  },
};
