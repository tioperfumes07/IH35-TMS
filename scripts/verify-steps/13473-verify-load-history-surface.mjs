export default {
  name: "verify:load-history-surface",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-history-surface.mjs"]);
  },
};
