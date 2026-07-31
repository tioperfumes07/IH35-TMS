// LST-PICKER-01 PostingTemplateModal default class inline create (claim 1892).
export default {
  name: "verify-lst-picker01-posting-template-class-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-posting-template-class-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-posting-template-class-inline-create.mjs"]);
  },
};
