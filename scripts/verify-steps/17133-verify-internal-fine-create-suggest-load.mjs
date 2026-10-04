export default {
  name: "verify:internal-fine-create-suggest-load",
  run(ctx) {
    ctx.run("node", ["scripts/verify-internal-fine-create-suggest-load.mjs"]);
  },
};
