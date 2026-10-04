export default {
  name: "verify:insurance-expiry-company-date",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-expiry-company-date.mjs"]);
  },
};
