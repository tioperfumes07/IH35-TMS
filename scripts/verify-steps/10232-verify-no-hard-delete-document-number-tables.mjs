/** GO-18 Gap 5 — never hard-DELETE tables that display-id.ts MAX+1 generators read. */
export default {
  name: "verify-no-hard-delete-document-number-tables",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-hard-delete-document-number-tables.mjs"]);
    await ctx.run("node", ["scripts/verify-no-hard-delete-document-number-tables.mjs", "--selftest"]);
  },
};
