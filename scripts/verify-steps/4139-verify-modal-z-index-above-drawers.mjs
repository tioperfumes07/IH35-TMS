export default {
  name: "verify:modal-z-index-above-drawers",
  run(ctx) {
    ctx.run("node", ["scripts/verify-modal-z-index-above-drawers.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-modal-z-index-above-drawers.mjs"]);
  },
};
