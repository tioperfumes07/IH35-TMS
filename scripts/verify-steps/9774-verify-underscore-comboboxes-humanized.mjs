export default {
  name: "verify-underscore-comboboxes-humanized",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-underscore-comboboxes-humanized.mjs"]) !== 0) {
      throw new Error("verify-underscore-comboboxes-humanized failed");
    }
  },
};
