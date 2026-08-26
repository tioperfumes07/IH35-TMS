export default {
  name: "verify-form2290-embedded-back-link",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-form2290-embedded-back-link.mjs"]) !== 0) {
      throw new Error("verify-form2290-embedded-back-link failed");
    }
  },
};
