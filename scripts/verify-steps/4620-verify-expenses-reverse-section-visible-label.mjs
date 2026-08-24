export default {
  name: "verify-expenses-reverse-section-visible-label",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-expenses-reverse-section-visible-label.mjs"]) !== 0) {
      throw new Error("verify-expenses-reverse-section-visible-label failed");
    }
  },
};
