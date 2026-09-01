export default {
  name: "verify-upl01-entity-document-upload",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-upl01-entity-document-upload.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-upl01-entity-document-upload.mjs"]);
  },
};
