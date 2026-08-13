/** Cursor EVEN · claim 3142 on main before this file (#6331). */
export default {
  name: "verify-expense-detail-trailer-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-expense-detail-trailer-link.mjs"]);
  },
};
