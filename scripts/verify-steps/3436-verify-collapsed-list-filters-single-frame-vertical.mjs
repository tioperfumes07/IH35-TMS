// CLS-BOX-IN-BOX — collapsed list-filter toolbar single-frame vertical class (Codex claim 3436).
export default {
  name: "verify-collapsed-list-filters-single-frame-vertical",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-collapsed-list-filters-single-frame-vertical.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-collapsed-list-filters-single-frame-vertical.mjs"]);
  },
};
