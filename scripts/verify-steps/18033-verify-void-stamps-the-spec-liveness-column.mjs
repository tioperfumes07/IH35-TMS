export default {
  name: "verify:void-stamps-the-spec-liveness-column",
  run(ctx) {
    ctx.run("node", ["scripts/verify-void-stamps-the-spec-liveness-column.mjs"]);
  },
};
