export default {
  name: "verify:reclassify-batches-are-whole",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reclassify-batches-are-whole.mjs"]);
  },
};
