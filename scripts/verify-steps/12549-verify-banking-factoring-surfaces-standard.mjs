export default {
  name: "verify:banking-factoring-surfaces-standard",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-factoring-surfaces-standard.mjs"]);
  },
};
