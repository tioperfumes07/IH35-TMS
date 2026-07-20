export default {
  name: "verify:block-status-overrides-downgrade-only",
  run(ctx) {
    // Selftest first: proves the guard still BITES before we trust a green run.
    ctx.run("node", ["scripts/verify-block-status-overrides-downgrade-only.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-block-status-overrides-downgrade-only.mjs"]);
  },
};
