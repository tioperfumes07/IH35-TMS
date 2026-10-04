export default {
  name: "verify:wo-line-void-not-delete",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-line-void-not-delete.mjs"]);
  },
};
