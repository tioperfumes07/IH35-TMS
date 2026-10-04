export default {
  name: "verify:b2-je-line-r-after-finish",
  run(ctx) {
    ctx.run("node", ["scripts/verify-b2-je-line-r-after-finish.mjs"]);
  },
};
