export default {
  name: "verify:fine-create-suggest-load",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fine-create-suggest-load.mjs"]);
  },
};
