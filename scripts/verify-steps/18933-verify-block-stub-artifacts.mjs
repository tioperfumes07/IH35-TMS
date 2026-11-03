export default {
  name: "verify:block-stub-artifacts",
  run(ctx) {
    ctx.run("node", ["scripts/verify-block-stub-artifacts.mjs"]);
  },
};
