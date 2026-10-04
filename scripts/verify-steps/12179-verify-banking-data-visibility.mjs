export default {
  name: "verify:banking-data-visibility",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-data-visibility.mjs"]);
  },
};
