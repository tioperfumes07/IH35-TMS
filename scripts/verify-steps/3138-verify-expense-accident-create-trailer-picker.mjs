/** Cursor EVEN · claim 3138 on main before this file (#6325). */
export default {
  name: "verify-expense-accident-create-trailer-picker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-expense-accident-create-trailer-picker.mjs"]);
  },
};
