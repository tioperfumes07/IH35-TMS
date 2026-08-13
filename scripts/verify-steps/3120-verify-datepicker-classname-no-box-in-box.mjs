/**
 * CLAIMED 3120 — Cursor EVEN — verify-datepicker-classname-no-box-in-box
 */
export default {
  name: "verify-datepicker-classname-no-box-in-box",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-datepicker-classname-no-box-in-box.mjs"]);
  },
};
