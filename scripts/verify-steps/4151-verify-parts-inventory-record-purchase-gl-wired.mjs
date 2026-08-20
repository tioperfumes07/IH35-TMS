// verify-steps wrapper for scripts/verify-parts-inventory-record-purchase-gl-wired.mjs
// (WAVE 2 maintenance money — parts-purchase GL, verify-step 4151). Static, no DB — same shape as
// verify-steps/4150-*.mjs and siblings.
export default {
  name: "verify-parts-inventory-record-purchase-gl-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-parts-inventory-record-purchase-gl-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-parts-inventory-record-purchase-gl-wired.mjs"]);
  },
};
