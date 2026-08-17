/** LV-USERS-CREATE-PICKER-LAW-FALSE-REQUIRED — EVEN Cursor claim 3726 */
export default {
  name: "verify-users-create-picker-applicability",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-users-create-picker-applicability.mjs"]);
  },
};
