export default {
  name: "verify:all-posting-paths-gated",
  run(ctx) {
    ctx.run("node", ["scripts/verify-all-posting-paths-gated.mjs"]);
  },
};
