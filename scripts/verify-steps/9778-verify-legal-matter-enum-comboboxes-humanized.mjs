export default {
  name: "verify-legal-matter-enum-comboboxes-humanized",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-legal-matter-enum-comboboxes-humanized.mjs"]) !== 0) {
      throw new Error("verify-legal-matter-enum-comboboxes-humanized failed");
    }
  },
};
