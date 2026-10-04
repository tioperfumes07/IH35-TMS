export default {
  name: "verify:status-bar-height-at-mobile",
  run(ctx) {
    ctx.run("node", ["scripts/verify-status-bar-height-at-mobile.mjs"]);
  },
};
