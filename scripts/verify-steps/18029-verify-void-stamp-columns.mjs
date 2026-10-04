export default {
  name: "verify:void-stamp-columns",
  run(ctx) {
    ctx.run("node", ["scripts/verify-void-stamp-columns.mjs"]);
  },
};
