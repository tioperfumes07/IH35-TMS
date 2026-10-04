export default {
  name: "verify:entitylink-has-label",
  run(ctx) {
    ctx.run("node", ["scripts/verify-entitylink-has-label.mjs"]);
  },
};
