export default {
  name: "entitylink-deep-links",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-entitylink-deep-links.mjs"]) !== 0) {
      throw new Error("verify:entitylink-deep-links failed");
    }
  },
};
