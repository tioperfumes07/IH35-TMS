export default {
  name: "verify:no-live-duplicate-documents",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-live-duplicate-documents.mjs"]);
  },
};
