export default {
  name: "94-live-counter-linkage",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-94-live-counter-linkage.mjs"]) !== 0) {
      throw new Error("verify:94-live-counter-linkage failed");
    }
  },
};
