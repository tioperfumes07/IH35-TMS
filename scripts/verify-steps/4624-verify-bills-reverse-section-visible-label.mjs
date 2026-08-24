export default {
  name: "verify-bills-reverse-section-visible-label",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-bills-reverse-section-visible-label.mjs"]) !== 0) {
      throw new Error("verify-bills-reverse-section-visible-label failed");
    }
  },
};
