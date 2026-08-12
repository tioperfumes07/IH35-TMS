// verify-steps wrapper for scripts/verify-ap-bill-column-wave.mjs
// (WAVE-C ap_bill column-wave, verify-step 3205). Static, no DB — same shape as
// verify-steps/3201-*.mjs and siblings.
export default {
  name: "verify-ap-bill-column-wave",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ap-bill-column-wave.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ap-bill-column-wave.mjs"]);
  },
};
