export default {
  name: "verify:complaints-creator",
  run(ctx) {
    ctx.run("node", ["scripts/verify-complaints-creator.mjs"]);
  },
};
