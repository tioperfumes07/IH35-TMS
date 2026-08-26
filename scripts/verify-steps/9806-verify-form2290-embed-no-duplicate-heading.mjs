export default {
  name: "verify-form2290-embed-no-duplicate-heading",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-form2290-embed-no-duplicate-heading.mjs"]) !== 0) {
      throw new Error("verify-form2290-embed-no-duplicate-heading failed");
    }
  },
};
