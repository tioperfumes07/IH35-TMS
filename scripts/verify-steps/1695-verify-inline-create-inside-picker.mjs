/** LST-PICKER-03 — inline create belongs INSIDE the dropdown; a sibling button is a second place to look. */
export default {
  name: "verify-inline-create-inside-picker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-inline-create-inside-picker.mjs"]);
    await ctx.run("node", ["scripts/verify-inline-create-inside-picker.mjs", "--selftest"]);
  },
};
