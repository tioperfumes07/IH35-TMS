export default {
  name: "verify:wizard-and-reclassify-share-one-writer",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wizard-and-reclassify-share-one-writer.mjs"]);
  },
};
