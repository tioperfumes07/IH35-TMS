export default {
  name: "verify:expenses-cents-and-void-not-delete",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expenses-cents-and-void-not-delete.mjs"]);
  },
};
