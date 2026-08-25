export default {
  name: "verify-quickcreate-workorder-title-cased",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-quickcreate-workorder-title-cased.mjs"]) !== 0) {
      throw new Error("verify-quickcreate-workorder-title-cased failed");
    }
  },
};
