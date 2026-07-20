export default {
  name: "verify:insurance-pageheader-usage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-pageheader-usage.mjs"]);
  },
};
