export default {
  name: "verify:banking-categorize-ux-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-categorize-ux-honesty.mjs"]);
  },
};
