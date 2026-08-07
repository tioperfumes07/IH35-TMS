// verify-create-unit-modal-outside-entitypicker — §9.0 item 17 pattern sweep
export default {
  name: "verify:create-unit-modal-outside-entitypicker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-create-unit-modal-outside-entitypicker.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-create-unit-modal-outside-entitypicker.mjs"]);
  },
};
